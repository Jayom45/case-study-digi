"""Turn ORM rows into API shapes (keeps routers thin)."""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ActionItem, Meeting, MeetingItem
from .schemas import ItemDetailOut, ItemOut, KBLinkOut, MeetingDetailOut, MeetingSummaryOut, PersonOut


def item_out(item: ActionItem, relation: str | None = None) -> ItemOut:
    out = ItemOut.model_validate(item)
    out.is_overdue = bool(item.is_open and item.due_date and item.due_date < date.today())
    out.relation = relation
    return out


def item_detail(item: ActionItem) -> ItemDetailOut:
    base = item_out(item).model_dump()
    return ItemDetailOut(
        **base,
        events=item.events,
        meetings=sorted(
            [{"id": l.meeting.id, "title": l.meeting.title, "scheduled_at": l.meeting.scheduled_at,
              "relation": l.relation, "kind": l.meeting.kind} for l in item.meeting_links],
            key=lambda m: m["scheduled_at"]),
        kb_links=[KBLinkOut(doc_id=l.doc_id, reason=l.reason, confidence=l.confidence, source=l.source,
                            doc_title=l.doc.title) for l in item.kb_links],
    )


def meeting_summary(m: Meeting) -> MeetingSummaryOut:
    out = MeetingSummaryOut.model_validate(m)
    out.total_items = len(m.item_links)
    out.open_items = sum(1 for l in m.item_links if l.item.is_open)
    out.absent_count = sum(1 for p in m.participants if p.attendance == "absent")
    return out


def meeting_detail(db: Session, m: Meeting) -> MeetingDetailOut:
    summary = meeting_summary(m).model_dump()
    order = {"handover": 0, "carried": 1, "origin": 2}
    links = sorted(m.item_links, key=lambda l: (order.get(l.relation, 3), l.item.id))
    needs = [p.person for p in m.participants if p.attendance == "absent"]
    if m.kind == "handover" and m.handover_to and m.handover_to not in needs:
        needs.append(m.handover_to)
    nxt = db.scalar(select(Meeting.id).where(Meeting.previous_meeting_id == m.id).limit(1))
    return MeetingDetailOut(
        **summary,
        agenda=m.agenda, raw_notes=m.raw_notes, summary=m.summary, previous_meeting_id=m.previous_meeting_id,
        handover_from=m.handover_from, handover_to=m.handover_to,
        participants=m.participants, decisions=m.decisions,
        items=[item_out(l.item, l.relation) for l in links],
        briefs=[brief_out(b) for b in sorted(m.briefs, key=lambda b: b.id, reverse=True) if b.kind == "brief"],
        needs_brief=[PersonOut.model_validate(p) for p in needs],
        next_meeting_id=nxt,
    )


def brief_out(b) -> dict:
    return {"id": b.id, "person": PersonOut.model_validate(b.person).model_dump() if b.person else None,
            "content": b.content, "source": b.source, "created_at": b.created_at}
