# CLAUDE.md — Handover AI (DigiPlus technical assessment)

Read this whole file before doing anything. It is the single source of truth for this session.

## 0. Situation (why speed + simplicity matter)

- I'm Jayom, a final-year Computer Engineering student at SPIT Mumbai, doing a **live, timed online assessment** for
  **DigiPlus IT** (Mumbai; IT consulting + AI products; telecom OSS/BSS, banking). Role: Software Engineer intern → PPO.
- **Time box: 3.5 hours total, clock started ~11:00 IST on 30 Oct 2026.** I'm aiming to finish well before that.
  Ship a working, deployed app first; polish only after.
- AI coding assistants are allowed, **but I must be able to explain every decision in the interview.**
  So: simple, readable code; a short comment wherever a decision isn't obvious; no clever abstractions;
  no extra libraries unless they clearly save time.
- When you finish a step, tell me in 2–3 lines what you did and why, so I can explain it later.

## 1. The assignment (summary of the official problem statement)

"AI-Powered Knowledge & Tasks Management Platform". Teams lose context when work changes hands (missed meetings,
leave, forgotten action items). Build a small AI app that captures what was discussed/decided, transfers that
context to the right people, and follows up on open items until closed. Input can be messy: docs, notes, chats,
transcripts, emails.

Required outcomes:
1. Create/persist meetings **or work transfers**: agenda, participants, notes, decisions, action items.
2. View/manage their lifecycle; track every action item (owner, due date, status) until closed.
3. Carry open items forward to the next meeting/transfer, **keeping their history**.
4. AI turns raw unstructured text into a structured recap: summary, decisions, action items, owners.
5. AI catch-up brief for anyone who missed the meeting or is taking over.
6. Small knowledge base (team docs + past meetings); AI links items to it.
7. Record the outcome of each item.
8. Validation and error handling.

AI must be meaningful (not just hard-coded rules) and **AI failures must be handled gracefully**.

Logging (scored separately): structured logs, proper levels, **correlation/request ID per request**, key events
(created, reassigned, item closed), **AI calls with latency and outcome**, errors with context, **output to a file**,
**no secrets in logs**.

"Make it special": at least one feature of my own, explained in the README.
Submission: source + README (AI config, data source, logging setup, special feature, approach, assumptions,
known limitations) + **deployed app**.

Assessment focus: Functionality · AI (use, reasoning, reliability) · Engineering (design, code quality) ·
Data (quality of own data, persistence) · Logging · Originality · UX.

## 2. What is ALREADY DONE (backend — working, 11 tests passing)

Stack: **FastAPI + SQLAlchemy 2 + SQLite + Pydantic v2 + httpx → Gemini REST API.** Single deployable unit:
FastAPI also serves the built React app from `frontend/dist`.

```
backend/app/
  main.py            app, request-ID middleware, JSON error handlers, SPA static serving, startup seed
  config.py          env settings (GEMINI_API_KEY, GEMINI_MODEL, LOG_LEVEL, LOG_FILE, DATABASE_URL, ...)
  logging_setup.py   JSON formatter, request_id contextvar, rotating file + stdout, secret redaction
  db.py              engine/session (SQLite pragmas: foreign keys, WAL)
  models.py          schema (see below)
  schemas.py         Pydantic request/response models = validation at the edge
  errors.py          AppError/NotFound/Conflict/InvalidState -> {"error":{code,message,details,request_id}}
  serializers.py     ORM -> API shapes
  seed.py            realistic demo data (dates relative to today)
  services/ai.py            generate_json(): JSON-only, schema-validated, timeout, retry w/ error feedback, logs every attempt
  services/intelligence.py  recap / brief / KB-linking / nudge: prompt + schema + post-checks + deterministic fallback
  services/workflow.py      business rules: create/update/close items, carry_forward, apply_handover, events
  routers/meetings.py, items.py, misc.py
backend/tests/test_app.py   11 tests (run `python -m pytest -q` from repo root)
samples/incident_review_notes.txt   messy chat log used for the live AI demo
```

### Data model
- `people` (name, email, role)
- `meetings` — a meeting OR a handover (`kind`), `status` scheduled→held→closed, agenda, raw_notes, summary,
  recap_source (ai|fallback|manual), previous_meeting_id (series chain), handover_from_id / handover_to_id
- `participants` (meeting, person, attendance invited|attended|absent)
- `decisions` (meeting, text, source_quote)
- `action_items` — ONE row for the item's whole life: owner, due_date, status (open|in_progress|blocked|done|dropped),
  outcome (required to close), origin_meeting_id, source_quote, carry_count
- `meeting_items` — every meeting an item appeared in (relation: origin|carried|handover) → carry-forward without copying
- `item_events` — append-only history (created, updated, reassigned, status_changed, carried_forward, closed, reopened,
  kb_linked, nudge_drafted). Every event is ALSO written to the log.
- `kb_docs` (document | meeting_recap), `item_kb_links` (reason, confidence, source ai|fallback|manual)
- `briefs` (meeting, person, content JSON, source ai|fallback)

### API (all under /api; interactive docs at /docs)
- `GET /health` · `GET/POST /people` · `GET/POST /kb`, `GET /kb/{id}` · `GET /dashboard` (counts, overdue, stale,
  upcoming, owner load, recent activity)
- `GET/POST /meetings`, `GET/PATCH /meetings/{id}` — creating with `previous_meeting_id` auto-carries open items;
  `kind=handover` auto-reassigns the from-person's open items to the to-person
- `POST /meetings/{id}/carry-forward?from_meeting_id=`
- `POST /meetings/{id}/recap` → **draft only, nothing saved** (AI, or fallback with warnings). Saves raw notes first so input is never lost.
- `POST /meetings/{id}/recap/apply` → user-reviewed draft is saved: summary, decisions, items, KB recap doc, AI KB links
- `POST /meetings/{id}/kb-links` · `POST /meetings/{id}/briefs {person_id}`
- `GET/POST /items`, `GET/PATCH /items/{id}` (closing requires outcome ≥5 chars), `POST /items/{id}/nudge`
- Filters: `/items?open_only=true&overdue=true&stale=true&owner_id=`

### AI reliability design (keep this pattern for anything new)
1. Prompt asks for JSON only; notes wrapped in `<notes>` + instruction to treat them as data (prompt-injection guard).
2. Output validated with a Pydantic schema; invalid → one retry with the validation error fed back.
3. Timeout + retry on 429/5xx/timeout; 4xx config errors fail fast.
4. Post-checks: owner must be a real participant; `source_quote` must appear verbatim in the notes (`quote_verified`);
   KB links must reference existing doc ids. Failures become visible warnings, not silent data.
5. Recap is a **draft the human reviews** before saving.
6. If AI is unavailable → deterministic fallback, output labelled `source: "fallback"` in the UI.
7. Every AI attempt logged: operation, model, attempt, latency_ms, outcome. API key sent in a header, never logged.

### Seed data story (telecom billing team, "Northwind Telecom")
Ananya (Eng Manager), Rahul (Backend), Priya (Frontend), Karan (QA), Sneha (PM), Vikram (DevOps), Arjun (Frontend).
Billing Sync weeks 1–3 (held) + week 4 (scheduled, items auto-carried); INC-142 fix carried 3 times (stale);
overdue items; Rahul absent in week 3 (needs brief); handover Priya → Arjun; 6 KB docs; an incident-review meeting
with ONLY raw chat notes → live "Generate recap" demo.

## 3. What to build NEXT (my product vision — the "special feature")

**Role-aware takeover.** The app knows who you are and what you're missing. A person picks themselves from the
company hierarchy, and gets a concise, AI-generated **Takeover Pack** tailored to the gap between the leaving
person's role and theirs.

### Screens & flow (examiner path)
1. **Welcome page** — clean, light UI, smooth entrance animation (framer-motion), hero line
   "Never lose context when work changes hands", three buttons:
   **I'm taking over work** · **I missed a meeting** · **Manage meetings**. Keep animation subtle and < 2s.
2. **Who are you?** — animated org chart (hierarchy). Each card: name, role, avatar initials; a glowing badge on
   people with something waiting (pending handover to them / missed meeting without a brief). Click = "become" that person.
3. **My inbox** (`/me/:personId`) — handovers coming to me + meetings I missed, each opens a pack.
4. **Takeover Pack** (`/takeover/:meetingId/:personId`) — the star screen, in this order, very concise:
   - **TL;DR** (max 3 lines)
   - **Where they left off** — timeline diagram built from item_events
   - **State of work** — workflow diagram: items by stage (not started → in progress → blocked → done)
   - **Your role gap** — what is new for *you* (e.g. Backend Engineer stepping into Eng Manager's work: approvals,
     running the sync, finance follow-ups) and what you can ignore
   - **Decisions you must respect** — each with its source meeting (clickable)
   - **What to do next** — first 3–5 actions, prioritised, as a checklist
   - **Who to ask** — people linked to each item
   - **Read these** — linked KB docs
   - **Takeover readiness meter** — 0–100%, rises as checklist items are ticked, docs opened, decisions acknowledged
   - Every line shows a small source tag (meeting / item #) → traceability
   - "Missed a meeting" uses the same layout, lighter: what happened, decisions, your items, watch-outs (existing brief)
5. **Manage** screens (required features, simpler styling OK): meetings list + detail (paste/upload notes →
   Generate recap → review/edit draft with warnings and quote badges → Save; items; carry forward; briefs),
   items tracker (filters: open/overdue/stale; item drawer with full history timeline, close-with-outcome dialog,
   AI nudge), knowledge base.
6. Persistent top bar: logo, "Viewing as <person>" switcher, links to Manage.

### Backend changes needed
- `people`: add `level` (int, 1 = top), `team`, `reports_to_id` → hierarchy. Add a **Head of Engineering**
  (e.g. "Meera Kapoor") above Ananya and Sneha.
- Seed: add a second handover **Ananya (Eng Manager) → Rahul (acting manager)** so the role-gap is obvious in the
  demo (peer handover Priya → Arjun already exists).
- `GET /api/org` → tree + badge counts per person. `GET /api/people/{id}/inbox` → handovers to them + missed meetings.
- `POST /api/meetings/{id}/takeover-pack {person_id}` → AI pack, stored (add `kind` = brief|takeover to `briefs`,
  or a new table). `GET` latest pack.
- Takeover pack AI output schema (validate; ids must exist; fallback = deterministic pack from data):
  ```json
  {"tldr": ["..."],
   "role_gap": {"from_role": "...", "to_role": "...", "new_for_you": ["..."], "can_ignore": ["..."]},
   "key_decisions": [{"text": "...", "meeting_id": 3}],
   "next_actions": [{"text": "...", "item_id": 5, "why": "..."}],
   "who_to_ask": [{"person_id": 2, "about": "..."}],
   "read_these": [{"doc_id": 1, "why": "..."}],
   "risks": ["..."]}
  ```
- **Diagrams are built by code from data, not drawn by the AI** (AI-generated diagram syntax can break; this is a
  reliability point I will explain). Timeline = item_events; workflow = item statuses. Render with Mermaid or simple
  React/SVG components.
- Readiness progress persisted in the DB (e.g. `takeover_progress(meeting_id, person_id, checked JSON)`), with
  `PATCH` endpoint and a log event `takeover_progress_updated`.
- Every new state change: write an event/log line with `event` field. Every new AI call goes through
  `services/ai.generate_json` + a fallback.

### Frontend stack
React + Vite (JavaScript/JSX for speed), Tailwind CSS, framer-motion, react-router, mermaid (or plain SVG).
Light theme, generous whitespace, one accent colour (indigo), Inter font, rounded cards, soft shadows,
skeleton loaders, toast for errors (show `request_id` from the error JSON). Vite dev proxy `/api` → `http://localhost:8000`.
`npm run build` → `frontend/dist`, which FastAPI serves in production.

### Build order (strict — functionality before polish)
1. Backend additions (org, inbox, takeover pack + fallback, seed changes) + tests stay green
2. Frontend shell: router, top bar, API client, error toasts
3. Who-are-you org chart → inbox → Takeover Pack (with diagrams)
4. Manage screens: meeting detail with recap draft review; items tracker with close/nudge/history; KB list
5. Welcome page animations
6. Deploy (Dockerfile + render.yaml provided) → README → final demo run-through

## 4. Rules for this codebase
- Run `python -m pytest -q` after backend changes; keep it green; add a test for each new endpoint.
- Never log secrets or full raw notes; use `log.info("...", extra={"event": "...", ...})`.
- Validation in Pydantic schemas; domain errors via `errors.py` classes (never bare 500s).
- Keep files small and readable. Prefer clarity over cleverness. I must be able to explain it.
- Don't touch `.env`; config comes from env vars (see `.env.example`).
- After every change that adds or modifies a feature, endpoint, screen, table or design decision, update README.md and UNDERSTANDING.md in the same step so they always match the code. Mention which sections you updated.

## 5. Run locally
```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
cp .env.example .env    # put GEMINI_API_KEY in it
cd backend && uvicorn app.main:app --reload --port 8000   # API docs: http://localhost:8000/docs
# delete backend/data/app.db to re-seed
```
