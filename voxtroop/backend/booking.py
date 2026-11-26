import re
from datetime import datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend.api import admin, database, owned, row, save_lead, tenant
from backend.db import Appointment, Business, Conversation, now

router = APIRouter(prefix="/api/{business}/appointments", dependencies=[Depends(admin)])


class Slot(BaseModel):
    slot: datetime


class WidgetBooking(BaseModel):
    slot: datetime | None = None
    name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=254)


def available(db, item, value):
    if value.utcoffset() is None:
        raise HTTPException(422, "Provide a time with a timezone offset")
    local = value.astimezone(ZoneInfo(item.config["timezone"]))
    if (local <= datetime.now(timezone.utc) or local.weekday() >= 5
        or not item.config["opens"] <= local.hour < item.config["closes"]
        or local.minute not in (0, 30) or local.second or local.microsecond):
        raise HTTPException(422, "Choose a future weekday half-hour within business hours")
    slot = value.astimezone(timezone.utc).isoformat()
    if db.scalar(select(Appointment.id).where(Appointment.business == item.id, Appointment.slot == slot)):
        raise HTTPException(409, "Slot is already booked")
    return slot


def suggestions(engine, business, config):
    zone = ZoneInfo(config["timezone"])
    current = datetime.now(timezone.utc)
    local_today = current.astimezone(zone).date()
    with Session(engine) as db:
        booked = set(db.scalars(select(Appointment.slot).where(
            Appointment.business == business, Appointment.slot >= current.isoformat()
        )))
    result = []
    for offset in range(14):
        day = local_today + timedelta(days=offset)
        if day.weekday() >= 5:
            continue
        for half_hour in range(config["opens"] * 2, config["closes"] * 2):
            local = datetime(day.year, day.month, day.day, half_hour // 2,
                             (half_hour % 2) * 30, tzinfo=zone)
            utc = local.astimezone(timezone.utc)
            slot = utc.isoformat()
            if utc > current and utc.astimezone(zone) == local and slot not in booked:
                result.append(slot)
                if len(result) == 3:
                    return result
    return result

def complete(db, item, conversation, slot):
    appointment = Appointment(business=item.id, conversation=conversation.id, slot=slot)
    conversation.pending = None
    conversation.approval_requested = False
    conversation.updated = now()
    db.add(appointment)
    db.commit()
    return row(appointment)


def lock(db, item, session):
    db.execute(text("BEGIN IMMEDIATE"))
    db.refresh(item)
    return owned(db, Conversation, item.id, session)


@router.post("/{session}/propose")
def propose(session: str, body: Slot, item: Business = Depends(tenant), db: Session = Depends(database)):
    conversation = lock(db, item, session)
    if conversation.approval_requested:
        raise HTTPException(409, "Resolve the current approval request first")
    if db.scalar(select(Appointment.id).where(Appointment.conversation == session)):
        raise HTTPException(409, "This conversation already has a booking")
    slot = available(db, item, body.slot)
    conversation.pending = slot
    conversation.updated = now()
    db.commit()
    return {"slot": slot}


@router.post("/{session}/confirm")
def confirm(session: str, body: Slot, item: Business = Depends(tenant), db: Session = Depends(database)):
    conversation = lock(db, item, session)
    return confirm_selection(db, item, conversation, available(db, item, body.slot))


def confirm_selection(db, item, conversation, slot):
    if conversation.pending != slot:
        raise HTTPException(409, "Propose this slot before confirming")
    if item.config["booking_policy"] == "approval" or conversation.approval_requested:
        conversation.approval_requested = True
        conversation.updated = now()
        db.commit()
        return {"slot": slot, "status": "pending_approval"}
    return complete(db, item, conversation, slot)


def public_booking(action, body, item, session, db):
    conversation = lock(db, item, session)
    existing = db.scalar(select(Appointment).where(
        Appointment.business == item.id, Appointment.conversation == session))
    contact = conversation.profile.get("booking_contact", {})
    if existing:
        if action == "confirm" and body.slot and body.slot.utcoffset() is not None and (
            body.slot.astimezone(timezone.utc).isoformat() == existing.slot
        ):
            return {"slot": existing.slot, "status": "booked", "reference": existing.id, "name": contact.get("name", "")}
        raise HTTPException(409, "This conversation already has a booking")
    if action == "cancel":
        conversation.pending = None
        conversation.approval_requested = False
        conversation.profile = {key: value for key, value in conversation.profile.items() if key != "booking_contact"}
        conversation.intelligence = conversation.intelligence | {"appointment_slots": []}
        conversation.updated = now()
        db.commit()
        return {"status": "cancelled"}
    if not body.slot or body.slot.utcoffset() is None:
        raise HTTPException(422, "Select an appointment time")
    selected = body.slot.astimezone(timezone.utc).isoformat()
    if conversation.approval_requested:
        if action == "confirm" and conversation.pending == selected:
            return {"slot": selected, "status": "pending_approval", "name": contact.get("name", "")}
        raise HTTPException(409, "An appointment request is already awaiting approval")
    offered = conversation.intelligence.get("appointment_slots", [])
    if action == "propose" and selected not in offered or action == "confirm" and selected != conversation.pending:
        raise HTTPException(409, "Choose an offered time before confirming")
    try:
        slot = available(db, item, body.slot)
    except HTTPException as error:
        fresh = suggestions(db.get_bind(), item.id, item.config)
        conversation.pending = None
        conversation.intelligence = conversation.intelligence | {"appointment_slots": fresh}
        conversation.updated = now()
        db.commit()
        raise HTTPException(error.status_code, {"message": error.detail, "slots": fresh}) from error
    if action == "propose":
        conversation.pending = slot
        conversation.updated = now()
        db.commit()
        return {"slot": slot, "status": "selected", "name": conversation.profile.get("name", ""),
                "email": conversation.profile.get("email", "")}

    name = (body.name or conversation.profile.get("name") or "").strip()
    email = (body.email or conversation.profile.get("email") or "").strip().lower()
    if not name or len(name) > 120 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(422, "Enter your name and a valid email address")
    profile = {key: value for key, value in conversation.profile.items() if key != "booking_contact"}
    profile.update(name=name, email=email)
    lead_id = save_lead(db, item.id, profile)
    language = conversation.intelligence.get("language")
    label = (item.config.get("appointment_label_hi", "अपॉइंटमेंट") if language == "Hindi"
             else item.config.get("appointment_label", "Appointment"))
    conversation.profile = profile | {"booking_contact": {"name": name, "email": email, "lead_id": lead_id,
                                                           "session_type": label, "timezone": item.config["timezone"]}}
    result = confirm_selection(db, item, conversation, slot)
    outcome = {"slot": result["slot"], "status": result.get("status", "booked"), "name": name}
    if "id" in result:
        outcome["reference"] = result["id"]
    return outcome


@router.post("/{session}/decision/{action}")
def decide(session: str, action: Literal["approve", "reject"], item: Business = Depends(tenant),
           db: Session = Depends(database)):
    conversation = lock(db, item, session)
    if not conversation.approval_requested or not conversation.pending:
        raise HTTPException(409, "No pending approval")
    if action == "approve":
        slot = available(db, item, datetime.fromisoformat(conversation.pending))
        return complete(db, item, conversation, slot)
    conversation.pending = None
    conversation.approval_requested = False
    conversation.updated = now()
    db.commit()
    return {"status": "rejected"}
