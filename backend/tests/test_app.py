import json
import os
from pathlib import Path

import pytest

TMP = Path(__file__).parent / ".tmp"
TMP.mkdir(exist_ok=True)
for f in TMP.glob("*"):
    f.unlink()
os.environ.update(DATABASE_URL=f"sqlite:///{TMP / 'test.db'}", LOG_FILE=str(TMP / "test.log"),
                  GEMINI_API_KEY="AIzaTESTKEY_should_never_appear_in_logs_123", AI_MAX_ATTEMPTS="2")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import ai  # noqa: E402

ai.time.sleep = lambda *_: None  # no backoff waits in tests


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def fake_model(payload):
    return lambda system, prompt: json.dumps(payload)


def incident(client):
    return next(m for m in client.get("/api/meetings").json() if m["title"].startswith("Incident"))


def test_seed_and_dashboard(client):
    d = client.get("/api/dashboard").json()
    assert d["counts"]["open"] >= 5 and d["counts"]["overdue"] >= 1 and d["counts"]["stale"] >= 1


def test_request_id_header_and_validation_error(client):
    r = client.post("/api/meetings", json={"title": "x", "scheduled_at": "bad"}, headers={"X-Request-ID": "abc123"})
    assert r.status_code == 422
    assert r.headers["X-Request-ID"] == "abc123"
    assert r.json()["error"]["request_id"] == "abc123"


def test_closing_requires_outcome(client):
    item = client.get("/api/items?open_only=true").json()[0]
    r = client.patch(f"/api/items/{item['id']}", json={"status": "done"})
    assert r.status_code == 422 and "outcome" in r.json()["error"]["message"]
    r = client.patch(f"/api/items/{item['id']}", json={"status": "done", "outcome": "Shipped in release 4.2"})
    assert r.status_code == 200 and r.json()["closed_at"]
    assert r.json()["events"][-1]["event_type"] == "closed"


def test_carry_forward_keeps_same_item(client):
    people = client.get("/api/people").json()
    m1 = client.post("/api/meetings", json={"title": "Sync A", "scheduled_at": "2026-11-01T10:00:00Z",
                                            "participants": [{"person_id": people[0]["id"]}]}).json()
    it = client.post("/api/items", json={"title": "Ship thing", "meeting_id": m1["id"], "owner_id": people[0]["id"]}).json()
    m2 = client.post("/api/meetings", json={"title": "Sync B", "scheduled_at": "2026-11-08T10:00:00Z",
                                            "previous_meeting_id": m1["id"]}).json()
    carried = [i for i in m2["items"] if i["id"] == it["id"]]
    assert carried and carried[0]["relation"] == "carried" and carried[0]["carry_count"] == 1
    detail = client.get(f"/api/items/{it['id']}").json()
    assert [m["id"] for m in detail["meetings"]] == [m1["id"], m2["id"]]
    assert any(e["event_type"] == "carried_forward" for e in detail["events"])


def test_handover_reassigns_open_items(client):
    people = client.get("/api/people").json()
    a, b = people[0]["id"], people[1]["id"]
    r = client.post("/api/meetings", json={"title": "Handover test", "kind": "handover", "scheduled_at": "2026-11-02T10:00:00Z",
                                           "handover_from_id": a, "handover_to_id": b})
    assert r.status_code == 201
    assert all(i["owner"]["id"] == b for i in r.json()["items"])
    assert client.get(f"/api/items?owner_id={a}&open_only=true").json() == []


def test_ai_recap_validates_owners_and_quotes(client, monkeypatch):
    m = incident(client)
    monkeypatch.setattr(ai, "transport", fake_model({
        "summary": "Prepaid users were double charged because the consumer retried without dedupe.",
        "decisions": [{"text": "Auto-refund duplicate charges", "source_quote": "we auto-refund the duplicate charge this time"}],
        "action_items": [
            {"title": "Add dedupe table on activation_id", "owner": "Rahul", "due_date": "2026-11-02",
             "source_quote": "I can add a dedupe table keyed on activation_id"},
            {"title": "Raise broker ack timeout", "owner": "Somebody Unknown", "due_date": None,
             "source_quote": "this quote is invented"}]}))
    draft = client.post(f"/api/meetings/{m['id']}/recap", json={}).json()
    assert draft["source"] == "ai"
    good, bad = draft["action_items"]
    assert good["owner_id"] and good["quote_verified"]
    assert bad["owner_id"] is None and not bad["quote_verified"] and bad["warnings"]
    assert draft["decisions"][0]["quote_verified"]


def test_ai_failure_falls_back_and_input_is_kept(client, monkeypatch):
    m = incident(client)
    calls = []

    def broken(system, prompt):
        calls.append(1)
        return "not json at all"

    monkeypatch.setattr(ai, "transport", broken)
    notes = "Decision: ship on Monday\nAction: Rahul to fix the consumer dedupe\nSome other chatter here."
    r = client.post(f"/api/meetings/{m['id']}/recap", json={"raw_notes": notes})
    assert r.status_code == 200
    draft = r.json()
    assert draft["source"] == "fallback" and len(calls) == 2  # retried once, then fell back
    assert draft["decisions"] and draft["action_items"]
    assert client.get(f"/api/meetings/{m['id']}").json()["raw_notes"] == notes


def test_apply_recap_creates_items_and_kb_doc(client, monkeypatch):
    m = incident(client)
    people = client.get("/api/people").json()
    monkeypatch.setattr(ai, "transport", fake_model({"links": []}))
    r = client.post(f"/api/meetings/{m['id']}/recap/apply", json={
        "summary": "Duplicate SMS bundle charges caused by consumer retries.",
        "decisions": [{"text": "Auto-refund duplicates"}],
        "action_items": [{"title": "Add dedupe on activation_id", "owner_id": people[1]["id"]}], "source": "ai"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "held" and len(body["items"]) == 1
    assert any(d["meeting_id"] == m["id"] for d in client.get("/api/kb").json())


def test_brief_uses_fallback_when_ai_down(client, monkeypatch):
    def down(system, prompt):
        import httpx
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(ai, "transport", down)
    w3 = next(m for m in client.get("/api/meetings").json() if m["title"] == "Billing Sync - Week 3")
    detail = client.get(f"/api/meetings/{w3['id']}").json()
    absent = detail["needs_brief"][0]
    r = client.post(f"/api/meetings/{w3['id']}/briefs", json={"person_id": absent["id"]})
    assert r.status_code == 200 and r.json()["source"] == "fallback" and r.json()["content"]["headline"]


def test_logs_are_json_with_request_ids_and_no_secrets(client):
    lines = [json.loads(l) for l in (TMP / "test.log").read_text().splitlines() if l.strip()]
    assert all({"ts", "level", "request_id", "message"} <= set(l) for l in lines)
    events = {l.get("event") for l in lines}
    assert {"http_request", "item_created", "item_closed", "item_reassigned", "ai_call"} <= events
    ai_lines = [l for l in lines if l.get("event") == "ai_call"]
    assert all("latency_ms" in l and "outcome" in l for l in ai_lines)
    assert "AIzaTESTKEY" not in (TMP / "test.log").read_text()


def test_unknown_ids_return_404(client):
    r = client.get("/api/items/99999")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


# ---------- Role-aware takeover ----------
def person(client, first):
    return next(p for p in client.get("/api/people").json() if p["name"].startswith(first))


def ananya_to_rahul(client):
    return next(m for m in client.get("/api/meetings?kind=handover").json() if "Ananya -> Rahul" in m["title"])


def test_org_tree_and_badges(client):
    roots = client.get("/api/org").json()["roots"]
    assert [r["name"] for r in roots] == ["Meera Kapoor"]
    assert sorted(len(m["reports"]) for m in roots[0]["reports"]) == [3, 4, 5]  # three teams
    ananya = next(r for r in roots[0]["reports"] if r["name"] == "Ananya Rao")
    rahul = next(r for r in ananya["reports"] if r["name"] == "Rahul Mehta")
    assert rahul["badges"]["handovers"] >= 1  # Ananya -> Rahul handover waiting
    assert ananya["badges"]["missed"] >= 1  # she was absent from the Priya -> Arjun handover


def test_inbox_lists_handovers_and_missed_meetings(client):
    rahul = person(client, "Rahul")
    box = client.get(f"/api/people/{rahul['id']}/inbox").json()
    assert any(h["from_person"]["name"] == "Ananya Rao" and h["open_items"] >= 3 for h in box["handovers"])
    assert any(m["meeting"]["title"] == "Billing Sync - Week 3" for m in box["missed"])
    assert box["my_items"]
    priya = client.get(f"/api/people/{person(client, 'Priya')['id']}/inbox").json()
    assert [g["to_person"]["name"] for g in priya["handed_over"]] == ["Arjun Desai"]
    assert client.get("/api/people/99999/inbox").status_code == 404


def test_takeover_pack_ai_ids_are_checked(client, monkeypatch):
    rahul, ho = person(client, "Rahul"), ananya_to_rahul(client)
    detail = client.get(f"/api/meetings/{ho['id']}").json()
    item_id, decision_id = detail["items"][0]["id"], detail["decisions"][0]["id"]
    monkeypatch.setattr(ai, "transport", fake_model({
        "tldr": ["You are acting EM for two weeks."],
        "role_gap": {"from_role": "Engineering Manager", "to_role": "Backend Engineer",
                     "new_for_you": ["Approve the go-live checklist"], "can_ignore": ["Budget review"]},
        "key_decisions": [{"decision_id": decision_id, "why": "Defines your authority"},
                          {"decision_id": 99999, "why": "invented"}],
        "next_actions": [{"text": "Run the Week 4 sync", "item_id": item_id, "why": "Due soon"},
                         {"text": "Do something invented", "item_id": 99999, "why": "?"}],
        "who_to_ask": [{"person_id": person(client, "Meera")["id"], "about": "Escalations"},
                       {"person_id": 99999, "about": "ghost"}],
        "read_these": [{"doc_id": 99999, "why": "ghost doc"}],
        "risks": ["INC-142 slipped 3 times"]}))
    r = client.post(f"/api/meetings/{ho['id']}/takeover-pack", json={"person_id": rahul["id"]})
    assert r.status_code == 201
    pack = r.json()
    c = pack["content"]
    assert pack["source"] == "ai" and c["mode"] == "handover"
    assert [d["decision_id"] for d in c["key_decisions"]] == [decision_id]
    assert c["key_decisions"][0]["meeting_id"] == ho["id"]  # traceable to its source meeting
    assert c["next_actions"][1]["item_id"] is None and c["read_these"] == []
    assert [w["name"] for w in c["who_to_ask"]] == ["Meera Kapoor"]
    assert len(c["warnings"]) == 4
    assert pack["timeline"] and sum(len(v) for v in pack["workflow"].values()) >= 3
    got = client.get(f"/api/meetings/{ho['id']}/takeover-pack?person_id={rahul['id']}").json()
    assert got["id"] == pack["id"]


def test_takeover_pack_fallback_and_readiness(client, monkeypatch):
    def down(system, prompt):
        import httpx
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(ai, "transport", down)
    rahul, ho = person(client, "Rahul"), ananya_to_rahul(client)
    pack = client.post(f"/api/meetings/{ho['id']}/takeover-pack", json={"person_id": rahul["id"]}).json()
    c = pack["content"]
    assert pack["source"] == "fallback" and c["warnings"] and c["next_actions"][0]["item_id"]
    assert "more senior role" in c["role_gap"]["new_for_you"][0]
    assert pack["progress"]["readiness"] == 0

    url = f"/api/takeover-packs/{pack['id']}/progress"
    assert client.patch(url, json={"checked": ["action:999"]}).status_code == 422
    first = client.patch(url, json={"checked": ["action:0"]}).json()
    assert 0 < first["readiness"] < 100
    keys = ([f"action:{n}" for n in range(len(c["next_actions"]))]
            + [f"decision:{d['decision_id']}" for d in c["key_decisions"]]
            + [f"doc:{d['doc_id']}" for d in c["read_these"]])
    assert client.patch(url, json={"checked": keys}).json()["readiness"] == 100
    # Fully ready -> no longer waiting in the inbox.
    box = client.get(f"/api/people/{rahul['id']}/inbox").json()
    assert next(h for h in box["handovers"] if h["meeting"]["id"] == ho["id"])["done"]
    events = {json.loads(l).get("event") for l in (TMP / "test.log").read_text().splitlines() if l.strip()}
    assert {"takeover_pack_generated", "takeover_progress_updated"} <= events
