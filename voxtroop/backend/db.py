from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, ForeignKey, UniqueConstraint, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def uid():
    return uuid4().hex


def now():
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    pass


class Business(Base):
    __tablename__ = "businesses"
    id: Mapped[str] = mapped_column(primary_key=True)
    config: Mapped[dict] = mapped_column(JSON)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    business: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    messages: Mapped[list] = mapped_column(JSON, default=list)
    profile: Mapped[dict] = mapped_column(JSON, default=dict)
    intelligence: Mapped[dict] = mapped_column(JSON, default=dict)
    pending: Mapped[str | None]
    approval_requested: Mapped[bool] = mapped_column(default=False)
    updated: Mapped[str] = mapped_column(default=now)


class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = (UniqueConstraint("business", "email"),)
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    business: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    email: Mapped[str]
    profile: Mapped[dict] = mapped_column(JSON)
    score: Mapped[int]
    reasons: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(default="new")


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (UniqueConstraint("business", "slot"),)
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    business: Mapped[str] = mapped_column(ForeignKey("businesses.id"), index=True)
    conversation: Mapped[str] = mapped_column(ForeignKey("conversations.id"))
    slot: Mapped[str]


def initialize(engine):
    @event.listens_for(engine, "connect")
    def configure(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")

    Base.metadata.create_all(engine)
