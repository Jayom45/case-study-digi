from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..errors import Conflict
from ..logging_setup import get_logger
from ..models import OPEN_STATUSES, ActionItem, ItemEvent, KBDoc, Meeting, Person
from ..schemas import KBDocIn, KBDocOut, PersonIn, PersonOut
from ..serializers import item_out, meeting_summary
from ..services import workflow as wf

router = APIRouter(prefix="/api", tags=["misc"])
log = get_logger("app.misc")


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok", "ai_enabled": settings.ai_enabled, "model": settings.gemini_model if settings.ai_enabled else None}


@router.get("/people", response_model=list[PersonOut])
def list_people(db: Session = Depends(get_db)):
    return db.scalars(select(Person).order_by(Person.name)).all()


@router.post("/people", response_model=PersonOut, status_code=201)
def create_person(body: PersonIn, db: Session = Depends(get_db)):
    person = Person(**body.model_dump())
    db.add(person)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict(f"a person with email {body.email} already exists")
    log.info("Person created", extra={"event": "person_created", "person_id": person.id})
    return person


@router.get("/kb", response_model=list[KBDocOut])
def list_kb(db: Session = Depends(get_db)):
    return db.scalars(select(KBDoc).order_by(KBDoc.doc_type, KBDoc.title)).all()


@router.get("/kb/{doc_id}", response_model=KBDocOut)
def get_kb(doc_id: int, db: Session = Depends(get_db)):
    return wf.get_or_404(db, KBDoc, doc_id, "Document")


@router.post("/kb", response_model=KBDocOut, status_code=201)
def create_kb(body: KBDocIn, db: Session = Depends(get_db)):
    doc = KBDoc(title=body.title, content=body.content, doc_type="document")
    db.add(doc)
    db.commit()
    log.info("KB document created", extra={"event": "kb_doc_created", "doc_id": doc.id})
    return doc


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    today = date.today()
    open_q = select(ActionItem).where(ActionItem.status.in_(OPEN_STATUSES))
    open_items = db.scalars(open_q).all()
    overdue = [i for i in open_items if i.due_date and i.due_date < today]
    stale = [i for i in open_items if i.carry_count >= 2]
    due_soon = [i for i in open_items if i.due_date and today <= i.due_date <= today + timedelta(days=3)]
    closed_7d = db.scalar(select(func.count()).select_from(ActionItem).where(
        ActionItem.closed_at >= today - timedelta(days=7))) or 0
    upcoming = db.scalars(select(Meeting).where(Meeting.status == "scheduled").order_by(Meeting.scheduled_at)).all()
    load = {}
    for i in open_items:
        if i.owner:
            load.setdefault(i.owner.name, {"open": 0, "overdue": 0})
            load[i.owner.name]["open"] += 1
            load[i.owner.name]["overdue"] += int(i in overdue)
    recent = db.scalars(select(ItemEvent).order_by(ItemEvent.id.desc()).limit(12)).all()
    return {
        "counts": {"open": len(open_items), "overdue": len(overdue), "stale": len(stale),
                   "due_soon": len(due_soon), "closed_last_7_days": closed_7d},
        "overdue": [item_out(i) for i in overdue],
        "stale": [item_out(i) for i in stale],
        "upcoming_meetings": [meeting_summary(m) for m in upcoming[:5]],
        "owner_load": [{"name": k, **v} for k, v in sorted(load.items(), key=lambda kv: -kv[1]["open"])],
        "recent_activity": [{"item_id": e.item_id, "item_title": e.item.title, "event_type": e.event_type,
                             "message": e.message, "created_at": e.created_at} for e in recent],
    }
