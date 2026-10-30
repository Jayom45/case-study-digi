# Handover AI — never lose context when work changes hands

> Submission README for the DigiPlus technical assessment. Sections marked TODO are finished at the end.

**Live demo:** TODO · **API docs:** `<live-url>/docs`

## What it does
TODO (3–4 lines + screenshot)

## Approach & architecture
- FastAPI + SQLAlchemy + SQLite backend; React (Vite) frontend served by the same app → one deployable unit.
- An action item is one row for its whole life; carrying it forward links it to the next meeting and appends an event,
  so the full history is always available.
- TODO: diagram + key design decisions

## AI configuration
- Provider: Google Gemini (`GEMINI_MODEL`, default `gemini-2.5-flash`), key via `GEMINI_API_KEY` env var.
- Uses: recap extraction, catch-up briefs, takeover packs, knowledge-base linking, follow-up nudges.
- Reliability: JSON-only output validated by Pydantic schemas, retry with error feedback, timeouts, post-checks
  (owners must be participants, quotes must appear verbatim in the notes, links must reference real docs),
  human review of recap drafts, deterministic fallbacks labelled in the UI, prompt-injection guard.

## Data source
Seeded, realistic data for a telecom billing-platform team (4 weekly syncs, handovers, overdue and stale items,
6 knowledge-base documents, a raw chat-log incident review for the live AI demo). Dates are relative to today.

## Logging
JSON lines to `logs/app.log` (rotating) and stdout. Every line has `ts, level, logger, request_id, message, event`.
Request ID from `X-Request-ID` or generated, echoed in responses and error bodies. Key events: `item_created`,
`item_reassigned`, `item_closed`, `item_carried_forward`, `meeting_created`, `recap_applied`, `brief_generated`, …
AI calls: `event=ai_call` with `operation, model, attempt, latency_ms, outcome`. Secrets are redacted by a filter.

## Special feature
TODO: Role-aware Takeover Pack — why it adds value.

## Assumptions
- No authentication; a "who are you" switcher selects the persona (out of scope for the time box).
- Input is pasted or uploaded text; audio transcription is out of scope.

## Known limitations
- SQLite on a free host resets on redeploy (seed data is re-created).
- TODO

## Run locally
See `CLAUDE.md` §5. Tests: `python -m pytest -q`.
