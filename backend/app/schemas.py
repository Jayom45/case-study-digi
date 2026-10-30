"""API request/response models. Validation lives here, at the edge."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .config import settings

ItemStatus = Literal["open", "in_progress", "blocked", "done", "dropped"]
MeetingStatus = Literal["scheduled", "held", "closed"]
MeetingKind = Literal["meeting", "handover"]
Attendance = Literal["invited", "attended", "absent"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _strip(v):
    return v.strip() if isinstance(v, str) else v


# ---------- People ----------
class PersonIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: str | None = Field(default=None, max_length=120)
    _s = field_validator("name", "email", "role", mode="before")(_strip)


class PersonOut(ORM):
    id: int
    name: str
    email: str
    role: str | None


# ---------- Meetings ----------
class ParticipantIn(BaseModel):
    person_id: int
    attendance: Attendance = "invited"


class ParticipantOut(ORM):
    person: PersonOut
    attendance: str


class MeetingCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    kind: MeetingKind = "meeting"
    scheduled_at: datetime
    series: str | None = Field(default=None, max_length=120)
    agenda: str | None = Field(default=None, max_length=5000)
    raw_notes: str | None = Field(default=None, max_length=settings.max_notes_chars)
    participants: list[ParticipantIn] = Field(default_factory=list, max_length=50)
    previous_meeting_id: int | None = None
    handover_from_id: int | None = None
    handover_to_id: int | None = None
    _s = field_validator("title", "series", mode="before")(_strip)

    @model_validator(mode="after")
    def check_handover(self):
        if self.kind == "handover":
            if not (self.handover_from_id and self.handover_to_id):
                raise ValueError("a handover needs both handover_from_id and handover_to_id")
            if self.handover_from_id == self.handover_to_id:
                raise ValueError("handover_from_id and handover_to_id must be different people")
        ids = [p.person_id for p in self.participants]
        if len(ids) != len(set(ids)):
            raise ValueError("participants contain duplicates")
        return self


class MeetingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    status: MeetingStatus | None = None
    scheduled_at: datetime | None = None
    agenda: str | None = Field(default=None, max_length=5000)
    raw_notes: str | None = Field(default=None, max_length=settings.max_notes_chars)
    participants: list[ParticipantIn] | None = Field(default=None, max_length=50)


class DecisionOut(ORM):
    id: int
    text: str
    source_quote: str | None


class MeetingSummaryOut(ORM):
    id: int
    title: str
    kind: str
    status: str
    scheduled_at: datetime
    series: str | None
    recap_source: str | None
    open_items: int = 0
    total_items: int = 0
    absent_count: int = 0


# ---------- Items ----------
class ItemCreate(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    owner_id: int | None = None
    due_date: date | None = None
    meeting_id: int
    source_quote: str | None = Field(default=None, max_length=2000)
    _s = field_validator("title", mode="before")(_strip)


class ItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    owner_id: int | None = None
    due_date: date | None = None
    status: ItemStatus | None = None
    outcome: str | None = Field(default=None, max_length=5000)
    note: str | None = Field(default=None, max_length=1000, description="why this change was made; stored in history")

    @model_validator(mode="after")
    def closing_needs_outcome(self):
        if self.status in ("done", "dropped") and not (self.outcome and len(self.outcome.strip()) >= 5):
            raise ValueError("closing an item (done/dropped) requires an outcome of at least 5 characters")
        return self


class EventOut(ORM):
    id: int
    event_type: str
    message: str
    data: dict | None
    meeting_id: int | None
    created_at: datetime


class KBLinkOut(ORM):
    doc_id: int
    reason: str
    confidence: float
    source: str
    doc_title: str | None = None


class ItemOut(ORM):
    id: int
    title: str
    description: str | None
    owner: PersonOut | None
    due_date: date | None
    status: str
    outcome: str | None
    origin_meeting_id: int | None
    source_quote: str | None
    carry_count: int
    created_at: datetime
    closed_at: datetime | None
    is_overdue: bool = False
    relation: str | None = None  # relation to the meeting being viewed


class ItemDetailOut(ItemOut):
    events: list[EventOut] = []
    meetings: list[dict] = []
    kb_links: list[KBLinkOut] = []


class MeetingDetailOut(MeetingSummaryOut):
    agenda: str | None
    raw_notes: str | None
    summary: str | None
    previous_meeting_id: int | None
    handover_from: PersonOut | None
    handover_to: PersonOut | None
    participants: list[ParticipantOut]
    decisions: list[DecisionOut]
    items: list[ItemOut] = []
    briefs: list[dict] = []
    needs_brief: list[PersonOut] = []
    next_meeting_id: int | None = None


# ---------- KB ----------
class KBDocIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    content: str = Field(min_length=20, max_length=50000)


class KBDocOut(ORM):
    id: int
    title: str
    doc_type: str
    content: str
    meeting_id: int | None
    created_at: datetime


# ---------- AI recap (draft -> review -> apply) ----------
class DraftDecision(BaseModel):
    text: str = Field(min_length=3, max_length=1000)
    source_quote: str | None = None
    quote_verified: bool = False


class DraftItem(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    owner_id: int | None = None
    owner_name: str | None = None
    due_date: date | None = None
    source_quote: str | None = None
    quote_verified: bool = False
    warnings: list[str] = []


class RecapDraft(BaseModel):
    summary: str
    decisions: list[DraftDecision]
    action_items: list[DraftItem]
    open_questions: list[str] = []
    source: Literal["ai", "fallback"]
    warnings: list[str] = []
    model: str | None = None
    latency_ms: int | None = None


class RecapRequest(BaseModel):
    raw_notes: str | None = Field(default=None, min_length=20, max_length=settings.max_notes_chars)


class RecapApply(BaseModel):
    summary: str = Field(min_length=10, max_length=5000)
    decisions: list[DraftDecision] = Field(default_factory=list, max_length=50)
    action_items: list[DraftItem] = Field(default_factory=list, max_length=60)
    source: Literal["ai", "fallback", "manual"] = "manual"


class BriefRequest(BaseModel):
    person_id: int
