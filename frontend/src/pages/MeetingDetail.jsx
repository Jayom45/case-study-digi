// One meeting/handover: recap (AI draft -> human review -> save), decisions, items, participants,
// catch-up briefs / takeover packs for absentees, carry-forward.
import {
  AlertTriangle, ArrowLeft, ArrowRight, ArrowRightLeft, BadgeCheck, CalendarDays, FileUp, Landmark, ListTodo, Plus,
  Sparkles, Trash2, Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import ItemDrawer from "../components/ItemDrawer";
import { useToast } from "../components/Toasts";
import {
  Avatar, Badge, Button, Card, Field, Input, PageSkeleton, Section, Select, SourceBadge, StatusBadge, Textarea,
} from "../components/ui";
import { useViewer } from "../components/Viewer";
import { fmtDate, fmtDateTime } from "../format";
import { useLoad } from "../hooks";

const NEXT_STATUS = { scheduled: ["held", "Mark as held"], held: ["closed", "Close meeting"], closed: ["held", "Reopen"] };
const ATTENDANCE_COLOR = { attended: "green", absent: "amber", invited: "slate" };

function QuoteBadge({ verified }) {
  return verified
    ? <Badge color="green"><BadgeCheck className="h-3 w-3" /> quote found in notes</Badge>
    : <Badge color="amber"><AlertTriangle className="h-3 w-3" /> not traced to notes</Badge>;
}

/** Paste/upload notes -> AI draft -> review/edit -> save. Nothing is saved until "Save recap". */
function RecapPanel({ meeting, onSaved }) {
  const { people } = useViewer();
  const toast = useToast();
  const [notes, setNotes] = useState(meeting.raw_notes || "");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const owners = meeting.participants.length ? meeting.participants.map((p) => p.person) : people;

  const upload = (e) => {
    const file = e.target.files?.[0];
    if (file) file.text().then(setNotes);
  };

  const generate = () => {
    setBusy(true);
    api.post(`/meetings/${meeting.id}/recap`, { raw_notes: notes }).then(setDraft).finally(() => setBusy(false));
  };

  const save = () => {
    setBusy(true);
    api.post(`/meetings/${meeting.id}/recap/apply`, {
      summary: draft.summary, source: draft.source,
      decisions: draft.decisions.map(({ text, source_quote }) => ({ text, source_quote })),
      action_items: draft.action_items.map(({ title, owner_id, due_date, source_quote }) => ({ title, owner_id, due_date, source_quote })),
    }).then((m) => {
      setDraft(null);
      onSaved(m);
      toast({ type: "success", message: "Recap saved: items created and added to the knowledge base" });
    }).finally(() => setBusy(false));
  };

  const setItem = (i, patch) => setDraft((d) => ({ ...d, action_items: d.action_items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setDecision = (i, text) => setDraft((d) => ({ ...d, decisions: d.decisions.map((x, j) => (j === i ? { ...x, text } : x)) }));
  const removeAt = (key, i) => setDraft((d) => ({ ...d, [key]: d[key].filter((_, j) => j !== i) }));

  if (meeting.status === "closed") return null;

  if (!draft) {
    return (
      <Section title="AI recap from raw notes" icon={Sparkles} hint="paste notes, chats, transcripts or emails">
        <Textarea rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} className="font-mono text-xs"
          placeholder="Paste messy notes here…" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={generate} disabled={busy || notes.trim().length < 20}>
            <Sparkles className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} /> {busy ? "Reading the notes…" : "Generate recap"}
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            <FileUp className="h-4 w-4" /> Upload .txt
            <input type="file" accept=".txt,.md,.log,text/plain" className="hidden" onChange={upload} />
          </label>
          <span className="text-xs text-slate-400">{notes.length.toLocaleString()} characters · the draft is not saved until you review it</span>
        </div>
      </Section>
    );
  }

  return (
    <Card className="border-indigo-200 p-6 ring-4 ring-indigo-50">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-600" />
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">Review the draft</h2>
        <SourceBadge source={draft.source} />
        {draft.latency_ms != null && <span className="text-xs text-slate-400">{draft.model} · {(draft.latency_ms / 1000).toFixed(1)}s</span>}
      </div>

      {draft.warnings.length > 0 && (
        <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {draft.warnings.map((w, i) => <p key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</p>)}
        </div>
      )}

      <Field label="Summary">
        <Textarea rows={4} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
      </Field>

      <p className="mb-2 mt-5 text-xs font-semibold text-slate-600">Decisions ({draft.decisions.length})</p>
      <div className="space-y-2">
        {draft.decisions.map((d, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3">
            <div className="flex gap-2">
              <Input value={d.text} onChange={(e) => setDecision(i, e.target.value)} />
              <button onClick={() => removeAt("decisions", i)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <QuoteBadge verified={d.quote_verified} />
              {d.source_quote && <span className="italic text-slate-500">“{d.source_quote}”</span>}
            </div>
          </div>
        ))}
      </div>

      <p className="mb-2 mt-5 text-xs font-semibold text-slate-600">Action items ({draft.action_items.length})</p>
      <div className="space-y-2">
        {draft.action_items.map((it, i) => (
          <div key={i} className={`rounded-xl border p-3 ${it.warnings.length ? "border-amber-200 bg-amber-50/30" : "border-slate-200"}`}>
            <div className="grid gap-2 md:grid-cols-[1fr_180px_140px_auto]">
              <Input value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} />
              <Select value={it.owner_id || ""} onChange={(e) => setItem(i, { owner_id: Number(e.target.value) || null })}>
                <option value="">Unassigned{it.owner_name && !it.owner_id ? ` (AI said: ${it.owner_name})` : ""}</option>
                {owners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Input type="date" value={it.due_date || ""} onChange={(e) => setItem(i, { due_date: e.target.value || null })} />
              <button onClick={() => removeAt("action_items", i)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <QuoteBadge verified={it.quote_verified} />
              {it.warnings.map((w, j) => <span key={j} className="text-amber-700">{w}</span>)}
            </div>
            {it.source_quote && <p className="mt-1 text-xs italic text-slate-500">“{it.source_quote}”</p>}
          </div>
        ))}
      </div>

      {draft.open_questions.length > 0 && (
        <>
          <p className="mb-2 mt-5 text-xs font-semibold text-slate-600">Open questions</p>
          <ul className="space-y-1 text-sm text-slate-600">{draft.open_questions.map((q, i) => <li key={i}>• {q}</li>)}</ul>
        </>
      )}

      <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={() => setDraft(null)}>Discard draft</Button>
        <Button onClick={save} disabled={busy || draft.summary.trim().length < 10}>{busy ? "Saving…" : "Save recap"}</Button>
      </div>
    </Card>
  );
}

function AddItem({ meeting, onAdded }) {
  const { people } = useViewer();
  const [form, setForm] = useState(null);
  if (!form) return <Button variant="ghost" onClick={() => setForm({ title: "", owner_id: "", due_date: "" })}><Plus className="h-4 w-4" /> Add item</Button>;
  const save = () => api.post("/items", {
    meeting_id: meeting.id, title: form.title, owner_id: Number(form.owner_id) || null, due_date: form.due_date || null,
  }).then(() => { setForm(null); onAdded(); });
  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_170px_140px_auto]">
      <Input autoFocus placeholder="What needs to happen?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <Select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
        <option value="">Owner…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
      <div className="flex gap-1">
        <Button onClick={save} disabled={form.title.trim().length < 3}>Add</Button>
        <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
      </div>
    </div>
  );
}

function Briefs({ meeting, onCreated }) {
  const [busy, setBusy] = useState(null);
  const quickBrief = (personId) => {
    setBusy(personId);
    api.post(`/meetings/${meeting.id}/briefs`, { person_id: personId }).then(onCreated).finally(() => setBusy(null));
  };
  return (
    <Section title="Catch-up" icon={Users} hint="for absentees and receivers">
      {meeting.needs_brief.length === 0 && <p className="text-sm text-slate-400">Everyone attended.</p>}
      <ul className="space-y-3">
        {meeting.needs_brief.map((p) => (
          <li key={p.id} className="flex items-center gap-3">
            <Avatar name={p.name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{p.name}</span>
            <Link to={`/takeover/${meeting.id}/${p.id}`} className="text-xs font-medium text-indigo-600 hover:underline">Pack</Link>
            <button onClick={() => quickBrief(p.id)} disabled={busy === p.id} className="text-xs font-medium text-slate-500 hover:text-indigo-600">
              {busy === p.id ? "…" : "Quick brief"}
            </button>
          </li>
        ))}
      </ul>
      {meeting.briefs.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {meeting.briefs.map((b) => (
            <details key={b.id} className="rounded-xl bg-slate-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-slate-700">{b.content.headline}</summary>
              <div className="mt-2 space-y-2 text-slate-600">
                <div className="flex items-center gap-2"><SourceBadge source={b.source} /><span className="text-xs text-slate-400">{fmtDateTime(b.created_at)}</span></div>
                {["what_happened", "decisions", "your_items", "watch_out"].map((k) => b.content[k]?.length > 0 && (
                  <div key={k}><p className="text-xs font-semibold capitalize text-slate-500">{k.replace("_", " ")}</p>
                    <ul className="text-xs">{b.content[k].map((x, i) => <li key={i}>• {x}</li>)}</ul></div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </Section>
  );
}

function CarryForward({ meeting, onDone }) {
  const { data: meetings } = useLoad(() => api.get("/meetings?kind=meeting"));
  const [from, setFrom] = useState("");
  const run = () => api.post(`/meetings/${meeting.id}/carry-forward?from_meeting_id=${from}`).then(onDone);
  return (
    <Section title="Carry forward" icon={ArrowRight} hint="same items, history kept">
      <div className="flex gap-2">
        <Select value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">From meeting…</option>
          {(meetings || []).filter((m) => m.id !== meeting.id).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </Select>
        <Button variant="secondary" onClick={run} disabled={!from}>Carry</Button>
      </div>
    </Section>
  );
}

export default function MeetingDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data: m, loading, setData, reload } = useLoad(() => api.get(`/meetings/${id}`), [id]);
  const [openItem, setOpenItem] = useState(null);
  if (loading || !m) return <PageSkeleton />;

  const [nextStatus, nextLabel] = NEXT_STATUS[m.status];
  const changeStatus = () => api.patch(`/meetings/${m.id}`, { status: nextStatus }).then((fresh) => {
    setData(fresh);
    toast({ type: "success", message: `Meeting ${nextStatus}` });
  });

  return (
    <div className="space-y-6">
      <div>
        <Link to="/manage/meetings" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> All meetings
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">{m.kind === "handover" ? "Work handover" : m.series || "Meeting"}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{m.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <CalendarDays className="h-4 w-4" /> {fmtDateTime(m.scheduled_at)}
              <StatusBadge status={m.status} />
              {m.recap_source && m.recap_source !== "manual" && <SourceBadge source={m.recap_source} />}
              {m.previous_meeting_id && <Link to={`/manage/meetings/${m.previous_meeting_id}`} className="text-indigo-600 hover:underline">← previous</Link>}
              {m.next_meeting_id && <Link to={`/manage/meetings/${m.next_meeting_id}`} className="text-indigo-600 hover:underline">next →</Link>}
            </div>
          </div>
          <Button variant={m.status === "closed" ? "secondary" : "primary"} onClick={changeStatus}>{nextLabel}</Button>
        </div>
      </div>

      {m.kind === "handover" && m.handover_from && (
        <Card className="flex flex-wrap items-center gap-4 p-5">
          <ArrowRightLeft className="h-5 w-5 text-violet-600" />
          <div className="flex items-center gap-2"><Avatar name={m.handover_from.name} size="sm" /><span className="text-sm font-medium">{m.handover_from.name}</span></div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <div className="flex items-center gap-2"><Avatar name={m.handover_to.name} size="sm" /><span className="text-sm font-medium">{m.handover_to.name}</span></div>
          <Link to={`/takeover/${m.id}/${m.handover_to.id}`} className="ml-auto text-sm font-medium text-indigo-600 hover:underline">Open Takeover Pack →</Link>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {m.summary && (
            <Section title="Summary" icon={Sparkles}>
              <p className="text-[15px] leading-relaxed text-slate-700">{m.summary}</p>
            </Section>
          )}

          <RecapPanel meeting={m} onSaved={setData} />

          <Section title="Decisions" icon={Landmark}>
            <ul className="space-y-2">
              {m.decisions.map((d) => (
                <li key={d.id} className="rounded-xl border-l-4 border-indigo-400 bg-slate-50/60 px-4 py-2.5 text-sm text-slate-800">
                  {d.text}
                  {d.source_quote && <p className="mt-1 text-xs italic text-slate-500">“{d.source_quote}”</p>}
                </li>
              ))}
              {!m.decisions.length && <li className="text-sm text-slate-400">None recorded yet.</li>}
            </ul>
          </Section>

          <Section title="Action items" icon={ListTodo} hint="click an item for history, close or nudge">
            <div className="divide-y divide-slate-100">
              {m.items.map((it) => (
                <button key={it.id} onClick={() => setOpenItem(it.id)} className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-slate-50">
                  <span className="font-mono text-xs text-slate-400">#{it.id}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{it.title}</span>
                  {it.relation !== "origin" && <Badge color={it.relation === "handover" ? "indigo" : "amber"}>{it.relation}</Badge>}
                  <span className="w-28 truncate text-xs text-slate-500">{it.owner?.name || "unassigned"}</span>
                  <span className={`w-14 text-right text-xs ${it.is_overdue ? "font-semibold text-rose-600" : "text-slate-500"}`}>{fmtDate(it.due_date)}</span>
                  <StatusBadge status={it.status} />
                </button>
              ))}
              {!m.items.length && <p className="py-2 text-sm text-slate-400">No items yet. Generate a recap or add one.</p>}
            </div>
            {m.status !== "closed" && <AddItem meeting={m} onAdded={reload} />}
          </Section>
        </div>

        <aside className="space-y-6">
          <Section title="Participants" icon={Users}>
            <ul className="space-y-2.5">
              {m.participants.map((p) => (
                <li key={p.person.id} className="flex items-center gap-3">
                  <Avatar name={p.person.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700">{p.person.name}</span>
                    <span className="block truncate text-xs text-slate-400">{p.person.role}</span>
                  </span>
                  <Badge color={ATTENDANCE_COLOR[p.attendance]}>{p.attendance}</Badge>
                </li>
              ))}
              {!m.participants.length && <li className="text-sm text-slate-400">No participants.</li>}
            </ul>
          </Section>
          <Briefs meeting={m} onCreated={reload} />
          {m.kind === "meeting" && m.status !== "closed" && <CarryForward meeting={m} onDone={setData} />}
          {m.agenda && (
            <Section title="Agenda">
              <p className="whitespace-pre-wrap text-sm text-slate-600">{m.agenda}</p>
            </Section>
          )}
        </aside>
      </div>

      {openItem && <ItemDrawer itemId={openItem} onClose={() => setOpenItem(null)} onChanged={reload} />}
    </div>
  );
}
