"""Role-aware Takeover Pack: the 'special feature'.

Same pattern as the other AI features (see intelligence.py):
  1. gather the facts from the DB (items, decisions, docs, people) and give each an id
  2. ask the AI for JSON that REFERENCES those ids, validated with a Pydantic schema
  3. post-check: drop any id that doesn't exist, keep a visible warning
  4. enrich from the DB (canonical decision text, names, titles), so every line is traceable
  5. if the AI is unavailable -> deterministic pack built from the same facts (source='fallback')

Diagrams (timeline, workflow) are NOT produced by the AI: they are built here from item_events and item
statuses, so they are always correct and can never break because of bad model output.
"""
from datetime import date

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import OPEN_STATUSES, ActionItem, Brief, Decision, KBDoc, Meeting, Participant, Person
from .ai import AIUnavailable, generate_json
from .intelligence import INJECTION_GUARD, _item_line


# ---------------- Facts ----------------
class Context:
    """Everything the pack is allowed to talk about. Ids in AI output must come from here."""

    def __init__(self, db: Session, meeting: Meeting, person: Person):
        self.meeting, self.person = meeting, person
        attendance = next((p.attendance for p in meeting.participants if p.person_id == person.id), None)
        if meeting.kind == "handover" and meeting.handover_to_id == person.id:
            self.mode, self.leaver = "handover", meeting.handover_from
        elif attendance == "absent":
            self.mode, self.leaver = "missed", None
        else:
            self.mode, self.leaver = "catch_up", None

        # Items: everything in this meeting + anything else this person owns that is still open.
        items = [l.item for l in meeting.item_links]
        mine = db.scalars(select(ActionItem).where(ActionItem.owner_id == person.id,
                                                   ActionItem.status.in_(OPEN_STATUSES))).all()
        self.items = items + [i for i in mine if i not in items]

        # Decisions: from this meeting and from every meeting these items appeared in (newest first).
        meeting_ids = {meeting.id} | {l.meeting_id for i in self.items for l in i.meeting_links}
        self.decisions = list(db.scalars(select(Decision).where(Decision.meeting_id.in_(meeting_ids))
                                         .order_by(Decision.id.desc()).limit(25)).all())

        # Docs: linked to these items first, then the rest of the team documents.
        linked = {l.doc_id for i in self.items for l in i.kb_links}
        docs = db.scalars(select(KBDoc).where(KBDoc.doc_type == "document")).all()
        self.docs = sorted(docs, key=lambda d: (d.id not in linked, d.id))
        self.linked_doc_ids = linked

        self.people = [p for p in db.scalars(select(Person)).all() if p.id != person.id]

    @property
    def open_items(self) -> list[ActionItem]:
        return [i for i in self.items if i.is_open]


# ---------------- AI schema ----------------
class _RoleGap(BaseModel):
    from_role: str = Field(max_length=120)
    to_role: str = Field(max_length=120)
    new_for_you: list[str] = Field(default_factory=list, max_length=6)
    can_ignore: list[str] = Field(default_factory=list, max_length=5)


class _DecisionRef(BaseModel):
    decision_id: int
    why: str | None = Field(default=None, max_length=300)


class _Action(BaseModel):
    text: str = Field(min_length=3, max_length=300)
    item_id: int | None = None
    why: str = Field(default="", max_length=300)


class _Ask(BaseModel):
    person_id: int
    about: str = Field(min_length=3, max_length=300)


class _Read(BaseModel):
    doc_id: int
    why: str = Field(min_length=3, max_length=300)


class _AIPack(BaseModel):
    tldr: list[str] = Field(min_length=1, max_length=3)
    role_gap: _RoleGap
    key_decisions: list[_DecisionRef] = Field(default_factory=list, max_length=6)
    next_actions: list[_Action] = Field(min_length=1, max_length=5)
    who_to_ask: list[_Ask] = Field(default_factory=list, max_length=5)
    read_these: list[_Read] = Field(default_factory=list, max_length=4)
    risks: list[str] = Field(default_factory=list, max_length=5)


PACK_SYSTEM = (
    "You write a concise Takeover Pack for someone who is taking over another person's work or who missed a meeting. "
    + INJECTION_GUARD
    + " Tailor it to the gap between the two roles: what is NEW for this person given their own role, and what they "
    "can safely ignore. Be concrete (names, dates, item numbers). Only reference ids that appear in the input. "
    "Return ONLY JSON: "
    '{"tldr": [max 3 short lines], '
    '"role_gap": {"from_role": str, "to_role": str, "new_for_you": [str], "can_ignore": [str]}, '
    '"key_decisions": [{"decision_id": int, "why": str}] (decisions they must respect, max 6), '
    '"next_actions": [{"text": str (starts with a verb), "item_id": int|null, "why": str}] (first 3-5, most urgent first), '
    '"who_to_ask": [{"person_id": int, "about": str}], '
    '"read_these": [{"doc_id": int, "why": str}], '
    '"risks": [str]}.'
)


def _prompt(ctx: Context) -> str:
    today = date.today()
    p, m = ctx.person, ctx.meeting
    who = f"{p.name} ({p.role or 'team member'}, level {p.level}, team {p.team or '-'})"
    if ctx.mode == "handover":
        l = ctx.leaver
        situation = f"{who} is TAKING OVER work from {l.name} ({l.role or 'team member'}, level {l.level})."
    elif ctx.mode == "missed":
        situation = f"{who} MISSED this meeting and needs to catch up."
    else:
        situation = f"{who} wants a catch-up on this meeting."
    lines = [
        f"Today: {today.isoformat()}", situation,
        f"Meeting: {m.title} on {m.scheduled_at.date().isoformat()} ({m.kind})",
        f"Summary: {m.summary or 'no recap yet'}",
        "Action items:", *[f"- {_item_line(i, today)}" for i in ctx.items[:40]],
        "Decisions:", *[f"- [decision {d.id}] {d.text} (from meeting {d.meeting_id})" for d in ctx.decisions],
        "Knowledge base:", *[f"- [doc {d.id}] {d.title}: {' '.join(d.content.split())[:220]}" for d in ctx.docs],
        "People:", *[f"- [person {x.id}] {x.name}, {x.role or '-'}" for x in ctx.people],
    ]
    return "<input>\n" + "\n".join(lines) + "\n</input>"


# ---------------- Build ----------------
def build_pack(ctx: Context) -> tuple[dict, str]:
    try:
        result = generate_json("takeover_pack", PACK_SYSTEM, _prompt(ctx), _AIPack)
    except AIUnavailable as exc:
        pack = fallback_pack(ctx)
        pack["warnings"].insert(0, f"AI unavailable ({exc.reason}); pack built from your data with simple rules.")
        return pack, "fallback"
    return _checked(ctx, result.data), "ai"


def _checked(ctx: Context, data: _AIPack) -> dict:
    """Post-checks: keep only references to real ids, then fill in names/titles from the DB."""
    warnings: list[str] = []
    decisions = {d.id: d for d in ctx.decisions}
    items = {i.id: i for i in ctx.items}
    people = {p.id: p for p in ctx.people}
    docs = {d.id: d for d in ctx.docs}

    def drop(kind, ref):
        warnings.append(f"AI referenced unknown {kind} {ref}; removed.")

    key_decisions = []
    for ref in data.key_decisions:
        if ref.decision_id in decisions:
            key_decisions.append(_decision_out(decisions[ref.decision_id], ref.why))
        else:
            drop("decision", ref.decision_id)

    actions = []
    for a in data.next_actions:
        item = items.get(a.item_id) if a.item_id is not None else None
        if a.item_id is not None and item is None:
            drop("item", a.item_id)
        actions.append({"text": a.text, "item_id": item.id if item else None,
                        "item_title": item.title if item else None, "why": a.why})

    who = []
    for x in data.who_to_ask:
        if x.person_id in people:
            who.append(_person_out(people[x.person_id], x.about))
        else:
            drop("person", x.person_id)

    reads = []
    for r in data.read_these:
        if r.doc_id in docs:
            reads.append(_doc_out(docs[r.doc_id], r.why))
        else:
            drop("doc", r.doc_id)

    return {"mode": ctx.mode, "tldr": data.tldr, "role_gap": data.role_gap.model_dump(),
            "key_decisions": key_decisions, "next_actions": actions, "who_to_ask": who,
            "read_these": reads, "risks": data.risks, "warnings": warnings}


def _decision_out(d: Decision, why: str | None = None) -> dict:
    return {"decision_id": d.id, "text": d.text, "meeting_id": d.meeting_id, "meeting_title": d.meeting.title, "why": why}


def _person_out(p: Person, about: str) -> dict:
    return {"person_id": p.id, "name": p.name, "role": p.role, "about": about}


def _doc_out(d: KBDoc, why: str) -> dict:
    return {"doc_id": d.id, "title": d.title, "why": why}


# ---------------- Fallback (no AI) ----------------
def _urgency(item: ActionItem, today: date):
    """Sort key: overdue first, then blocked, then most-carried, then earliest due."""
    overdue = bool(item.due_date and item.due_date < today)
    return (not overdue, item.status != "blocked", -item.carry_count, item.due_date or date.max)


def fallback_pack(ctx: Context) -> dict:
    today = date.today()
    p, m, leaver = ctx.person, ctx.meeting, ctx.leaver
    open_items = ctx.open_items
    mine = sorted([i for i in open_items if i.owner_id == p.id], key=lambda i: _urgency(i, today))
    others = [i for i in open_items if i.owner_id != p.id]
    overdue = [i for i in open_items if i.due_date and i.due_date < today]
    blocked = [i for i in open_items if i.status == "blocked"]

    if ctx.mode == "handover":
        handed = sum(1 for l in m.item_links if l.relation == "handover" and l.item.is_open)
        tldr = [f"{leaver.name} handed you {handed} open item(s); you own {len(mine)} open item(s) in total."]
    else:
        tldr = [f"You {'missed' if ctx.mode == 'missed' else 'are catching up on'} '{m.title}' "
                f"({m.scheduled_at.date().isoformat()})."]
    tldr.append(f"{len(overdue)} overdue, {len(blocked)} blocked." + (f" Most urgent: '{mine[0].title}'." if mine else ""))
    if m.summary:
        tldr.append(m.summary.split(". ")[0].rstrip(".") + ".")

    from_role = leaver.role if leaver else p.role
    new_for_you = []
    if leaver and leaver.level < p.level:
        new_for_you.append(f"You are covering a more senior role ({leaver.role}): expect approvals, running team "
                           f"meetings and stakeholder follow-ups that {leaver.name.split()[0]} used to handle.")
    if mine:
        new_for_you.append(f"You now own {len(mine)} open item(s), e.g. '{mine[0].title}'.")
    if blocked:
        new_for_you.append(f"Unblock: '{blocked[0].title}'.")
    can_ignore = []
    if others:
        can_ignore.append(f"{len(others)} open item(s) owned by others - stay aware, no action needed.")
    closed = len(ctx.items) - len(open_items)
    if closed:
        can_ignore.append(f"{closed} closed item(s) - history only.")

    actions = [{"text": f"{'Unblock' if i.status == 'blocked' else 'Progress'}: {i.title}", "item_id": i.id,
                "item_title": i.title,
                "why": "Overdue" if i.due_date and i.due_date < today
                else f"Due {i.due_date.isoformat()}" if i.due_date else "Open"} for i in mine[:5]]
    if not actions:
        actions = [{"text": f"Read the recap of '{m.title}'", "item_id": None, "item_title": None,
                    "why": "Nothing is assigned to you yet"}]

    who = []
    if leaver:
        who.append(_person_out(leaver, "Anything in this handover"))
    for i in others[:4]:
        if i.owner and i.owner.id not in {w["person_id"] for w in who}:
            who.append(_person_out(i.owner, f"#{i.id} {i.title}"))

    reads = [_doc_out(d, "Linked to your items") for d in ctx.docs if d.id in ctx.linked_doc_ids][:4]
    risks = [f"Overdue: #{i.id} {i.title}" for i in overdue[:3]] + \
            [f"Carried {i.carry_count}x: #{i.id} {i.title}" for i in open_items if i.carry_count >= 2][:2]

    return {"mode": ctx.mode, "tldr": tldr[:3],
            "role_gap": {"from_role": from_role or "-", "to_role": p.role or "-",
                         "new_for_you": new_for_you, "can_ignore": can_ignore},
            "key_decisions": [_decision_out(d) for d in ctx.decisions[:5]],
            "next_actions": actions, "who_to_ask": who[:5], "read_these": reads, "risks": risks, "warnings": []}


# ---------------- Readiness ----------------
def checklist_keys(content: dict) -> set[str]:
    """Everything the person can tick: each next action, each decision acknowledged, each doc opened."""
    return ({f"action:{n}" for n in range(len(content.get("next_actions", [])))}
            | {f"decision:{d['decision_id']}" for d in content.get("key_decisions", [])}
            | {f"doc:{d['doc_id']}" for d in content.get("read_these", [])})


def readiness(pack: Brief) -> int:
    keys = checklist_keys(pack.content)
    if not keys:
        return 100
    return round(100 * len(keys & set(pack.checked or [])) / len(keys))


# ---------------- Diagrams (built from data, never by the AI) ----------------
STAGES = {"open": "not_started", "in_progress": "in_progress", "blocked": "blocked", "done": "done", "dropped": "done"}


def workflow(items: list[ActionItem]) -> dict:
    today = date.today()
    out = {"not_started": [], "in_progress": [], "blocked": [], "done": []}
    for i in items:
        out[STAGES[i.status]].append({
            "item_id": i.id, "title": i.title, "status": i.status, "owner": i.owner.name if i.owner else None,
            "due_date": i.due_date, "is_overdue": bool(i.is_open and i.due_date and i.due_date < today),
            "carry_count": i.carry_count})
    return out


def timeline(items: list[ActionItem], limit: int = 30) -> list[dict]:
    events = sorted((e for i in items for e in i.events), key=lambda e: (e.created_at, e.id))
    return [{"at": e.created_at, "item_id": e.item_id, "item_title": e.item.title, "event_type": e.event_type,
             "message": e.message, "meeting_id": e.meeting_id} for e in events[-limit:]]


# ---------------- Inbox / badges ----------------
def latest_pack(db: Session, meeting_id: int, person_id: int) -> Brief | None:
    return db.scalar(select(Brief).where(Brief.meeting_id == meeting_id, Brief.person_id == person_id,
                                         Brief.kind == "takeover").order_by(Brief.id.desc()).limit(1))


def inbox_entries(db: Session, person: Person) -> list[dict]:
    """Handovers coming to this person + meetings they missed. 'done' = pack 100% ready (or brief read)."""
    entries = []
    handovers = db.scalars(select(Meeting).where(Meeting.kind == "handover", Meeting.handover_to_id == person.id)
                           .order_by(Meeting.scheduled_at.desc())).all()
    missed = db.scalars(select(Meeting).join(Participant).where(Participant.person_id == person.id,
                                                                Participant.attendance == "absent")
                        .order_by(Meeting.scheduled_at.desc())).all()
    for reason, meetings in (("handover", handovers), ("missed", missed)):
        for m in meetings:
            pack = latest_pack(db, m.id, person.id)
            has_brief = any(b.person_id == person.id and b.kind == "brief" for b in m.briefs)
            ready = readiness(pack) if pack else 0
            entries.append({
                "reason": reason, "meeting": m, "from_person": m.handover_from if reason == "handover" else None,
                "open_items": sum(1 for l in m.item_links if l.item.is_open),
                "pack_id": pack.id if pack else None, "readiness": ready,
                "done": ready == 100 or (reason == "missed" and has_brief)})
    return entries



def handed_over_by(db: Session, person: Person) -> list[dict]:
    """Handovers this person GAVE, with how ready the receiver is: the leaver can confirm the takeover landed."""
    out = []
    for m in db.scalars(select(Meeting).where(Meeting.kind == "handover", Meeting.handover_from_id == person.id)
                        .order_by(Meeting.scheduled_at.desc())).all():
        pack = latest_pack(db, m.id, m.handover_to_id)
        out.append({"meeting": m, "to_person": m.handover_to,
                    "open_items": sum(1 for l in m.item_links if l.item.is_open),
                    "pack_id": pack.id if pack else None, "readiness": readiness(pack) if pack else 0})
    return out
