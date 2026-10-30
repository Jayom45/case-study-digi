"""Realistic demo data: a telecom billing-platform team over four weekly syncs, one handover and one
un-recapped incident review (for the live AI demo). Dates are relative to today so 'overdue' stays meaningful."""
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .logging_setup import get_logger
from .models import ActionItem, Decision, ItemEvent, ItemKBLink, KBDoc, Meeting, Participant, Person
from .services import workflow as wf

log = get_logger("app.seed")
SAMPLES = Path(__file__).resolve().parent.parent.parent / "samples"

# (name, email, role, level, team, reports_to first name). Level 1 = top of the org chart.
PEOPLE = [
    ("Meera Kapoor", "meera.kapoor@northwind-tel.com", "Head of Engineering", 1, "Leadership", None),
    ("Ananya Rao", "ananya.rao@northwind-tel.com", "Engineering Manager", 2, "Billing Platform", "Meera"),
    ("Sneha Iyer", "sneha.iyer@northwind-tel.com", "Product Manager", 2, "Product", "Meera"),
    ("Rahul Mehta", "rahul.mehta@northwind-tel.com", "Backend Engineer", 3, "Billing Platform", "Ananya"),
    ("Priya Nair", "priya.nair@northwind-tel.com", "Frontend Engineer", 3, "Billing Platform", "Ananya"),
    ("Arjun Desai", "arjun.desai@northwind-tel.com", "Frontend Engineer", 3, "Billing Platform", "Ananya"),
    ("Karan Shah", "karan.shah@northwind-tel.com", "QA Lead", 3, "Billing Platform", "Ananya"),
    ("Vikram Joshi", "vikram.joshi@northwind-tel.com", "DevOps Engineer", 3, "Billing Platform", "Ananya"),
]

KB = [
    ("Deployment Runbook", """How we release the billing platform.
1. Every release goes to staging first; QA signs off using the QA Regression Checklist.
2. Releases happen Tue/Thu 10:00-12:00 IST only. No Friday releases.
3. Behind a feature flag (LaunchDarkly key billing.v2.*) for at least 48h before 100% rollout.
4. Rollback: flip the flag off, then redeploy the previous image tag with `make rollback TAG=<sha>`.
5. Database migrations must be backward compatible (expand -> migrate -> contract).
6. Payment gateway credentials live in Vault under secret/billing/gateway and rotate every 90 days."""),
    ("Billing API v2 Specification", """Billing API v2 replaces the legacy invoicing module.
Endpoints: POST /v2/invoices, GET /v2/invoices/{id}, POST /v2/invoices/{id}/void, GET /v2/invoices/preview.
Proration: mid-cycle plan changes create ONE adjustment line item; the old plan is credited by day.
Idempotency: every POST must send an Idempotency-Key header; duplicates within 24h return the original response.
Errors: 409 on duplicate key with different payload, 422 on validation errors.
Preview endpoint powers the customer portal invoice preview screen."""),
    ("Postmortem INC-142: Duplicate invoices on plan change", """Date: early October. Impact: ~1,200 postpaid customers
received two invoices after changing plans mid-cycle. Root cause: legacy proration job retried on gateway timeout
without an idempotency key, creating a second invoice. Customers were overcharged until support voided duplicates.
Actions: add idempotency keys to invoice creation, regression tests for proration, customer correction email,
freeze legacy proration code. Status: fix in progress under Billing API v2."""),
    ("Q4 Roadmap: Billing Platform Migration", """Goal: move 100% of postpaid invoicing to Billing API v2 by end of November.
Milestones: staging ready (Oct), regression sign-off (early Nov), go-live behind flag (mid Nov), legacy shutdown (Dec).
Dependencies: finance sign-off on proration rules; customer portal invoice preview; gateway credential rotation."""),
    ("QA Regression Checklist", """Before any billing release QA runs: proration scenarios (upgrade, downgrade, mid-cycle,
cycle boundary), duplicate submission / idempotency, payment gateway retries and timeouts, invoice PDF rendering,
tax rounding for GST. Flaky tests must be fixed or quarantined with an owner; no release with red regression suite."""),
    ("Engineering Manager Playbook", """What the Billing Platform Engineering Manager does every week.
1. Runs the Billing Platform Weekly Sync: walks carried items first, chases anything carried 2+ times.
2. Approves releases: signs the go-live readiness checklist (QA sign-off + finance sign-off + rollback tested).
3. Finance follow-ups: sends a weekly migration status note to Finance and the Head of Engineering every Friday.
4. Escalations: Sev-1/Sev-2 incidents go to the Head of Engineering within 1 hour.
5. People: approves leave and the on-call rota; owns handovers when someone is away.
Engineers do NOT need to: write code reviews for every PR, attend the monthly budget review (Head of Engineering does)."""),
    ("Customer Communication Guidelines", """Any customer-facing billing message needs Product + Support review.
Correction emails: apologise once, state the corrected amount, explain refund timeline (5-7 working days),
link to support. Send within 72h of the fix being confirmed. Never mention internal incident numbers."""),
]


def _at(d: date, hour: int = 11) -> datetime:
    return datetime.combine(d, time(hour, 0), tzinfo=timezone.utc)


def seed_if_empty(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(Person)):
        return
    today = date.today()
    p = {}
    for name, email, role, level, team, _ in PEOPLE:
        p[name.split()[0]] = Person(name=name, email=email, role=role, level=level, team=team)
    db.add_all(p.values())
    db.flush()
    for name, *_, manager in PEOPLE:
        if manager:
            p[name.split()[0]].reports_to_id = p[manager].id
    docs = {title: KBDoc(title=title, content=content, doc_type="document") for title, content in KB}
    db.add_all(docs.values())
    db.flush()

    last_event = [0]

    def stamp(when: datetime):
        """Give seeded events/items realistic timestamps instead of 'now'."""
        for e in db.scalars(select(ItemEvent).where(ItemEvent.id > last_event[0])).all():
            e.created_at = when
            last_event[0] = max(last_event[0], e.id)

    def meeting(title, d, status, participants, agenda, summary=None, notes=None, prev=None, **kw):
        m = Meeting(title=title, scheduled_at=_at(d), status=status, series=kw.pop("series", "Billing Platform Weekly Sync"),
                    agenda=agenda, summary=summary, raw_notes=notes, recap_source="manual" if summary else None,
                    previous_meeting_id=prev.id if prev else None, **kw)
        db.add(m)
        db.flush()
        m.participants = [Participant(person_id=p[n].id, attendance=a) for n, a in participants]
        if prev:
            wf.carry_forward(db, prev, m)
        return m

    def decide(m, *texts):
        m.decisions = [Decision(text=t, source_quote=None) for t in texts]

    def item(m, title, owner, due_offset, **kw):
        it = wf.create_item(db, m, title, p[owner].id, today + timedelta(days=due_offset), via="seed", **kw)
        return it

    def close(it, outcome, when):
        wf.update_item(db, it, {"status": "done", "outcome": outcome})
        it.closed_at = when

    everyone = [(n, "attended") for n in ("Ananya", "Rahul", "Priya", "Karan", "Sneha", "Vikram")]

    # ---- Week 1 ----
    w1d = today - timedelta(days=17)
    w1 = meeting("Billing Sync - Week 1", w1d, "held", everyone,
                 "1. INC-142 duplicate invoices follow-up\n2. Billing API v2 migration plan\n3. Staging environment",
                 summary="Team reviewed INC-142 (duplicate invoices after mid-cycle plan changes). Agreed to move invoicing "
                         "to Billing API v2 by end of November and to freeze the legacy proration code. Staging for v2 and a "
                         "customer correction email are the immediate priorities.")
    decide(w1, "Migrate postpaid invoicing to Billing API v2 by end of November",
           "Freeze changes to legacy proration code from next week")
    a = item(w1, "Fix duplicate invoice on mid-cycle plan change (INC-142)", "Rahul", -10,
             description="Root cause is a retry without idempotency key in the legacy proration job.")
    b = item(w1, "Set up staging environment for Billing API v2", "Vikram", -12)
    c = item(w1, "Draft customer correction email for duplicate invoices", "Sneha", -11)
    d = item(w1, "Write regression suite for proration scenarios", "Karan", -6)
    stamp(_at(w1d))

    # ---- Week 2 ----
    w2d = today - timedelta(days=10)
    w2 = meeting("Billing Sync - Week 2", w2d, "held", everyone,
                 "1. Carried items\n2. Idempotency design\n3. Customer portal invoice preview",
                 summary="Staging for API v2 is live and the correction email went out. The INC-142 fix is in progress but "
                         "needs idempotency keys first. Team decided every invoice POST must carry an Idempotency-Key, and "
                         "Priya starts the portal invoice preview screen.", prev=w1)
    decide(w2, "All invoice POST endpoints must require an Idempotency-Key header",
           "Refunds for INC-142 are handled by Support, not automatic credits")
    close(b, "Staging live at billing-v2.staging.northwind-tel.internal; smoke tests green.", _at(w2d))
    close(c, "Email sent to 1,183 affected customers; Support briefed on refund timeline.", _at(w2d))
    wf.update_item(db, a, {"status": "in_progress"}, note="Blocked on idempotency design; now unblocked")
    e = item(w2, "Add idempotency keys to invoice creation endpoint", "Rahul", 0)
    f = item(w2, "Build invoice preview screen in customer portal", "Priya", 5)
    wf.update_item(db, f, {"status": "in_progress"})
    g = item(w2, "Update Deployment Runbook with API v2 rollback steps", "Vikram", -4)
    stamp(_at(w2d))

    # ---- Week 3 (Rahul absent) ----
    w3d = today - timedelta(days=3)
    w3_people = [(n, "absent" if n == "Rahul" else "attended") for n, _ in everyone] + [("Arjun", "attended")]
    w3 = meeting("Billing Sync - Week 3", w3d, "held", w3_people,
                 "1. Carried items\n2. Go-live date\n3. Priya's leave and handover",
                 summary="Go-live for API v2 moved to Nov 17 because regression sign-off and finance approval of the proration "
                         "rules are still pending. The INC-142 fix has now slipped twice. Priya is on leave from Nov 2, so her "
                         "portal work moves to Arjun. Vikram flagged that gateway credentials expire soon.", prev=w2)
    decide(w3, "Go-live for Billing API v2 moved to Nov 17, pending regression sign-off",
           "Priya's customer portal work transfers to Arjun during her leave",
           "No release without finance sign-off on proration rules")
    close(g, "Runbook section 4 updated with flag-off + `make rollback` steps; reviewed by Ananya.", _at(w3d))
    h = item(w3, "Get finance sign-off on proration rules", "Sneha", -1)
    i = item(w3, "Fix flaky payment-gateway retry test", "Karan", 3)
    j = item(w3, "Add analytics events to invoice preview", "Priya", 7)
    k = item(w3, "Rotate expiring payment gateway API credentials", "Vikram", 2)
    wf.update_item(db, k, {"status": "blocked"}, note="Waiting for new credentials from the gateway provider")
    # Manager-only work: this is what makes the Ananya -> Rahul role gap visible in the takeover pack.
    m1 = item(w3, "Approve go-live readiness checklist for Billing API v2", "Ananya", 5,
              description="Needs QA regression sign-off and finance sign-off on proration before approval.")
    m2 = item(w3, "Send weekly migration status note to Finance and Meera", "Ananya", 1)
    m3 = item(w3, "Chase INC-142 fix in Week 4 sync; escalate to Meera if it slips again", "Ananya", 4)
    stamp(_at(w3d))

    # ---- Handover: Priya -> Arjun ----
    hd = today - timedelta(days=1)
    ho = Meeting(title="Handover: Priya -> Arjun (leave Nov 2-16)", kind="handover", status="held", scheduled_at=_at(hd, 15),
                 series=None, handover_from=p["Priya"], handover_to=p["Arjun"],
                 agenda="Walk through open portal work, access, and known risks.",
                 summary="Priya walked Arjun through the invoice preview screen (UI done, wiring to /v2/invoices/preview "
                         "pending) and the analytics events task. Figma and Storybook access granted. Risk: preview "
                         "numbers must match proration rules once finance signs off.", recap_source="manual")
    db.add(ho)
    db.flush()
    ho.participants = [Participant(person_id=p["Priya"].id, attendance="attended"),
                       Participant(person_id=p["Arjun"].id, attendance="attended"),
                       Participant(person_id=p["Ananya"].id, attendance="absent")]
    ho.decisions = [Decision(text="Arjun owns all customer portal billing work until Priya returns on Nov 17")]
    wf.apply_handover(db, ho)
    stamp(_at(hd, 15))

    # ---- Handover: Ananya -> Rahul (acting manager). A role-gap handover: engineer stepping up. ----
    ho2 = Meeting(title="Handover: Ananya -> Rahul (acting manager, Nov 3-14)", kind="handover", status="held",
                  scheduled_at=_at(hd, 17), series=None, handover_from=p["Ananya"], handover_to=p["Rahul"],
                  agenda="Hand over the manager duties: weekly sync, approvals, finance follow-ups, escalations.",
                  summary="Ananya is on leave Nov 3-14 and Rahul acts as Engineering Manager. He runs the Week 4 sync, "
                          "approves the go-live readiness checklist once QA and finance sign off, and sends the Friday "
                          "status note to Finance and Meera. Sev-1/Sev-2 escalations go straight to Meera.",
                  recap_source="manual")
    db.add(ho2)
    db.flush()
    ho2.participants = [Participant(person_id=p["Ananya"].id, attendance="attended"),
                        Participant(person_id=p["Rahul"].id, attendance="attended"),
                        Participant(person_id=p["Meera"].id, attendance="invited")]
    ho2.decisions = [Decision(text="Rahul is acting Engineering Manager from Nov 3 to Nov 14"),
                     Decision(text="Go-live checklist approval stays with the acting manager; Meera only for escalations")]
    wf.apply_handover(db, ho2)
    stamp(_at(hd, 17))

    # ---- Week 4 (upcoming) ----
    w4d = today + timedelta(days=4)
    meeting("Billing Sync - Week 4", w4d, "scheduled",
            [(n, "invited") for n in ("Ananya", "Rahul", "Karan", "Sneha", "Vikram", "Arjun")],
            "1. Carried items (INC-142 fix has slipped 3 times)\n2. Go-live readiness for Nov 17\n3. Credential rotation",
            prev=w3)
    stamp(datetime.now(timezone.utc))

    # ---- Incident review with raw notes only: the live AI demo ----
    sample = SAMPLES / "incident_review_notes.txt"
    raw = sample.read_text(encoding="utf-8") if sample.exists() else ""
    inc = Meeting(title="Incident review: duplicate SMS bundle charges", status="scheduled", scheduled_at=_at(today, 9),
                  series=None, agenda="1. What happened\n2. Customer impact\n3. Fixes and owners", raw_notes=raw or None)
    db.add(inc)
    db.flush()
    inc.participants = [Participant(person_id=p[n].id, attendance=a) for n, a in
                        [("Ananya", "attended"), ("Rahul", "attended"), ("Karan", "attended"),
                         ("Sneha", "attended"), ("Vikram", "absent")]]

    # Knowledge-base links for seeded items (seed data, labelled 'manual').
    for it, title, reason in [
        (a, "Postmortem INC-142: Duplicate invoices on plan change", "Root cause and agreed fixes for this bug"),
        (e, "Billing API v2 Specification", "Defines Idempotency-Key behaviour for POST /v2/invoices"),
        (d, "QA Regression Checklist", "Lists the proration scenarios the suite must cover"),
        (f, "Billing API v2 Specification", "Preview endpoint that powers this screen"),
        (k, "Deployment Runbook", "Credential storage in Vault and the 90-day rotation rule"),
        (h, "Q4 Roadmap: Billing Platform Migration", "Finance sign-off is a go-live dependency"),
        (m1, "Engineering Manager Playbook", "Defines what the go-live readiness checklist needs"),
        (m2, "Engineering Manager Playbook", "Weekly Friday status note to Finance and Head of Engineering"),
        (m3, "Postmortem INC-142: Duplicate invoices on plan change", "Background on the fix being chased"),
    ]:
        db.add(ItemKBLink(item_id=it.id, doc_id=docs[title].id, reason=reason, confidence=0.9, source="manual"))

    for m in (w1, w2, w3):
        db.add(KBDoc(title=f"Recap: {m.title}", doc_type="meeting_recap", meeting_id=m.id,
                     content=m.summary + "\n\nDecisions:\n" + "\n".join(f"- {x.text}" for x in m.decisions)))
    for it in (a, b, c, d, e, f, g):
        it.created_at = it.origin_meeting.scheduled_at
    for it in (h, i, j, k, m1, m2, m3):
        it.created_at = _at(w3d)
    db.commit()
    log.info("Seed data created", extra={"event": "seed_created", "people": len(PEOPLE), "kb_docs": len(KB)})

