// Meetings & handovers list + "New meeting / handover" dialog.
import { ArrowRightLeft, CalendarDays, Plus, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageSkeleton, Select, StatusBadge, Textarea } from "../components/ui";
import { useViewer } from "../components/Viewer";
import { fmtDate } from "../format";
import { useLoad } from "../hooks";

const TABS = [
  { key: "", label: "All" },
  { key: "meeting", label: "Meetings" },
  { key: "handover", label: "Handovers" },
];

function NewMeetingModal({ meetings, onClose }) {
  const { people } = useViewer();
  const navigate = useNavigate();
  const [form, setForm] = useState({ kind: "meeting", title: "", when: "", agenda: "", previous: "", from: "", to: "" });
  const [invited, setInvited] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggle = (id) => setInvited((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const isHandover = form.kind === "handover";

  const save = () => {
    setSaving(true);
    const body = {
      kind: form.kind, title: form.title, agenda: form.agenda || null,
      scheduled_at: new Date(form.when).toISOString(),
      participants: [...invited].map((id) => ({ person_id: id })),
      previous_meeting_id: !isHandover && form.previous ? Number(form.previous) : null,
      handover_from_id: isHandover ? Number(form.from) || null : null,
      handover_to_id: isHandover ? Number(form.to) || null : null,
    };
    // Validation errors come back from Pydantic as a toast with the request id.
    api.post("/meetings", body).then((m) => navigate(`/manage/meetings/${m.id}`)).finally(() => setSaving(false));
  };

  return (
    <Modal title={isHandover ? "New work handover" : "New meeting"} onClose={onClose} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving || form.title.length < 3 || !form.when}>{saving ? "Creating…" : "Create"}</Button></>}>
      <div className="space-y-4">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {["meeting", "handover"].map((k) => (
            <button key={k} onClick={() => setForm({ ...form, kind: k })}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium capitalize transition ${form.kind === k ? "bg-white shadow-sm" : "text-slate-500"}`}>{k}</button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title"><Input value={form.title} onChange={set("title")} placeholder={isHandover ? "Handover: Rahul -> Karan" : "Billing Sync - Week 5"} /></Field>
          <Field label="Date & time"><Input type="datetime-local" value={form.when} onChange={set("when")} /></Field>
        </div>
        {isHandover ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Handing over" hint="Their open items move to the receiver automatically">
              <Select value={form.from} onChange={set("from")}><option value="">Choose…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}</Select>
            </Field>
            <Field label="Taking over">
              <Select value={form.to} onChange={set("to")}><option value="">Choose…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}</Select>
            </Field>
          </div>
        ) : (
          <Field label="Previous meeting in the series" hint="Open items from it are carried forward automatically, keeping their history">
            <Select value={form.previous} onChange={set("previous")}><option value="">None</option>
              {meetings.filter((m) => m.kind === "meeting").map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select>
          </Field>
        )}
        <Field label="Agenda"><Textarea rows={3} value={form.agenda} onChange={set("agenda")} placeholder={"1. Carried items\n2. …"} /></Field>
        <Field label={`Participants (${invited.size})`}>
          <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {people.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={invited.has(p.id)} onChange={() => toggle(p.id)} className="accent-indigo-600" />
                {p.name}
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

export default function Meetings() {
  const [tab, setTab] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, loading } = useLoad(() => api.get("/meetings"));
  if (loading || !data) return <PageSkeleton />;
  const shown = data.filter((m) => !tab || m.kind === tab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Manage</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Meetings & handovers</h1>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New</Button>
      </div>

      <div className="flex w-fit gap-1 rounded-xl bg-slate-100/80 p-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {shown.map((m) => (
          <Link key={m.id} to={`/manage/meetings/${m.id}`}>
            <Card className="flex items-center gap-4 px-5 py-4 transition hover:border-indigo-200 hover:shadow-md">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${m.kind === "handover" ? "bg-violet-50 text-violet-600" : "bg-indigo-50 text-indigo-600"}`}>
                {m.kind === "handover" ? <ArrowRightLeft className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-800">{m.title}</p>
                <p className="text-xs text-slate-500">
                  {fmtDate(m.scheduled_at)}{m.series && ` · ${m.series}`} · {m.open_items}/{m.total_items} items open
                </p>
              </div>
              {m.absent_count > 0 && <Badge color="amber"><Users className="h-3 w-3" /> {m.absent_count} absent</Badge>}
              {!m.recap_source && m.status === "scheduled" && <Badge color="slate">no recap</Badge>}
              <StatusBadge status={m.status} />
            </Card>
          </Link>
        ))}
        {!shown.length && <Card><Empty icon={CalendarDays} title="Nothing here yet" /></Card>}
      </div>

      {creating && <NewMeetingModal meetings={data} onClose={() => setCreating(false)} />}
    </div>
  );
}
