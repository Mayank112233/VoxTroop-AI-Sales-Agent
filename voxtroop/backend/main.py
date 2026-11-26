import hashlib
import json
import os
import re
from collections import Counter
from threading import Lock
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from backend.agent import build_graph
from backend.api import router
from backend.booking import router as booking_router
from backend.booking import suggestions
from backend.config import DEMO
from backend.db import Business, initialize
from backend.knowledge import DEMO_KNOWLEDGE, Knowledge
from backend.voice import router as voice_router
from backend.widget import router as widget_router

load_dotenv()


def required(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Configure {name} for live AI mode")
    return value


def create_app(data_dir=None):
    root = Path(data_dir or os.getenv("DATA_DIR", "runtime"))

    @asynccontextmanager
    async def lifespan(app):
        mock = os.getenv("MOCK_AI_MODE", "true").lower() == "true"
        root.mkdir(parents=True, exist_ok=True)
        engine = create_engine(f"sqlite:///{(root / 'voxtroop.db').as_posix()}")
        knowledge = None
        fallback_knowledge = None
        try:
            initialize(engine)
            app.state.engine = engine
            tokens = json.loads(os.getenv("TENANT_TOKEN_HASHES") or "{}")
            if not isinstance(tokens, dict) or any(
                not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value)
                for value in tokens.values()
            ):
                raise RuntimeError("TENANT_TOKEN_HASHES must map workspace IDs to SHA-256 hex digests")
            app.state.tenant_tokens = tokens
            app.state.widget_rate = (Lock(), Counter())
            app.state.mode = "mock" if mock else "live"
            app.state.fallback_graph = None
            app.state.primary_provider = "mock"
            app.state.primary_model = None
            app.state.fallback_model = None
            embeddings = None
            llm = None
            store = f"qdrant-{app.state.mode}"
            if not mock:
                provider = os.getenv("AI_PROVIDER", "openai").strip().lower()
                if provider == "gemini":
                    key = required("GEMINI_API_KEY")
                    base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
                    embedding_model = os.getenv("GEMINI_EMBEDDING_MODEL") or "gemini-embedding-001"
                    embeddings = OpenAIEmbeddings(
                        model=embedding_model, api_key=key, base_url=base_url,
                        check_embedding_ctx_length=False, chunk_size=32,
                        model_kwargs={"encoding_format": "float"},
                    )
                    llm = ChatOpenAI(
                        model=os.getenv("GEMINI_MODEL") or os.getenv("GEMINI_CHAT_MODEL") or "gemini-4-hydrogen",
                        api_key=key, base_url=base_url, use_responses_api=False,
                        timeout=30, max_retries=1,
                    )
                    model_id = hashlib.sha256(embedding_model.encode()).hexdigest()[:16]
                    store = f"qdrant-gemini-{model_id}"
                elif provider == "openai":
                    required("OPENAI_API_KEY")
                    embeddings = OpenAIEmbeddings(model=required("OPENAI_EMBEDDING_MODEL"))
                    llm = ChatOpenAI(model=required("OPENAI_CHAT_MODEL"), timeout=30, max_retries=1)
                else:
                    raise RuntimeError("AI_PROVIDER must be openai or gemini")
                app.state.primary_provider = provider
                app.state.primary_model = llm.model_name
            knowledge = Knowledge(root / store, embeddings)
            app.state.knowledge = knowledge
            def available_slots(business, config):
                return suggestions(engine, business, config)

            app.state.graph = build_graph(knowledge, llm, available_slots)
            if not mock and provider == "gemini" and all(
                os.getenv(name) for name in ("OPENAI_API_KEY", "OPENAI_CHAT_MODEL", "OPENAI_EMBEDDING_MODEL")
            ):
                fallback_embeddings = OpenAIEmbeddings(model=required("OPENAI_EMBEDDING_MODEL"))
                fallback_llm = ChatOpenAI(model=required("OPENAI_CHAT_MODEL"), timeout=30, max_retries=1)
                fallback_knowledge = Knowledge(root / "qdrant-live", fallback_embeddings)
                app.state.fallback_graph = build_graph(fallback_knowledge, fallback_llm, available_slots)
                app.state.fallback_model = fallback_llm.model_name
            with Session(engine) as db:
                existing = {item.id: item for item in db.scalars(select(Business))}
                for business, config in DEMO.items():
                    if business not in existing:
                        db.add(Business(id=business, config=config.model_dump()))
                        if mock:
                            knowledge.ingest(business, f"{business}-demo.txt", DEMO_KNOWLEDGE[business])
                    elif "consultation_fields" not in existing[business].config:
                        existing[business].config = existing[business].config | {
                            "consultation_fields": config.model_dump()["consultation_fields"]
                        }
                db.commit()
            yield
        finally:
            if fallback_knowledge:
                fallback_knowledge.client.close()
            if knowledge:
                knowledge.client.close()
            engine.dispose()

    app = FastAPI(title="VoxTroop", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")],
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(router)
    app.include_router(booking_router)
    app.include_router(voice_router)
    app.include_router(widget_router)

    @app.get("/health")
    def health():
        return {"status": "ok", "mode": app.state.mode}

    return app


app = create_app()
