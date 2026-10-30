// Side drawer for one action item: edit, close with outcome, AI nudge, full history.
import { BookOpen, CalendarDays, Copy, History, Mail, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useLoad } from "../hooks";
import { fmtDate, fmtDateTime } from "../format";
import { useToast } from "./Toasts";
import { Badge, Button, Drawer, Field, Input, Modal, Select, Skeleton, SourceBadge, StatusBadge, Textarea } from "./ui";
import { useViewer } from "./Viewer";

const EVENT_DOT = {
  created: "bg-indigo-500", carried_forward: "bg-amber-500", reassigned: "bg-violet-500",
  status_changed: "bg-sky-500", closed: "bg-emerald-500", reopened: "bg-rose-500",
};

function CloseDialog({ item, onClose, onDone }) {
  const [status, setStatus] = useState("done");
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = outcome.trim().length >= 5; // same rule as the backend (schemas.ItemUpdate)
  const save = () => {
    setSaving(true);
    api.patch(`/items/${item.id}`, { status, outcome })
      .then(onDone)
      .finally(() => setSaving(false));
  };
  return (
    <Modal title="Close item" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={!valid || saving}>{saving ? "Saving…" : "Close item"}</Button></>}>
      <p className="mb-4 text-sm text-slate-600">{item.title}</p>
      <div className="space-y-4">
        <Field label="Close as">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="done">Done</option>
            <option value="dropped">Dropped (no longer needed)</option>
          </Select>
        </Field>
        <Field label="Outcome" hint="Required: what actually happened? (at least 5 characters)">
          <Textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)}
            placeholder="e.g. Fix shipped in release 4.2; duplicate invoices no longer created." />
        </Field>
      </div>
    </Modal>
  );
}

export default function ItemDrawer({ itemId, onClose, onChanged }) {
  const { people } = useViewer();
  const toast = useToast();
  const { data: item, setData, loading } = useLoad(() => api.get(`/items/${itemId}`), [itemId]);
  const [edit, setEdit] = useState(null);
  const [closing, setClosing] = useState(false);
  const [nudge, setNudge] = useState(null);
  const [nudging, setNudging] = useState(false);

  const updated = (fresh) => {
    setData(fresh);
    setEdit(null);
    onChanged?.();
  };

  const saveEdit = () => {
    const body = {};
    if (edit.status !== item.status) body.status = edit.status;
    if ((edit.owner_id || null) !== (item.owner?.id || null)) body.owner_id = edit.owner_id || null;
    if ((edit.due_date || null) !== (item.due_date || null)) body.due_date = edit.due_date || null;
    if (edit.note) body.note = edit.note;
    if (Object.keys(body).length === 0) return setEdit(null);
    api.patch(`/items/${item.id}`, body).then((fresh) => {
      updated(fresh);
      toast({ type: "success", message: "Item updated" });
    });
  };

  const draftNudge = () => {
    setNudging(true);
    api.post(`/items/${item.id}/nudge`).then(setNudge).finally(() => setNudging(false));
  };

  const reopen = () => api.patch(`/items/${item.id}`, { status: "open", note: "Reopened from tracker" }).then(updated);

  return (
    <Drawer onClose={onClose}>
      {loading || !item ? <div className="space-y-4 p-6"><Skeleton className="h-8" /><Skeleton className="h-40" /></div> : (
        <div>
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-slate-400">#{item.id}</p>
                <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.status} />
                  {item.is_overdue && <Badge color="red">overdue</Badge>}
                  {item.carry_count > 0 && <Badge color="amber">carried {item.carry_count}×</Badge>}
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="space-y-6 p-6">
            {item.description && <p className="text-sm text-slate-600">{item.description}</p>}

            {/* Facts / edit */}
            {!edit ? (
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-sm">
                <div><p className="text-xs text-slate-400">Owner</p><p className="font-medium text-slate-800">{item.owner?.name || "Unassigned"}</p></div>
                <div><p className="text-xs text-slate-400">Due</p><p className={`font-medium ${item.is_overdue ? "text-rose-600" : "text-slate-800"}`}>{fmtDate(item.due_date)}</p></div>
                {item.outcome && <div className="col-span-2"><p className="text-xs text-slate-400">Outcome</p><p className="text-slate-800">{item.outcome}</p></div>}
                {item.source_quote && <div className="col-span-2"><p className="text-xs text-slate-400">Source quote</p><p className="italic text-slate-600">“{item.source_quote}”</p></div>}
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status">
                    <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                      <option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option>
                    </Select>
                  </Field>
                  <Field label="Due date">
                    <Input type="date" value={edit.due_date || ""} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} />
                  </Field>
                </div>
                <Field label="Owner">
                  <Select value={edit.owner_id || ""} onChange={(e) => setEdit({ ...edit, owner_id: Number(e.target.value) || null })}>
                    <option value="">Unassigned</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
                  </Select>
                </Field>
                <Field label="Note (stored in history)">
                  <Input value={edit.note || ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="Why this change?" />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
                  <Button onClick={saveEdit}>Save changes</Button>
                </div>
              </div>
            )}

            {/* Actions */}
            {!edit && (
              <div className="flex flex-wrap gap-2">
                {item.closed_at ? <Button variant="secondary" onClick={reopen}>Reopen</Button> : (
                  <>
                    <Button variant="secondary" onClick={() => setEdit({ status: item.status, owner_id: item.owner?.id, due_date: item.due_date })}>Edit</Button>
                    <Button onClick={() => setClosing(true)}>Close with outcome</Button>
                    <Button variant="secondary" onClick={draftNudge} disabled={nudging}>
                      <Mail className="h-4 w-4" /> {nudging ? "Drafting…" : "AI follow-up"}
                    </Button>
                  </>
                )}
              </div>
            )}

            {nudge && nudge.subject && (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <SourceBadge source={nudge.source} />
                  <button onClick={() => navigator.clipboard.writeText(`${nudge.subject}\n\n${nudge.message}`).then(() => toast({ type: "success", message: "Copied" }))}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600"><Copy className="h-3.5 w-3.5" /> Copy</button>
                </div>
                <p className="text-sm font-semibold text-slate-800">{nudge.subject}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{nudge.message}</p>
              </div>
            )}

            {/* Meetings it appeared in */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><CalendarDays className="h-3.5 w-3.5" /> Appeared in</p>
              <div className="flex flex-wrap gap-2">
                {item.meetings.map((m) => (
                  <Link key={m.id} to={`/manage/meetings/${m.id}`} onClick={onClose}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-700">
                    {m.title} <span className="text-slate-400">· {m.relation}</span>
                  </Link>
                ))}
              </div>
            </div>

            {item.kb_links.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><BookOpen className="h-3.5 w-3.5" /> Knowledge base</p>
                <ul className="space-y-1.5 text-sm">
                  {item.kb_links.map((l) => (
                    <li key={l.doc_id} className="text-slate-700"><span className="font-medium">{l.doc_title}</span>
                      <span className="text-slate-500"> — {l.reason}</span> <Badge color={l.source === "ai" ? "indigo" : "slate"}>{l.source}</Badge></li>
                  ))}
                </ul>
              </div>
            )}

            {/* History */}
            <div>
              <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><History className="h-3.5 w-3.5" /> History</p>
              <ol className="relative space-y-3 border-l-2 border-slate-100 pl-5">
                {item.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${EVENT_DOT[e.event_type] || "bg-slate-300"}`} />
                    <p className="text-xs text-slate-400">{fmtDateTime(e.created_at)} · {e.event_type.replace("_", " ")}</p>
                    <p className="text-sm text-slate-700">{e.message}</p>
                    {e.data?.note && <p className="text-xs italic text-slate-500">“{e.data.note}”</p>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
      {closing && item && <CloseDialog item={item} onClose={() => setClosing(false)}
        onDone={(fresh) => { setClosing(false); updated(fresh); toast({ type: "success", message: "Item closed" }); }} />}
    </Drawer>
  );
}
