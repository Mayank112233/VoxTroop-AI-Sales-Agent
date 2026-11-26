import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.api import Chat, database, owned, run_turn, tenant
from backend.booking import WidgetBooking, public_booking
from backend.voice import Speech, speak, transcribe
from backend.db import Business, Conversation

SDK = Path(__file__).resolve().parents[1] / "sdk"
router = APIRouter()


def signature(payload):
    secret = os.getenv("WIDGET_SECRET", "")
    if len(secret) < 32:
        raise HTTPException(503, "Widget session secret is not configured")
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def consume(request, action, limit):
    lock, counter = request.app.state.widget_rate
    bucket = int(time.monotonic() // 60)
    with lock:
        if counter.get("bucket") != bucket:
            counter.clear()
            counter["bucket"] = bucket
        key = (action, request.client.host if request.client else "")
        if counter[action] >= 300 or counter[key] >= limit:
            raise HTTPException(429, "Widget limit reached. Try again shortly.")
        counter[key] += 1
        counter[action] += 1


@router.get("/widget.js", include_in_schema=False)
def loader():
    return FileResponse(SDK / "widget.js", media_type="application/javascript", headers={"Cache-Control": "no-cache"})


@router.get("/widget-frame.js", include_in_schema=False)
def frame_script():
    return FileResponse(SDK / "frame.js", media_type="application/javascript", headers={"Cache-Control": "no-cache"})


@router.get("/widget/{business}", include_in_schema=False)
def frame(item: Business = Depends(tenant)):
    origins = " ".join(item.config["widget_origins"]) or "'none'"
    return FileResponse(SDK / "frame.html", headers={
        "Content-Security-Policy": f"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; "
        f"connect-src 'self'; media-src blob:; frame-ancestors {origins}; base-uri 'none'; form-action 'none'",
        "Cache-Control": "no-store",
    })


@router.get("/widget/{business}/info")
def info(request: Request, item: Business = Depends(tenant)):
    return {"name": item.config["name"], "mode": request.app.state.mode,
            "welcome": item.config.get("widget_welcome", ""), "theme": item.config.get("widget_theme", "green"),
            "timezone": item.config["timezone"], "appointment_label": item.config.get("appointment_label", "Appointment"),
            "appointment_label_hi": item.config.get("appointment_label_hi", "अपॉइंटमेंट")}


@router.post("/widget/{business}/session")
def start(request: Request, item: Business = Depends(tenant), db: Session = Depends(database)):
    if not item.config["widget_origins"] or request.headers.get("origin") != str(request.base_url).rstrip("/"):
        raise HTTPException(403, "Widget unavailable")
    signature("setup")
    consume(request, "start", 12)
    conversation = Conversation(business=item.id)
    db.add(conversation)
    db.flush()
    claims = json.dumps([item.id, conversation.id, int(time.time()) + 1800])
    payload = base64.urlsafe_b64encode(claims.encode()).decode()
    token = f"{payload}.{signature(payload)}"
    db.commit()
    return {"token": token}


def widget_session(item: Business = Depends(tenant), db: Session = Depends(database),
                   authorization: str = Header(default="")):
    payload, _, supplied = authorization.removeprefix("Bearer ").partition(".")
    try:
        if len(payload) > 500 or not hmac.compare_digest(signature(payload).encode(), supplied.encode()):
            raise ValueError()
        business, session, expiry = json.loads(base64.urlsafe_b64decode(payload))
        if business != item.id or expiry <= time.time() or not item.config["widget_origins"]:
            raise ValueError()
    except (ValueError, TypeError) as error:
        raise HTTPException(401, "Invalid widget session") from error
    return owned(db, Conversation, item.id, session)


@router.post("/widget/{business}/chat")
def chat(body: Chat, request: Request, item: Business = Depends(tenant), db: Session = Depends(database),
         conversation: Conversation = Depends(widget_session)):
    if body.session is not None:
        raise HTTPException(401, "Invalid widget session")
    if len(conversation.messages) >= 40:
        raise HTTPException(429, "Widget session turn limit reached")
    consume(request, "chat", 30)
    turn = run_turn(request, db, item, body, conversation)
    return {key: turn[key] for key in ("reply", "recommendations", "follow_up", "slots", "language", "intent")}


@router.post("/widget/{business}/appointment/{action}")
def booking(action: Literal["propose", "confirm", "cancel"], body: WidgetBooking, request: Request,
            item: Business = Depends(tenant), db: Session = Depends(database),
            conversation: Conversation = Depends(widget_session)):
    if not conversation.messages:
        raise HTTPException(409, "Start a sales conversation before requesting an appointment")
    consume(request, "booking", 15)
    return public_booking(action, body, item, conversation.id, db)


@router.post("/widget/{business}/voice/transcribe", dependencies=[Depends(widget_session)])
def widget_transcribe(file: UploadFile, request: Request):
    consume(request, "transcribe", 12)
    return transcribe(file, request)


@router.post("/widget/{business}/voice/speak", dependencies=[Depends(widget_session)])
def widget_speak(body: Speech, request: Request):
    consume(request, "speak", 20)
    return speak(body, request)
