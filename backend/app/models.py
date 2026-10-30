"""Database schema.

Key idea: an ActionItem is ONE row for its whole life. Carrying it forward does not copy it;
it links the same item to the next meeting (MeetingItem) and appends an ItemEvent.
So an item's full history = its events + every meeting it appeared in.
"""
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


OPEN_STATUSES = ("open", "in_progress", "blocked")
CLOSED_STATUSES = ("done", "dropped")
ITEM_STATUSES = OPEN_STATUSES + CLOSED_STATUSES
MEETING_STATUSES = ("scheduled", "held", "closed")
MEETING_KINDS = ("meeting", "handover")
ATTENDANCE = ("invited", "attended", "absent")


class Person(Base):
    __tablename__ = "people"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True)
    role: Mapped[str | None] = mapped_column(String(120))
    # Org hierarchy: level 1 = top of the tree. Used for the org chart and the "role gap" in takeover packs.
    level: Mapped[int] = mapped_column(Integer, default=3)
    team: Mapped[str | None] = mapped_column(String(120))
    reports_to_id: Mapped[int | None] = mapped_column(ForeignKey("people.id"))


class Meeting(Base):
    """A meeting OR a work handover (kind='handover')."""

    __tablename__ = "meetings"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20), default="meeting")
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    series: Mapped[str | None] = mapped_column(String(120))
    agenda: Mapped[str | None] = mapped_column(Text)
    raw_notes: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    recap_source: Mapped[str | None] = mapped_column(String(20))  # ai | fallback | manual
    previous_meeting_id: Mapped[int | None] = mapped_column(ForeignKey("meetings.id"))
    handover_from_id: Mapped[int | None] = mapped_column(ForeignKey("people.id"))
    handover_to_id: Mapped[int | None] = mapped_column(ForeignKey("people.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    participants: Mapped[list["Participant"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    decisions: Mapped[list["Decision"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    item_links: Mapped[list["MeetingItem"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    briefs: Mapped[list["Brief"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    handover_from: Mapped[Person | None] = relationship(foreign_keys=[handover_from_id])
    handover_to: Mapped[Person | None] = relationship(foreign_keys=[handover_to_id])


class Participant(Base):
    __tablename__ = "participants"
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True)
    person_id: Mapped[int] = mapped_column(ForeignKey("people.id"), primary_key=True)
    attendance: Mapped[str] = mapped_column(String(20), default="invited")
    meeting: Mapped[Meeting] = relationship(back_populates="participants")
    person: Mapped[Person] = relationship()


class Decision(Base):
    __tablename__ = "decisions"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    source_quote: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    meeting: Mapped[Meeting] = relationship(back_populates="decisions")


class ActionItem(Base):
    __tablename__ = "action_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("people.id"))
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="open")
    outcome: Mapped[str | None] = mapped_column(Text)
    origin_meeting_id: Mapped[int | None] = mapped_column(ForeignKey("meetings.id"))
    source_quote: Mapped[str | None] = mapped_column(Text)
    carry_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    owner: Mapped[Person | None] = relationship()
    origin_meeting: Mapped[Meeting | None] = relationship()
    meeting_links: Mapped[list["MeetingItem"]] = relationship(back_populates="item", cascade="all, delete-orphan")
    events: Mapped[list["ItemEvent"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", order_by="ItemEvent.id"
    )
    kb_links: Mapped[list["ItemKBLink"]] = relationship(back_populates="item", cascade="all, delete-orphan")

    @property
    def is_open(self) -> bool:
        return self.status in OPEN_STATUSES


class MeetingItem(Base):
    """Which meetings an item appeared in. relation = origin | carried | handover."""

    __tablename__ = "meeting_items"
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("action_items.id", ondelete="CASCADE"), primary_key=True)
    relation: Mapped[str] = mapped_column(String(20), default="origin")
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    meeting: Mapped[Meeting] = relationship(back_populates="item_links")
    item: Mapped[ActionItem] = relationship(back_populates="meeting_links")


class ItemEvent(Base):
    """Append-only history: created, updated, reassigned, status_changed, carried_forward, closed, reopened, kb_linked."""

    __tablename__ = "item_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("action_items.id", ondelete="CASCADE"))
    meeting_id: Mapped[int | None] = mapped_column(ForeignKey("meetings.id"))
    event_type: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(Text)
    data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    item: Mapped[ActionItem] = relationship(back_populates="events")


class KBDoc(Base):
    __tablename__ = "kb_docs"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    doc_type: Mapped[str] = mapped_column(String(30), default="document")  # document | meeting_recap
    content: Mapped[str] = mapped_column(Text)
    meeting_id: Mapped[int | None] = mapped_column(ForeignKey("meetings.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ItemKBLink(Base):
    __tablename__ = "item_kb_links"
    item_id: Mapped[int] = mapped_column(ForeignKey("action_items.id", ondelete="CASCADE"), primary_key=True)
    doc_id: Mapped[int] = mapped_column(ForeignKey("kb_docs.id", ondelete="CASCADE"), primary_key=True)
    reason: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    source: Mapped[str] = mapped_column(String(20), default="ai")  # ai | fallback | manual
    item: Mapped[ActionItem] = relationship(back_populates="kb_links")
    doc: Mapped[KBDoc] = relationship()


class Brief(Base):
    """A catch-up brief (kind='brief') or a role-aware Takeover Pack (kind='takeover')."""

    __tablename__ = "briefs"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    person_id: Mapped[int | None] = mapped_column(ForeignKey("people.id"))
    kind: Mapped[str] = mapped_column(String(20), default="brief")  # brief | takeover
    content: Mapped[dict] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(20))  # ai | fallback
    # Takeover readiness: checklist keys the person has ticked ("action:0", "decision:7", "doc:3").
    # Stored on the pack itself, so a regenerated pack starts with a fresh checklist.
    checked: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    meeting: Mapped[Meeting] = relationship(back_populates="briefs")
    person: Mapped[Person | None] = relationship()
