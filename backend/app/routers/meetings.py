from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import InvalidState
from ..logging_setup import get_logger
from ..models import ActionItem, Brief, Decision, ItemKBLink, KBDoc, Meeting, Participant, Person
from ..schemas import (BriefRequest, MeetingCreate, MeetingDetailOut, MeetingSummaryOut, MeetingUpdate, RecapApply,
                       RecapDraft, RecapRequest)
from ..serializers import brief_out, meeting_detail, meeting_summary
from ..services import intelligence as ai
from ..services import workflow as wf

router = APIRouter(prefix="/api/meetings", tags=["meetings"])
log = get_logger("app.meetings")


@router.get("", response_model=list[MeetingSummaryOut])
def list_meetings(kind: str | None = None, status: str | None = None, db: Session = Depends(get_db)):
    q = select(Meeting).order_by(Meeting.scheduled_at.desc())
    if kind:
        q = q.where(Meeting.kind == kind)
    if status:
        q = q.where(Meeting.status == status)
    return [meeting_summary(m) for m in db.scalars(q).all()]


@router.post("", response_model=MeetingDetailOut, status_code=201)
def create_meeting(body: MeetingCreate, db: Session = Depends(get_db)):
    for p in body.participants:
        wf.get_or_404(db, Person, p.person_id, "Person")
    meeting = Meeting(**body.model_dump(exclude={"participants"}))
    if body.kind == "handover":
        meeting.handover_from = wf.get_or_404(db, Person, body.handover_from_id, "Person")
        meeting.handover_to = wf.get_or_404(db, Person, body.handover_to_id, "Person")
    db.add(meeting)
    db.flush()
    meeting.participants = [Participant(person_id=p.person_id, attendance=p.attendance) for p in body.participants]
    log.info("Meeting created", extra={"event": "meeting_created", "meeting_id": meeting.id, "kind": meeting.kind,
                                       "participants": len(body.participants)})
    carried = handed = 0
    if body.previous_meeting_id:
        prev = wf.get_or_404(db, Meeting, body.previous_meeting_id, "Previous meeting")
        meeting.series = meeting.series or prev.series
        carried = wf.carry_forward(db, prev, meeting)
    if body.kind == "handover":
        handed = wf.apply_handover(db, meeting)
    db.commit()
    db.refresh(meeting)
    log.debug("Meeting setup", extra={"meeting_id": meeting.id, "carried": carried, "handed_over": handed})
    return meeting_detail(db, meeting)


@router.get("/{meeting_id}", response_model=MeetingDetailOut)
def get_meeting(meeting_id: int, db: Session = Depends(get_db)):
    return meeting_detail(db, wf.get_or_404(db, Meeting, meeting_id, "Meeting"))


@router.patch("/{meeting_id}", response_model=MeetingDetailOut)
def update_meeting(meeting_id: int, body: MeetingUpdate, db: Session = Depends(get_db)):
    meeting = wf.get_or_404(db, Meeting, meeting_id, "Meeting")
    changes = body.model_dump(exclude_unset=True)
    if "status" in changes:
        wf.change_meeting_status(meeting, changes.pop("status"))
    if "participants" in changes:
        for p in body.participants:
            wf.get_or_404(db, Person, p.person_id, "Person")
        meeting.participants = [Participant(person_id=p.person_id, attendance=p.attendance) for p in body.participants]
        changes.pop("participants")
    for k, v in changes.items():
        setattr(meeting, k, v)
    db.commit()
    db.refresh(meeting)
    log.info("Meeting updated", extra={"event": "meeting_updated", "meeting_id": meeting.id, "fields": sorted(changes)})
    return meeting_detail(db, meeting)


@router.post("/{meeting_id}/carry-forward", response_model=MeetingDetailOut)
def carry_forward(meeting_id: int, from_meeting_id: int, db: Session = Depends(get_db)):
    target = wf.get_or_404(db, Meeting, meeting_id, "Meeting")
    source = wf.get_or_404(db, Meeting, from_meeting_id, "Meeting")
    wf.carry_forward(db, source, target)
    db.commit()
    return meeting_detail(db, target)


# ---------- AI recap: draft (no writes) -> human review -> apply ----------
@router.post("/{meeting_id}/recap", response_model=RecapDraft)
def draft_recap(meeting_id: int, body: RecapRequest, db: Session = Depends(get_db)):
    meeting = wf.get_or_404(db, Meeting, meeting_id, "Meeting")
    notes = body.raw_notes or meeting.raw_notes
    if not notes or len(notes.strip()) < 20:
        raise InvalidState("add raw notes (at least 20 characters) before generating a recap")
    if body.raw_notes:
        meeting.raw_notes = body.raw_notes  # never lose the user's input, even if AI fails
        db.commit()
    people = [p.person for p in meeting.participants] or list(db.scalars(select(Person)).all())
    draft = ai.build_recap(meeting, notes, people)
    log.info("Recap drafted", extra={"event": "recap_drafted", "meeting_id": meeting.id, "source": draft.source,
                                     "decisions": len(draft.decisions), "items": len(draft.action_items),
                                     "warnings": len(draft.warnings)})
    return draft


@router.post("/{meeting_id}/recap/apply", response_model=MeetingDetailOut)
def apply_recap(meeting_id: int, body: RecapApply, db: Session = Depends(get_db)):
    meeting = wf.get_or_404(db, Meeting, meeting_id, "Meeting")
    if meeting.status == "closed":
        raise InvalidState("meeting is closed; reopen it before changing the recap")
    meeting.summary = body.summary
    meeting.recap_source = body.source
    for d in body.decisions:
        meeting.decisions.append(Decision(text=d.text, source_quote=d.source_quote))
    new_items = [wf.create_item(db, meeting, it.title, it.owner_id, it.due_date, source_quote=it.source_quote,
                                via=body.source) for it in body.action_items]
    if meeting.status == "scheduled":
        wf.change_meeting_status(meeting, "held")
    # Past meetings become part of the knowledge base.
    kb_text = f"{body.summary}\n\nDecisions:\n" + "\n".join(f"- {d.text}" for d in body.decisions)
    existing = db.scalar(select(KBDoc).where(KBDoc.meeting_id == meeting.id))
    if existing:
        existing.content = kb_text
    else:
        db.add(KBDoc(title=f"Recap: {meeting.title}", doc_type="meeting_recap", content=kb_text, meeting_id=meeting.id))
    db.flush()
    _link_items_to_kb(db, new_items, exclude_meeting_id=meeting.id)
    db.commit()
    db.refresh(meeting)
    log.info("Recap applied", extra={"event": "recap_applied", "meeting_id": meeting.id, "source": body.source,
                                     "items_created": len(new_items), "decisions": len(body.decisions)})
    return meeting_detail(db, meeting)


def _link_items_to_kb(db: Session, items: list[ActionItem], exclude_meeting_id: int | None = None) -> int:
    docs = [d for d in db.scalars(select(KBDoc)).all() if d.meeting_id != exclude_meeting_id]
    links, source = ai.build_kb_links(items, docs)
    by_id = {i.id: i for i in items}
    for l in links:
        item = by_id[l["item_id"]]
        if db.get(ItemKBLink, {"item_id": item.id, "doc_id": l["doc_id"]}):
            continue
        db.add(ItemKBLink(item_id=item.id, doc_id=l["doc_id"], reason=l["reason"], confidence=l["confidence"], source=source))
        doc = db.get(KBDoc, l["doc_id"])
        wf.record_event(db, item, "kb_linked", f"Linked to '{doc.title}': {l['reason']}", doc_id=doc.id, source=source)
    return len(links)


@router.post("/{meeting_id}/kb-links")
def relink_kb(meeting_id: int, db: Session = Depends(get_db)):
    meeting = wf.get_or_404(db, Meeting, meeting_id, "Meeting")
    items = [l.item for l in meeting.item_links]
    count = _link_items_to_kb(db, items, exclude_meeting_id=meeting.id)
    db.commit()
    return {"links_created": count}


# ---------- Catch-up briefs ----------
@router.post("/{meeting_id}/briefs")
def create_brief(meeting_id: int, body: BriefRequest, db: Session = Depends(get_db)):
    meeting = wf.get_or_404(db, Meeting, meeting_id, "Meeting")
    person = wf.get_or_404(db, Person, body.person_id, "Person")
    attendance = next((p.attendance for p in meeting.participants if p.person_id == person.id), None)
    if meeting.kind == "handover" and person.id == meeting.handover_to_id:
        reason = f"taking over work from {meeting.handover_from.name}"
    elif attendance == "absent":
        reason = "missed the meeting"
    else:
        reason = "requested a catch-up"
    items = [l.item for l in meeting.item_links]
    # Include everything this person owns that is still open, wherever it came from.
    extra = db.scalars(select(ActionItem).where(ActionItem.owner_id == person.id,
                                                ActionItem.status.in_(("open", "in_progress", "blocked")))).all()
    items += [i for i in extra if i not in items]
    content, source = ai.build_brief(meeting, person, items, reason)
    brief = Brief(meeting_id=meeting.id, person_id=person.id, content=content, source=source)
    db.add(brief)
    db.commit()
    db.refresh(brief)
    log.info("Brief generated", extra={"event": "brief_generated", "meeting_id": meeting.id, "person_id": person.id,
                                       "source": source, "reason": reason})
    return brief_out(brief)
