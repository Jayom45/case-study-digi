"""Business rules for action items and meetings. Every state change writes an ItemEvent AND a log line."""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import InvalidState, NotFound
from ..logging_setup import get_logger
from ..models import (CLOSED_STATUSES, OPEN_STATUSES, ActionItem, ItemEvent, Meeting, MeetingItem, Person, utcnow)

log = get_logger("app.workflow")

MEETING_TRANSITIONS = {
    "scheduled": {"held", "closed"},
    "held": {"closed", "scheduled"},
    "closed": {"held"},
}


def get_or_404(db: Session, model, obj_id: int, label: str):
    obj = db.get(model, obj_id)
    if obj is None:
        raise NotFound(f"{label} {obj_id} not found", {"id": obj_id})
    return obj


def record_event(db: Session, item: ActionItem, event_type: str, message: str, meeting_id: int | None = None, **data):
    db.add(ItemEvent(item=item, event_type=event_type, message=message, meeting_id=meeting_id, data=data or None))
    log.info(message, extra={"event": f"item_{event_type}", "item_id": item.id, "meeting_id": meeting_id, **data})


def link_item(db: Session, item: ActionItem, meeting: Meeting, relation: str) -> bool:
    exists = db.get(MeetingItem, {"meeting_id": meeting.id, "item_id": item.id})
    if exists:
        return False
    db.add(MeetingItem(meeting=meeting, item=item, relation=relation))
    return True


def create_item(db: Session, meeting: Meeting, title: str, owner_id: int | None = None, due_date: date | None = None,
                description: str | None = None, source_quote: str | None = None, via: str = "manual") -> ActionItem:
    if owner_id is not None:
        get_or_404(db, Person, owner_id, "Person")
    item = ActionItem(title=title, description=description, owner_id=owner_id, due_date=due_date,
                      origin_meeting=meeting, source_quote=source_quote)
    db.add(item)
    db.flush()  # get item.id for the event/log
    link_item(db, item, meeting, "origin")
    owner = db.get(Person, owner_id).name if owner_id else "unassigned"
    record_event(db, item, "created", f"Created in '{meeting.title}' (owner: {owner})", meeting.id,
                 owner_id=owner_id, via=via)
    return item


def update_item(db: Session, item: ActionItem, changes: dict, note: str | None = None) -> ActionItem:
    if "owner_id" in changes and changes["owner_id"] != item.owner_id:
        new_owner = get_or_404(db, Person, changes["owner_id"], "Person") if changes["owner_id"] else None
        old = item.owner.name if item.owner else "unassigned"
        old_id = item.owner_id
        item.owner_id = changes["owner_id"]
        item.owner = new_owner
        record_event(db, item, "reassigned", f"Reassigned from {old} to {new_owner.name if new_owner else 'unassigned'}",
                     from_owner_id=old_id, to_owner_id=changes["owner_id"], note=note)

    for field in ("title", "description", "due_date"):
        if field in changes and changes[field] != getattr(item, field):
            old = getattr(item, field)
            setattr(item, field, changes[field])
            record_event(db, item, "updated", f"{field.replace('_', ' ').capitalize()} changed",
                         field=field, old=str(old) if old else None, new=str(changes[field]) if changes[field] else None,
                         note=note)

    if "status" in changes and changes["status"] != item.status:
        new, old = changes["status"], item.status
        if new in CLOSED_STATUSES:
            item.outcome = changes["outcome"].strip()
            item.closed_at = utcnow()
            item.status = new
            record_event(db, item, "closed", f"Closed as {new}: {item.outcome}", status=new, outcome=item.outcome, note=note)
        else:
            if old in CLOSED_STATUSES:
                item.closed_at = None
                record_event(db, item, "reopened", f"Reopened (was {old})", note=note)
            item.status = new
            record_event(db, item, "status_changed", f"Status {old} -> {new}", old=old, new=new, note=note)
    elif changes.get("outcome") and changes["outcome"] != item.outcome:
        item.outcome = changes["outcome"].strip()
        record_event(db, item, "updated", "Outcome updated", field="outcome", note=note)
    return item


def open_items_for(db: Session, meeting: Meeting) -> list[ActionItem]:
    rows = db.scalars(
        select(ActionItem).join(MeetingItem).where(MeetingItem.meeting_id == meeting.id,
                                                   ActionItem.status.in_(OPEN_STATUSES))
    ).all()
    return list(rows)


def carry_forward(db: Session, source: Meeting, target: Meeting) -> int:
    """Link every still-open item of `source` to `target`. Same item, new appearance, history kept."""
    if source.id == target.id:
        raise InvalidState("cannot carry items forward into the same meeting")
    moved = 0
    for item in open_items_for(db, source):
        if link_item(db, item, target, "carried"):
            item.carry_count += 1
            record_event(db, item, "carried_forward", f"Carried forward from '{source.title}' to '{target.title}'",
                         target.id, from_meeting_id=source.id, carry_count=item.carry_count)
            moved += 1
    log.info("Carry-forward complete", extra={"event": "meeting_carry_forward", "from_meeting_id": source.id,
                                               "to_meeting_id": target.id, "items": moved})
    return moved


def apply_handover(db: Session, meeting: Meeting) -> int:
    """Work transfer: every open item owned by `from` is reassigned to `to` and attached to the handover."""
    src, dst = meeting.handover_from, meeting.handover_to
    items = db.scalars(select(ActionItem).where(ActionItem.owner_id == src.id,
                                                ActionItem.status.in_(OPEN_STATUSES))).all()
    for item in items:
        link_item(db, item, meeting, "handover")
        item.owner_id = dst.id
        item.owner = dst
        record_event(db, item, "reassigned", f"Handed over from {src.name} to {dst.name} in '{meeting.title}'",
                     meeting.id, from_owner_id=src.id, to_owner_id=dst.id, via="handover")
    log.info("Handover applied", extra={"event": "handover_applied", "meeting_id": meeting.id,
                                         "from_person_id": src.id, "to_person_id": dst.id, "items": len(items)})
    return len(items)


def change_meeting_status(meeting: Meeting, new: str) -> None:
    if new == meeting.status:
        return
    if new not in MEETING_TRANSITIONS[meeting.status]:
        raise InvalidState(f"cannot move meeting from '{meeting.status}' to '{new}'",
                           {"allowed": sorted(MEETING_TRANSITIONS[meeting.status])})
    old, meeting.status = meeting.status, new
    log.info("Meeting status changed", extra={"event": "meeting_status_changed", "meeting_id": meeting.id,
                                               "old": old, "new": new})
