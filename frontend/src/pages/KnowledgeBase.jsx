// Knowledge base: team documents + past meeting recaps (added automatically when a recap is saved).
import { BookOpen, FileText, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/Toasts";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageSkeleton, Textarea } from "../components/ui";
import { fmtDate } from "../format";
import { useLoad } from "../hooks";

const TABS = [
  { key: "", label: "All" },
  { key: "document", label: "Team documents" },
  { key: "meeting_recap", label: "Meeting recaps" },
];

function AddDoc({ onClose, onAdded }) {
  const [form, setForm] = useState({ title: "", content: "" });
  const valid = form.title.trim().length >= 3 && form.content.trim().length >= 20; // matches schemas.KBDocIn
  const save = () => api.post("/kb", form).then(onAdded);
  return (
    <Modal title="Add document" onClose={onClose} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!valid}>Add</Button></>}>
      <div className="space-y-4">
        <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. On-call Handbook" /></Field>
        <Field label="Content" hint="At least 20 characters. The AI uses this to link action items to docs.">
          <Textarea rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

export default function KnowledgeBase() {
  const toast = useToast();
  const { data, loading, reload } = useLoad(() => api.get("/kb"));
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  if (loading || !data) return <PageSkeleton />;

  const q = search.toLowerCase();
  const shown = data.filter((d) => (!tab || d.doc_type === tab) && (d.title + d.content).toLowerCase().includes(q));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Manage</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Knowledge base</h1>
          <p className="mt-1 text-slate-500">Team documents and every saved meeting recap. The AI links action items to these.</p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add document</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-100/80 p-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search docs…" className="pl-9" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((d) => (
          <button key={d.id} onClick={() => setOpen(d)} className="text-left">
            <Card className="h-full p-5 transition hover:border-indigo-200 hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${d.doc_type === "meeting_recap" ? "bg-violet-50 text-violet-600" : "bg-indigo-50 text-indigo-600"}`}>
                  {d.doc_type === "meeting_recap" ? <FileText className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{d.title}</p>
                  <p className="text-xs text-slate-400">{d.doc_type === "meeting_recap" ? "Meeting recap" : "Document"} · {fmtDate(d.created_at)}</p>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 text-sm text-slate-500">{d.content}</p>
            </Card>
          </button>
        ))}
      </div>
      {!shown.length && <Card><Empty icon={BookOpen} title="No documents match" /></Card>}

      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)} wide
          footer={open.meeting_id && <Link to={`/manage/meetings/${open.meeting_id}`}><Button variant="secondary">Open source meeting</Button></Link>}>
          <Badge color={open.doc_type === "meeting_recap" ? "indigo" : "slate"}>{open.doc_type === "meeting_recap" ? "Meeting recap" : "Document"}</Badge>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{open.content}</p>
        </Modal>
      )}
      {adding && <AddDoc onClose={() => setAdding(false)} onAdded={() => { setAdding(false); reload(); toast({ type: "success", message: "Document added" }); }} />}
    </div>
  );
}
