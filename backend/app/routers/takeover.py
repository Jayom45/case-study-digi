"""Role-aware takeover: org chart, personal inbox, Takeover Pack + readiness progress."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import InvalidState, NotFound
from ..logging_setup import get_logger
from ..models import Brief, Meeting, Person
from ..schemas import PersonOut, ProgressUpdate, TakeoverRequest
from ..serializers import meeting_summary
from ..services import takeover as tk
from ..services import workflow as wf

router = APIRouter(prefix="/api", tags=["takeover"])
log = get_logger("app.takeover")


# ---------- Org chart ----------
@router.get("/org")
def org_chart(db: Session = Depends(get_db)):
    """People as a tree (reports_to), each with badge counts of what is waiting for them."""
    people = db.scalars(select(Person).order_by(Person.level, Person.name)).all()
    nodes = {}
    for p in people:
        waiting = [e for e in tk.inbox_entries(db, p) if not e["done"]]
        nodes[p.id] = {**PersonOut.model_validate(p).model_dump(), "reports": [],
                       "badges": {"handovers": sum(e["reason"] == "handover" for e in waiting),
                                  "missed": sum(e["reason"] == "missed" for e in waiting)}}
    roots = []
    for p in people:
        parent = nodes.get(p.reports_to_id)
        (parent["reports"] if parent else roots).append(nodes[p.id])
    return {"roots": roots}


@router.get("/people/{person_id}/inbox")
def inbox(person_id: int, db: Session = Depends(get_db)):
    person = wf.get_or_404(db, Person, person_id, "Person")
    entries = tk.inbox_entries(db, person)
    for e in entries:
        e["meeting"] = meeting_summary(e["meeting"])
        e["from_person"] = PersonOut.model_validate(e["from_person"]) if e["from_person"] else None
    return {"person": PersonOut.model_validate(person),
            "handovers": [e for e in entries if e["reason"] == "handover"],
            "missed": [e for e in entries if e["reason"] == "missed"]}


# ---------- Takeover pack ----------
def _pack_out(db: Session, pack: Brief) -> dict:
    """Stored AI/fallback content + live diagrams built from the current data."""
    meeting, person = pack.meeting, pack.person
    ctx = tk.Context(db, meeting, person)
    return {"id": pack.id, "meeting_id": meeting.id, "meeting_title": meeting.title,
            "person": PersonOut.model_validate(person), "source": pack.source, "created_at": pack.created_at,
            "content": pack.content,
            "progress": {"checked": pack.checked or [], "readiness": tk.readiness(pack),
                         "total": len(tk.checklist_keys(pack.content))},
            "timeline": tk.timeline(ctx.items), "workflow": tk.workflow(ctx.items)}


@router.post("/meetings/{meeting_id}/takeover-pack", status_code=201)
def generate_pack(meeting_id: int, body: TakeoverRequest, db: Session = Depends(get_db)):
    meeting = wf.get_or_404(db, Meeting, meeting_id, "Meeting")
    person = wf.get_or_404(db, Person, body.person_id, "Person")
    ctx = tk.Context(db, meeting, person)
    content, source = tk.build_pack(ctx)
    pack = Brief(meeting_id=meeting.id, person_id=person.id, kind="takeover", content=content, source=source, checked=[])
    db.add(pack)
    db.commit()
    db.refresh(pack)
    log.info("Takeover pack generated", extra={"event": "takeover_pack_generated", "meeting_id": meeting.id,
                                               "person_id": person.id, "pack_id": pack.id, "mode": ctx.mode,
                                               "source": source, "warnings": len(content["warnings"])})
    return _pack_out(db, pack)


@router.get("/meetings/{meeting_id}/takeover-pack")
def get_pack(meeting_id: int, person_id: int, db: Session = Depends(get_db)):
    wf.get_or_404(db, Meeting, meeting_id, "Meeting")
    pack = tk.latest_pack(db, meeting_id, person_id)
    if not pack:
        raise NotFound("no takeover pack yet for this person and meeting", {"meeting_id": meeting_id,
                                                                           "person_id": person_id})
    return _pack_out(db, pack)


@router.patch("/takeover-packs/{pack_id}/progress")
def update_progress(pack_id: int, body: ProgressUpdate, db: Session = Depends(get_db)):
    pack = wf.get_or_404(db, Brief, pack_id, "Takeover pack")
    if pack.kind != "takeover":
        raise InvalidState("progress can only be tracked on takeover packs")
    unknown = sorted(set(body.checked) - tk.checklist_keys(pack.content))
    if unknown:
        raise InvalidState("unknown checklist keys", {"unknown": unknown})
    pack.checked = sorted(set(body.checked))  # new list object so SQLAlchemy sees the JSON change
    db.commit()
    ready = tk.readiness(pack)
    log.info("Takeover progress updated", extra={"event": "takeover_progress_updated", "pack_id": pack.id,
                                                 "meeting_id": pack.meeting_id, "person_id": pack.person_id,
                                                 "checked": len(pack.checked), "readiness": ready})
    return {"checked": pack.checked, "readiness": ready, "total": len(tk.checklist_keys(pack.content))}
