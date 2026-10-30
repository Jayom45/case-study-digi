// The Takeover Pack: a concise, role-aware brief. Order follows what a newcomer needs first.
import { motion } from "framer-motion";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Check, GitBranch, History, Landmark, ListChecks,
  RefreshCw, ShieldCheck, Sparkles, Users, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { ReadinessRing, Timeline, Workflow } from "../components/PackDiagrams";
import { Avatar, Badge, Button, Card, Section, Skeleton, SourceBadge, SourceTag } from "../components/ui";
import { useViewer } from "../components/Viewer";
import { fmtDateTime } from "../format";

function Checkbox({ checked, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={checked}
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${checked
        ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white hover:border-indigo-400"}`}>
      {checked && <Check className="h-3.5 w-3.5" />}
    </button>
  );
}

function DocModal({ docId, onClose }) {
  const [doc, setDoc] = useState(null);
  useEffect(() => {
    api.get(`/kb/${docId}`).then(setDoc).catch(onClose);
  }, [docId]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-xl font-semibold text-slate-900">{doc?.title || "Loading…"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {doc ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{doc.content}</p>
          : <Skeleton className="h-40" />}
      </motion.div>
    </div>
  );
}

function Generating() {
  return (
    <Card className="mx-auto max-w-xl p-10 text-center">
      <Sparkles className="mx-auto h-8 w-8 animate-pulse text-indigo-500" />
      <p className="mt-4 font-semibold text-slate-800">Preparing your pack…</p>
      <p className="mt-1 text-sm text-slate-500">
        Reading the items, decisions and documents, then checking every reference against the database.
      </p>
      <div className="mt-6 space-y-2"><Skeleton className="h-3" /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></div>
    </Card>
  );
}

export default function TakeoverPack() {
  const { meetingId, personId } = useParams();
  const { setViewer } = useViewer();
  const [pack, setPack] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [openDoc, setOpenDoc] = useState(null);
  const started = useRef(false); // React StrictMode runs effects twice in dev; don't generate two packs

  const generate = () => {
    setGenerating(true);
    return api.post(`/meetings/${meetingId}/takeover-pack`, { person_id: Number(personId) })
      .then(setPack)
      .finally(() => setGenerating(false));
  };

  useEffect(() => {
    setViewer(Number(personId));
    if (started.current) return;
    started.current = true;
    // Show the saved pack if there is one; otherwise generate the first one.
    api.get(`/meetings/${meetingId}/takeover-pack?person_id=${personId}`, { silent: true })
      .then(setPack)
      .catch((e) => (e.status === 404 ? generate() : null));
  }, [meetingId, personId]);

  const toggle = (key) => {
    const before = pack.progress;
    const set = new Set(before.checked);
    set.has(key) ? set.delete(key) : set.add(key);
    const checked = [...set];
    setPack((p) => ({ ...p, progress: { ...p.progress, checked } })); // optimistic
    api.patch(`/takeover-packs/${pack.id}/progress`, { checked })
      .then((progress) => setPack((p) => ({ ...p, progress })))
      .catch(() => setPack((p) => ({ ...p, progress: before })));
  };

  const readDoc = (docId) => {
    setOpenDoc(docId);
    if (!pack.progress.checked.includes(`doc:${docId}`)) toggle(`doc:${docId}`);
  };

  if (generating && !pack) return <Generating />;
  if (!pack) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;

  const c = pack.content;
  const checked = new Set(pack.progress.checked);
  const isHandover = c.mode === "handover";
  const doneCount = pack.progress.checked.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to={`/me/${personId}`} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Back to inbox
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isHandover ? "Takeover Pack" : "Catch-up Pack"} <span className="text-slate-400">for</span> {pack.person.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <SourceTag meetingId={pack.meeting_id} label={pack.meeting_title} />
            <SourceBadge source={pack.source} />
            <span className="text-xs text-slate-400">generated {fmtDateTime(pack.created_at)}</span>
          </div>
        </div>
        <Button variant="secondary" onClick={generate} disabled={generating}>
          <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} /> {generating ? "Regenerating…" : "Regenerate"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-600">TL;DR</p>
            <ul className="space-y-1.5">
              {c.tldr.map((line, i) => <li key={i} className="text-[15px] leading-relaxed text-slate-800">{line}</li>)}
            </ul>
          </Card>

          <Section title="What to do next" icon={ListChecks} hint="ticking raises readiness">
            <ul className="space-y-3">
              {c.next_actions.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <Checkbox checked={checked.has(`action:${i}`)} onClick={() => toggle(`action:${i}`)} />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${checked.has(`action:${i}`) ? "text-slate-400 line-through" : "text-slate-800"}`}>
                      <span className="mr-2 text-slate-400">{i + 1}.</span>{a.text}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {a.why && <span>{a.why}</span>}
                      {a.item_id && <SourceTag itemId={a.item_id} />}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          {isHandover && (
            <Section title="Your role gap" icon={GitBranch}>
              <div className="mb-4 flex items-center gap-3 text-sm">
                <Badge color="slate">{c.role_gap.from_role}</Badge>
                <ArrowRight className="h-4 w-4 text-slate-400" />
                <Badge color="indigo">{c.role_gap.to_role}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-indigo-50/60 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">New for you</p>
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {c.role_gap.new_for_you.map((x, i) => <li key={i}>• {x}</li>)}
                  </ul>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">You can ignore</p>
                  <ul className="space-y-1.5 text-sm text-slate-500">
                    {c.role_gap.can_ignore.length ? c.role_gap.can_ignore.map((x, i) => <li key={i}>• {x}</li>) : <li>Nothing flagged.</li>}
                  </ul>
                </div>
              </div>
            </Section>
          )}

          <Section title="Decisions you must respect" icon={Landmark} hint="acknowledge each one">
            <ul className="space-y-3">
              {c.key_decisions.map((d) => {
                const key = `decision:${d.decision_id}`;
                return (
                  <li key={key} className="flex gap-3">
                    <Checkbox checked={checked.has(key)} onClick={() => toggle(key)} />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800">{d.text}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <SourceTag meetingId={d.meeting_id} label={d.meeting_title} />
                        {d.why && <span>{d.why}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
              {!c.key_decisions.length && <li className="text-sm text-slate-400">No decisions recorded.</li>}
            </ul>
          </Section>

          <Section title="State of work" icon={ShieldCheck} hint="built from live item statuses">
            <Workflow stages={pack.workflow} />
          </Section>

          <Section title={isHandover ? "Where they left off" : "What happened"} icon={History} hint="from the item history log">
            <Timeline events={pack.timeline} />
          </Section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6">
            <ReadinessRing value={pack.progress.readiness} done={doneCount} total={pack.progress.total} />
          </Card>

          <Section title="Who to ask" icon={Users}>
            <ul className="space-y-3">
              {c.who_to_ask.map((w) => (
                <li key={w.person_id} className="flex gap-3">
                  <Avatar name={w.name} size="sm" />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-slate-800">{w.name} <span className="font-normal text-slate-400">· {w.role}</span></p>
                    <p className="text-slate-500">{w.about}</p>
                  </div>
                </li>
              ))}
              {!c.who_to_ask.length && <li className="text-sm text-slate-400">No one specific.</li>}
            </ul>
          </Section>

          <Section title="Read these" icon={BookOpen}>
            <ul className="space-y-2">
              {c.read_these.map((d) => (
                <li key={d.doc_id}>
                  <button onClick={() => readDoc(d.doc_id)}
                    className="flex w-full gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${checked.has(`doc:${d.doc_id}`)
                      ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                      {checked.has(`doc:${d.doc_id}`) ? <Check className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-slate-800">{d.title}</span>
                      <span className="text-slate-500">{d.why}</span>
                    </span>
                  </button>
                </li>
              ))}
              {!c.read_these.length && <li className="text-sm text-slate-400">No documents linked.</li>}
            </ul>
          </Section>

          {(c.risks.length > 0 || c.warnings.length > 0) && (
            <Section title="Watch out" icon={AlertTriangle}>
              <ul className="space-y-1.5 text-sm text-slate-700">
                {c.risks.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
              {c.warnings.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="mb-1 font-semibold">Quality checks</p>
                  {c.warnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}
            </Section>
          )}
        </aside>
      </div>

      {openDoc && <DocModal docId={openDoc} onClose={() => setOpenDoc(null)} />}
    </div>
  );
}
