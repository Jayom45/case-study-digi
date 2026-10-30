from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import CLOSED_STATUSES, OPEN_STATUSES, ActionItem, Meeting
from ..schemas import ItemCreate, ItemDetailOut, ItemOut, ItemUpdate
from ..serializers import item_detail, item_out
from ..services import intelligence as ai
from ..services import workflow as wf

router = APIRouter(prefix="/api/items", tags=["items"])


@router.get("", response_model=list[ItemOut])
def list_items(status: str | None = None, owner_id: int | None = None, overdue: bool = False,
               open_only: bool = False, stale: bool = False, db: Session = Depends(get_db)):
    q = select(ActionItem).order_by(ActionItem.due_date.is_(None), ActionItem.due_date, ActionItem.id)
    if status:
        q = q.where(ActionItem.status == status)
    if owner_id:
        q = q.where(ActionItem.owner_id == owner_id)
    if open_only or overdue or stale:
        q = q.where(ActionItem.status.in_(OPEN_STATUSES))
    if overdue:
        q = q.where(ActionItem.due_date < date.today())
    if stale:
        q = q.where(ActionItem.carry_count >= 2)
    return [item_out(i) for i in db.scalars(q).all()]


@router.post("", response_model=ItemDetailOut, status_code=201)
def create_item(body: ItemCreate, db: Session = Depends(get_db)):
    meeting = wf.get_or_404(db, Meeting, body.meeting_id, "Meeting")
    item = wf.create_item(db, meeting, body.title, body.owner_id, body.due_date, body.description, body.source_quote)
    db.commit()
    db.refresh(item)
    return item_detail(item)


@router.get("/{item_id}", response_model=ItemDetailOut)
def get_item(item_id: int, db: Session = Depends(get_db)):
    return item_detail(wf.get_or_404(db, ActionItem, item_id, "Action item"))


@router.patch("/{item_id}", response_model=ItemDetailOut)
def update_item(item_id: int, body: ItemUpdate, db: Session = Depends(get_db)):
    item = wf.get_or_404(db, ActionItem, item_id, "Action item")
    changes = body.model_dump(exclude_unset=True, exclude={"note"})
    wf.update_item(db, item, changes, body.note)
    db.commit()
    db.refresh(item)
    return item_detail(item)


@router.post("/{item_id}/nudge")
def nudge(item_id: int, db: Session = Depends(get_db)):
    item = wf.get_or_404(db, ActionItem, item_id, "Action item")
    if item.status in CLOSED_STATUSES:
        return {"subject": None, "message": "This item is already closed - no follow-up needed.", "source": "rule"}
    content, source = ai.build_nudge(item, [e.message for e in item.events])
    wf.record_event(db, item, "nudge_drafted", "Follow-up message drafted", source=source)
    db.commit()
    return {**content, "source": source}
