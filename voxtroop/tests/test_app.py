from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.main import create_app


def test_foundation(tmp_path, monkeypatch):
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    with TestClient(create_app(tmp_path)) as client:
        assert client.get("/health").json() == {"status": "ok", "mode": "mock"}
        assert client.get("/docs").status_code == 200
        assert (tmp_path / "voxtroop.db").exists()


def test_sales_workflow(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    headers = {"Authorization": "Bearer test-token"}
    with TestClient(create_app(tmp_path), headers=headers) as client:
        assert len(client.get("/api/businesses").json()) == 2
        response = client.post("/api/edunext/chat", json={"message": "What does the Foundation program cost?"})
        assert response.status_code == 200, response.text
        turn = response.json()
        assert "12,000" in turn["reply"]
        assert turn["trace"] == ["assess", "retrieve", "qualify", "respond"]
        session = turn["session"]
        assert client.post("/api/urbanhomes/chat", json={"session": session, "message": "Hi"}).status_code == 404
        response = client.post("/api/edunext/chat", json={
            "session": session, "message": "My name is Maya. I need a course next week. Email maya@example.org.",
        })
        assert response.status_code == 200, response.text
        assert response.json()["score"] == 80
        slot = (datetime.now(timezone.utc) + timedelta(days=7)).replace(hour=5, minute=0, second=0, microsecond=0)
        while slot.weekday() >= 5:
            slot += timedelta(days=1)
        booking = f"/api/edunext/appointments/{session}"
        assert client.post(booking + "/confirm", json={"slot": slot.isoformat()}).status_code == 409
        assert client.post(booking + "/propose", json={"slot": slot.isoformat()}).status_code == 200
        assert client.post(booking + "/confirm", json={"slot": slot.isoformat()}).status_code == 200
        records = client.get("/api/edunext/records").json()
        assert records["metrics"] == {"Conversations": 1, "Leads": 1, "Appointments": 1, "Qualified leads": 1}
        conversation = records["conversations"][0]
        assert len(conversation["messages"]) == 4
        assert "Foundation program" in conversation["intelligence"]["summary"]
        hindi = client.post("/api/edunext/chat", json={
            "session": session, "message": "Mujhe next month join karna hai.",
        }).json()
        assert hindi["language"] == "Hindi"
        assert hindi["score"] == 80


def test_knowledge_isolation(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    with TestClient(create_app(tmp_path), headers={"Authorization": "Bearer test-token"}) as client:
        result = client.post("/api/edunext/knowledge", files={"file": ("policy.txt", "Orchid voucher expires Sunday.")})
        assert result.status_code == 201, result.text
        document = result.json()["id"]
        assertion = {"message": "When does the Orchid voucher expire?"}
        turn = client.post("/api/edunext/chat", json=assertion).json()
        assert "Orchid voucher expires Sunday" in turn["reply"]
        assert "policy.txt" not in turn["reply"]
        assert any(source["source"] == "policy.txt" for source in turn["sources"])
        assert "policy.txt" not in client.post("/api/urbanhomes/chat", json=assertion).json()["reply"]
        assert client.delete(f"/api/urbanhomes/knowledge/{document}").status_code == 204
        assert any(item["id"] == document for item in client.get("/api/edunext/knowledge").json())
        assert client.delete(f"/api/edunext/knowledge/{document}").status_code == 204
        assert all(item["id"] != document for item in client.get("/api/edunext/knowledge").json())


def test_approval_and_slot_conflict(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    with TestClient(create_app(tmp_path), headers={"Authorization": "Bearer test-token"}) as client:
        config = client.get("/api/businesses").json()[0]["config"]
        config["booking_policy"] = "approval"
        assert client.put("/api/businesses/edunext", json=config).status_code == 200
        sessions = [client.post("/api/edunext/chat", json={"message": "Book a consultation"}).json()["session"]
                    for _ in range(2)]
        slot = (datetime.now(timezone.utc) + timedelta(days=7)).replace(hour=5, minute=0, second=0, microsecond=0)
        while slot.weekday() >= 5:
            slot += timedelta(days=1)
        paths = [f"/api/edunext/appointments/{session}" for session in sessions]
        for path in paths:
            assert client.post(path + "/propose", json={"slot": slot.isoformat()}).status_code == 200
            assert client.post(path + "/confirm", json={"slot": slot.isoformat()}).json()["status"] == "pending_approval"
        assert client.get("/api/edunext/records").json()["appointments"] == []
        assert client.post(paths[0] + "/decision/approve").status_code == 200
        assert client.post(paths[1] + "/decision/approve").status_code == 409
        assert client.post(paths[1] + "/decision/reject").status_code == 200


def test_widget_and_scoped_credentials(tmp_path, monkeypatch):
    import hashlib
    import json

    scoped = "tenant-random-test-value-only-123456"
    digest = hashlib.sha256(scoped.encode()).hexdigest()
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    monkeypatch.setenv("WIDGET_SECRET", "widget-test-secret-abcdef0123456789")
    monkeypatch.setenv("TENANT_TOKEN_HASHES", json.dumps({"edunext": digest}))
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    with TestClient(create_app(tmp_path)) as client:
        assert client.get("/api/businesses").status_code == 401
        headers = {"Authorization": "Bearer " + scoped}
        choices = client.get("/api/businesses", headers=headers).json()
        assert [item["id"] for item in choices] == ["edunext"]
        assert client.get("/api/urbanhomes/records", headers=headers).status_code == 403
        config = choices[0]["config"]
        config["widget_origins"] = ["http://localhost:5173"]
        for business in ("edunext", "urbanhomes"):
            assert client.put(f"/api/businesses/{business}", json=config,
                              headers={"Authorization": "Bearer test-token"}).status_code == 200
        assert "frame-ancestors http://localhost:5173" in client.get("/widget/edunext").headers["content-security-policy"]
        assert client.post("/widget/edunext/session", headers={"Origin": "http://other.test"}).status_code == 403
        origin = {"Origin": "http://testserver"}
        token = client.post("/widget/edunext/session", headers=origin).json()["token"]
        widget = {"Authorization": "Bearer " + token}
        message = {"message": "What does the Foundation program cost?"}
        assert client.post("/widget/urbanhomes/chat", headers=widget, json=message).status_code == 401
        assert client.post("/widget/edunext/chat", headers=widget,
                           json={**message, "session": "other"}).status_code == 401
        assert "12,000" in client.post("/widget/edunext/chat", headers=widget, json=message).json()["reply"]
        booking = client.post("/widget/edunext/chat", headers=widget, json={"message": "Book a tour"}).json()
        slot = {"slot": booking["slots"][0]}
        route = "/widget/edunext/appointment/"
        assert client.post(route + "confirm", headers=widget, json=slot).status_code == 409
        assert client.post(route + "propose", headers=widget, json=slot).status_code == 200
        assert client.post(route + "confirm", headers=widget, json=slot).status_code == 422
        details = slot | {"name": "Widget Demo Learner", "email": "widget-learner@example.org"}
        result = client.post(route + "confirm", headers=widget, json=details).json()
        assert result["status"] == "booked"
        assert result["reference"]
        assert client.post(route + "confirm", headers=widget, json=details).json() == result
        records = client.get("/api/edunext/records", headers={"Authorization": "Bearer test-token"}).json()
        assert len(records["appointments"]) == records["metrics"]["Appointments"] == 1
        appointment = records["appointments"][0]
        assert appointment["id"] == result["reference"]
        assert appointment["name"] == details["name"]
        assert appointment["lead_id"] == records["leads"][0]["id"]
        assert appointment["conversation"] == records["conversations"][0]["id"]

        assert client.post("/widget/edunext/voice/speak", headers=widget, json={"text": "Hello"}).status_code == 503
        assert client.get("/api/edunext/records", headers=widget).status_code == 401
        assert client.post("/api/edunext/voice/speak", headers=headers,
                           json={"text": "Hello"}).status_code == 503


def test_gemini_startup_does_not_require_openai_key(tmp_path, monkeypatch):
    monkeypatch.setenv("MOCK_AI_MODE", "false")
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "placeholder-for-offline-test")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    app = create_app(tmp_path)
    with TestClient(app, headers={"Authorization": "Bearer test-token"}) as client:
        assert client.get("/health").json()["mode"] == "live"
        embeddings = app.state.knowledge.embeddings
        assert embeddings.openai_api_base == "https://generativelanguage.googleapis.com/v1beta/openai/"
        assert embeddings.check_embedding_ctx_length is False
        assert list(tmp_path.glob("qdrant-gemini-*"))
        response = client.post("/api/edunext/voice/speak", json={"text": "Hello"})
        assert response.status_code == 503
        assert "OpenAI API key" in response.json()["detail"]


def test_gemini_turn_uses_openai_fallback_once(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import Mock

    from openai import OpenAIError

    monkeypatch.setenv("MOCK_AI_MODE", "true")
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    app = create_app(tmp_path)
    with TestClient(app, headers={"Authorization": "Bearer test-token"}) as client:
        fallback = Mock(wraps=app.state.graph.invoke)
        primary = Mock(side_effect=OpenAIError("synthetic provider failure"))
        app.state.graph = SimpleNamespace(invoke=primary)
        app.state.fallback_graph = SimpleNamespace(invoke=fallback)
        result = client.post("/api/edunext/chat", json={"message": "What does the Foundation program cost?"})
        assert result.status_code == 200, result.text
        assert "12,000" in result.json()["reply"]
        assert result.json()["trace"][0] == "gemini_failed_openai_fallback"
        primary.assert_called_once()
        fallback.assert_called_once_with(primary.call_args.args[0])
        records = client.get("/api/edunext/records").json()
        assert len(records["conversations"]) == 1
        assert len(records["conversations"][0]["messages"]) == 2
        fallback.side_effect = OpenAIError("another synthetic provider failure")
        failed = client.post("/api/edunext/chat", json={"message": "Hello"})
        assert failed.status_code == 502
        assert "synthetic" not in failed.text


def test_original_sales_transcript_and_localized_booking(tmp_path, monkeypatch):
    from unittest.mock import Mock

    from langchain_core.messages import AIMessage

    from backend.agent import Assessment, CustomerFact, build_graph

    monkeypatch.setenv("MOCK_AI_MODE", "true")
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    app = create_app(tmp_path)
    with TestClient(app, headers={"Authorization": "Bearer test-token"}) as client:
        llm = Mock()
        llm.with_structured_output.return_value.invoke.side_effect = [
            Assessment(intent="appointment_request", booking_request="Hi, I want to buy a data scientist course.",
                       language="English", need="data scientist course", sentiment="neutral", summary="Purchase interest"),
            Assessment(intent="recommendation", language="English", sentiment="neutral", summary="Asked for advice"),
            Assessment(intent="language_preference", language="English", preferred_language="Hindi",
                       sentiment="neutral", summary="Requested Hindi"),
            Assessment(intent="recommendation", language="Hindi", sentiment="neutral", summary="Asked in Hindi",
                       facts=[CustomerFact(field="background", value="Data science student")]),
            Assessment(intent="qualification", language="English", sentiment="neutral", summary="Shared goals and skills",
                       facts=[CustomerFact(field="career_goal", value="Build AI applications"),
                              CustomerFact(field="skills", value="Python")],
                       query="Generative AI program for data science student with Python skills"),
            Assessment(intent="product_inquiry", language="English", sentiment="neutral", summary="Unsupported offer",
                       query="zzzk qqqww xxxyyy"),
            Assessment(intent="appointment_request", language="English", sentiment="neutral", summary="Asked to book",
                       booking_request="Book a counselling appointment"),
            Assessment(intent="appointment_confirmation", language="English", sentiment="neutral",
                       summary="Asked to confirm"),
        ]
        llm.invoke.side_effect = [
            AIMessage(content="I can help you explore course options."),
            AIMessage(content="What are you studying, and what is your career goal?"),
            AIMessage(content="आपका लक्ष्य क्या है और आपको कौन-से कौशल आते हैं?"),
            AIMessage(content="पायथन की जानकारी के आधार पर जनरेटिव एआई कार्यक्रम देखें। [edunext-demo.txt]",
                      response_metadata={"model_name": "simulated-model"}),
        ]
        availability = Mock(return_value=["2099-01-01T10:00:00+00:00"])
        app.state.graph = build_graph(app.state.knowledge, llm, availability)
        app.state.primary_provider = "gemini"
        app.state.primary_model = "configured-model"
        session = None

        def send(message):
            nonlocal session
            response = client.post("/api/edunext/chat", json={"message": message, "session": session})
            assert response.status_code == 200, response.text
            payload = response.json()
            session = payload["session"]
            return payload

        purchase = send("Hi, I want to buy a data scientist course.")
        assert purchase["route"] == "qualify" and purchase["slots"] == []
        advice = send("and just before appointment I would like to find out what is the suitable course for me")
        assert advice["intent"] == "recommendation" and "studying" in advice["reply"]
        assert send("Would you talk to me in Hindi?")["language"] == "Hindi"
        hindi = send("मैं एक डेटा साइंस के स्टुडेंट हूँ, मेरे लिए कौन सा कोर्स सही रहेगा?")
        assert "लक्ष्य" in hindi["reply"]
        clarification = llm.invoke.call_args.args[0][1][1]
        assert '"background": "Data science student"' in clarification
        assert '"key": "background"' not in clarification

        advice = send("I know Python and want to build AI applications.")
        assert advice["language"] == "Hindi" and advice["route"] == "retrieve"
        assert advice["sources"][0]["source"] == "edunext-demo.txt"
        assert advice["primary_provider"] == advice["actual_provider"] == "gemini"
        assert advice["model"] == "simulated-model" and advice["response_generated"]
        unknown = send("zzzk qqqww xxxyyy?")
        assert unknown["sources"] == [] and "पर्याप्त जानकारी नहीं" in unknown["reply"]
        availability.assert_not_called()

        booking = send("Book a counselling appointment")
        assert booking["route"] == "suggest_slots" and booking["slots"]
        assert "पुष्टि" in booking["reply"]
        availability.assert_called_once()
        confirm = send("Confirm the appointment")
        assert confirm["intent"] == "appointment_confirmation" and "समय" in confirm["reply"]
        assert client.get("/api/edunext/records").json()["appointments"] == []
        record = client.get("/api/edunext/records").json()["conversations"][0]
        assert record["profile"]["preferred_language"] == "Hindi"
        assert record["profile"]["skills"] == "Python"



def test_ranked_public_catalogue_and_internal_sources(tmp_path, monkeypatch):
    import json
    from unittest.mock import Mock

    from langchain_core.messages import AIMessage

    from backend.agent import Assessment, build_graph

    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    monkeypatch.setenv("WIDGET_SECRET", "test-widget-secret-1234567890123456")
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    prefix = "/widget/edunext"
    app = create_app(tmp_path)
    admin = {"Authorization": "Bearer test-token"}
    with TestClient(app) as client:
        config = next(item["config"] for item in client.get("/api/businesses", headers=admin).json()
                      if item["id"] == "edunext")
        config["widget_origins"] = ["http://localhost:5174"]
        config["product_label"] = "course"
        config["products"] = [
            {"id": "advanced-ai", "name": "Advanced AI", "details": "Python required; six months.",
             "url": "http://localhost:5174/courses/advanced-ai"},
            {"id": "python", "name": "Python", "details": "Beginner course.", "url": ""},
        ]
        assert client.put("/api/businesses/edunext", headers=admin, json=config).status_code == 200
        config["products"][0]["url"] = "javascript:alert(1)"
        assert client.put("/api/businesses/edunext", headers=admin, json=config).status_code == 422
        llm = Mock()
        llm.with_structured_output.return_value.invoke.return_value = Assessment(
            intent="recommendation", language="Hindi", preferred_language="Hindi",
            sentiment="neutral", summary="Advanced course inquiry", query="Generative AI program Python",
        )
        llm.invoke.return_value = AIMessage(content=json.dumps({
            "message": "**विकल्प** [edunext-demo.txt, chunk 1]",
            "products": [
                {"id": "advanced-ai", "reason": "आपकी Python की जानकारी के आधार पर।", "url": "https://invalid.example/"},
                {"id": "invented-home", "reason": "Do not include."},
                {"id": "advanced-ai", "reason": "Do not duplicate."},
                {"id": "python"},
            ],
            "follow_up": "क्या आप दोनों की तुलना करना चाहेंगे?",
        }))
        availability = Mock(return_value=[])
        app.state.graph = build_graph(app.state.knowledge, llm, availability)
        token = client.post(prefix + "/session", headers={"Origin": "http://testserver"}).json()["token"]
        widget = {"Authorization": "Bearer " + token}
        response = client.post(prefix + "/chat", headers=widget, json={"message": "मेरे लिए कौन सा कोर्स सही है?"})
        assert response.status_code == 200
        turn = response.json()
        assert set(turn) == {"reply", "recommendations", "follow_up", "slots", "intent", "language"}
        assert turn["reply"] == "**विकल्प**"
        assert [product["id"] for product in turn["recommendations"]] == ["advanced-ai", "python"]
        assert turn["recommendations"][0]["url"] == "http://localhost:5174/courses/advanced-ai"
        assert not turn["recommendations"][1]["url"]
        assert turn["follow_up"].endswith("?")
        assert not turn["slots"]
        availability.assert_not_called()
        system, context = llm.invoke.call_args.args[0]
        assert "rank two to four relevant options" in system[1]
        data = json.loads(context[1])
        assert data["language"] == "Hindi"
        assert data["catalogue"][0]["id"] == "advanced-ai"
        assert "url" not in data["catalogue"][0]
        record = client.get("/api/edunext/records", headers=admin).json()["conversations"][0]
        assert record["intelligence"]["sources"][0]["source"] == "edunext-demo.txt"
        assert record["messages"][-1]["recommendations"] == turn["recommendations"]
        assert client.get("/api/urbanhomes/records", headers=admin).json()["conversations"] == []
        llm.with_structured_output.return_value.invoke.return_value = Assessment(
            intent="appointment_confirmation", language="English", sentiment="neutral", summary="Decline",
        )
        declined = client.post(prefix + "/chat", headers=widget,
                               json={"message": "No thank you, I do not want to book a counselling appointment."}).json()
        assert declined["reply"] == "ठीक है।"
        assert not declined["slots"]
        availability.assert_not_called()


def test_widget_booking_context_conflict_and_cancel(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-token")
    monkeypatch.setenv("WIDGET_SECRET", "booking-test-signing-secret-0123456789")
    monkeypatch.setenv("MOCK_AI_MODE", "true")
    admin = {"Authorization": "Bearer test-token"}
    prefix = "/widget/edunext"
    with TestClient(create_app(tmp_path)) as client:
        config = next(item["config"] for item in client.get("/api/businesses", headers=admin).json()
                      if item["id"] == "edunext")
        config["widget_origins"] = ["http://localhost:5174"]
        client.put("/api/businesses/edunext", headers=admin, json=config).raise_for_status()

        def start():
            token = client.post(prefix + "/session", headers={"Origin": "http://testserver"}).json()["token"]
            return {"Authorization": "Bearer " + token}

        def chat(auth, message):
            return client.post(prefix + "/chat", headers=auth, json={"message": message}).raise_for_status().json()

        first, second = start(), start()
        assert chat(first, "yes")["slots"] == []
        offered = chat(first, "Yes, I want to build an appointment.")
        assert offered["intent"] == "appointment_request" and offered["slots"]
        assert chat(first, "yes")["slots"]
        assert chat(second, "Can I talk to an advisor?")["slots"]
        slot = {"slot": offered["slots"][0]}
        for auth in (first, second):
            assert client.post(prefix + "/appointment/propose", headers=auth, json=slot).json()["status"] == "selected"
        assert "selected time" in chat(first, "Confirm the appointment")["reply"]
        assert client.get("/api/edunext/records", headers=admin).json()["appointments"] == []
        body = slot | {"name": "Demo Learner", "email": "demo-learner@example.org"}
        client.post(prefix + "/appointment/confirm", headers=first, json=body).raise_for_status()
        conflict = client.post(prefix + "/appointment/confirm", headers=second, json=body)
        assert conflict.status_code == 409
        replacement = conflict.json()["detail"]["slots"]
        assert replacement and slot["slot"] not in replacement
        next_slot = {"slot": replacement[0]}
        assert client.post(prefix + "/appointment/propose", headers=second, json=next_slot).status_code == 200
        assert client.post(prefix + "/appointment/cancel", headers=second, json={}).json()["status"] == "cancelled"
        assert client.post(prefix + "/appointment/confirm", headers=second, json=body | next_slot).status_code == 409
        assert client.post("/widget/urbanhomes/appointment/cancel", headers=second, json={}).status_code == 401
        records = client.get("/api/edunext/records", headers=admin).json()
        assert records["metrics"]["Appointments"] == len(records["leads"]) == 1
