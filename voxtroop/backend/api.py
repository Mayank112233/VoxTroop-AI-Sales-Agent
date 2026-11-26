import hashlib
import hmac
import os
import re
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, UploadFile
from langchain_core.exceptions import OutputParserException
from openai import OpenAIError
from pydantic import BaseModel, Field
from pypdf.errors import PdfReadError
from sqlalchemy import select, text
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from backend.agent import controlled_error, score
from backend.config import BusinessConfig
from backend.db import Appointment, Business, Conversation, Lead, now, uid
from backend.knowledge import extract_text


def admin(request: Request, authorization: str = Header(default="")):
    secret = os.getenv("ADMIN_TOKEN", "")
    if secret and hmac.compare_digest(authorization.encode(), f"Bearer {secret}".encode()):
        return None
    token = authorization.removeprefix("Bearer ")
    if token == authorization or len(token) < 32:
        raise HTTPException(401, "Enter the configured console token")
    digest = hashlib.sha256(token.encode()).hexdigest()
    for business, expected in request.app.state.tenant_tokens.items():
        if hmac.compare_digest(digest, expected):
            scope = request.path_params.get("business")
            if scope == business or (request.method == "GET" and request.url.path == "/api/businesses"):
                return business
            raise HTTPException(403, "This token does not grant access to that workspace")
    raise HTTPException(401, "Enter the configured console token")

def database(request: Request):
    with Session(request.app.state.engine) as db:
        yield db


def row(model):
    return {column.name: getattr(model, column.name) for column in model.__table__.columns}


def owned(db, model, business, identifier):
    record = db.get(model, identifier)
    if not record or record.business != business:
        raise HTTPException(404, "Record not found")
    return record


def tenant(business: str, db: Session = Depends(database)):
    record = db.get(Business, business)
    if not record:
        raise HTTPException(404, "Business not found")
    return record


class Chat(BaseModel):
    message: str = Field(min_length=1, max_length=3000, pattern=r"\S")
    session: str | None = None


router = APIRouter(prefix="/api", dependencies=[Depends(admin)])


@router.get("/businesses")
def businesses(db: Session = Depends(database), scope: str | None = Depends(admin)):
    query = select(Business).order_by(Business.id)
    if scope is not None:
        query = query.where(Business.id == scope)
    return [row(item) for item in db.scalars(query)]


@router.post("/businesses", status_code=201)
def create_business(config: BusinessConfig, db: Session = Depends(database)):
    item = Business(id=uuid4().hex, config=config.model_dump())
    db.add(item)
    db.commit()
    return row(item)


@router.put("/businesses/{business}")
def update_business(config: BusinessConfig, item: Business = Depends(tenant), db: Session = Depends(database)):
    item.config = config.model_dump()
    db.commit()
    return row(item)


def save_lead(db, business, profile):
    email = profile.get("email", "")
    if not email:
        return None
    existing = db.scalar(select(Lead).where(Lead.business == business, Lead.email == email))
    lead_id = existing.id if existing else uid()
    lead_profile = (existing.profile | profile) if existing else profile
    lead_points, lead_reasons = score(lead_profile)
    query = insert(Lead).values(id=lead_id, business=business, email=email, profile=lead_profile,
                                score=lead_points, reasons=lead_reasons, status="new")
    db.execute(query.on_conflict_do_update(
        index_elements=["business", "email"],
        set_={"profile": lead_profile, "score": lead_points, "reasons": lead_reasons},
    ))
    return lead_id


def run_turn(request, db, item, body, conversation):
    history = conversation.messages if conversation else []
    profile = conversation.profile if conversation else {}
    booking_contact = profile.get("booking_contact")
    pending = conversation.pending if conversation else None
    offered = conversation.intelligence.get("appointment_slots", []) if conversation else []
    state = {
        "booking_pending": bool(pending),
        "booking_approval": bool(conversation and conversation.approval_requested),
        "booking_completed": bool(conversation and db.scalar(select(Appointment.id).where(
            Appointment.business == item.id, Appointment.conversation == conversation.id
        ))),
        "booking_offered": bool(offered),
        "business": item.id, "config": item.config, "message": body.message,
        "history": history[-12:], "profile": {key: value for key, value in profile.items() if key != "booking_contact"},
        "prior_intent": conversation.intelligence.get("intent", "") if conversation else "",
    }
    fallback_used = False
    try:
        result = request.app.state.graph.invoke(state)
    except (OpenAIError, OutputParserException):
        fallback = request.app.state.fallback_graph
        if fallback is None:
            raise HTTPException(502, controlled_error(state, both=False)) from None
        try:
            result = fallback.invoke(state)
        except (OpenAIError, OutputParserException):
            raise HTTPException(502, controlled_error(state, both=True)) from None
        fallback_used = True
    if conversation:
        previous = conversation.updated
        db.expire(conversation)
        db.execute(text("BEGIN IMMEDIATE"))
        if conversation.updated != previous:
            raise HTTPException(409, "Conversation changed. Retry your message.")
    else:
        db.execute(text("BEGIN IMMEDIATE"))
        conversation = Conversation(business=item.id)
        db.add(conversation)

    profile = result["profile"]
    points, reasons = result["points"], result["reasons"]
    assessment = result["assessment"]
    recommendations = result.get("recommendations", [])
    follow_up = result.get("follow_up", "")
    conversation.messages = history + [
        {"role": "user", "content": body.message},
        {"role": "assistant", "content": result["reply"],
         "recommendations": recommendations, "follow_up": follow_up},
    ]
    conversation.profile = profile | ({"booking_contact": booking_contact} if booking_contact else {})
    if assessment["intent"] == "appointment_cancel" and not conversation.approval_requested:
        conversation.pending = None
        offered = []
    elif assessment["intent"] in {"appointment_request", "appointment_confirmation"} and "slots" in result:
        offered = result["slots"]
    conversation.intelligence = {
        "appointment_slots": offered,
        **{key: assessment[key] for key in ("language", "sentiment", "objection", "summary", "intent")},
        "sources": [{key: source[key] for key in ("source", "chunk", "score") if key in source}
                    for source in result.get("sources", [])],
        "recommendations": recommendations, "follow_up": follow_up,
        "primary_provider": request.app.state.primary_provider,
        "actual_provider": "openai" if fallback_used else request.app.state.primary_provider,
        "model": result.get("response_model") or (
            request.app.state.fallback_model if fallback_used else request.app.state.primary_model
        ),
        "response_generated": result.get("generated", False),
        "fallback_used": fallback_used,
        "route": next((step for step in result["trace"] if step in {"retrieve", "suggest_slots"}), "qualify"),
        "trace": (["gemini_failed_openai_fallback"] if fallback_used else []) + result["trace"], "slots": result.get("slots", []),
    }
    conversation.updated = now()
    save_lead(db, item.id, profile)
    db.commit()
    return {"session": conversation.id, "reply": result["reply"], "score": points,
            "reasons": reasons, **conversation.intelligence}


@router.post("/{business}/chat")
def chat(body: Chat, request: Request, item: Business = Depends(tenant), db: Session = Depends(database)):
    conversation = owned(db, Conversation, item.id, body.session) if body.session else None
    return run_turn(request, db, item, body, conversation)


@router.get("/{business}/knowledge")
def documents(request: Request, item: Business = Depends(tenant)):
    return request.app.state.knowledge.documents(item.id)


@router.post("/{business}/knowledge", status_code=201)
def upload(file: UploadFile, request: Request, item: Business = Depends(tenant)):
    content = file.file.read(5_000_001)
    if len(content) > 5_000_000:
        raise HTTPException(413, "File exceeds 5 MB")
    name = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1][:150]
    try:
        document = request.app.state.knowledge.ingest(item.id, name, extract_text(name, content))
    except (ValueError, PdfReadError) as error:
        raise HTTPException(422, "Unable to index this document") from error
    return {"id": document}


@router.delete("/{business}/knowledge/{document}", status_code=204)
def delete_document(document: str, request: Request, item: Business = Depends(tenant)):
    if not re.fullmatch(r"[0-9a-f]{64}", document):
        raise HTTPException(404, "Document not found")
    request.app.state.knowledge.delete(item.id, document)


@router.get("/{business}/records")
def records(item: Business = Depends(tenant), db: Session = Depends(database)):
    leads = list(db.scalars(select(Lead).where(Lead.business == item.id)))
    conversations = list(db.scalars(select(Conversation).where(Conversation.business == item.id)
                                    .order_by(Conversation.updated.desc())))
    appointments = list(db.scalars(select(Appointment).where(Appointment.business == item.id)
                                   .order_by(Appointment.slot)))
    contacts = {item.id: item.profile.get("booking_contact", {}) for item in conversations}
    return {"leads": list(map(row, leads)), "conversations": list(map(row, conversations)),
            "appointments": [row(appointment) | contacts.get(appointment.conversation, {}) |
                             {"status": "booked"} for appointment in appointments],
            "metrics": {"Conversations": len(conversations), "Leads": len(leads),
                        "Appointments": len(appointments), "Qualified leads": sum(lead.score >= 70 for lead in leads)}}



class LeadStatus(BaseModel):
    status: Literal["new", "contacted", "qualified", "converted", "lost"]


@router.patch("/{business}/leads/{identifier}")
def update_lead(identifier: str, body: LeadStatus, item: Business = Depends(tenant),
                db: Session = Depends(database)):
    lead = owned(db, Lead, item.id, identifier)
    lead.status = body.status
    db.commit()
    return row(lead)
