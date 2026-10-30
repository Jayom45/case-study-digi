// The Takeover Pack: a concise, role-aware brief someone can actually work from.
// Order follows what a newcomer needs: the gist -> first moves -> what changes for me -> rules -> state -> history.
import { motion } from "framer-motion";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CalendarX2, Check, CircleMinus, CirclePlus, Clock, GitBranch,
  History, Landmark, ListChecks, PartyPopper, RefreshCw, ShieldCheck, Sparkles, Users, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { ReadinessRing, Timeline, Workflow } from "../components/PackDiagrams";
import { Avatar, Badge, Card, ProgressBar, Section, Skeleton, SourceTag } from "../components/ui";
import { useViewer } from "../components/Viewer";
import { firstName, fmtDate, fmtDateTime } from "../format";

function Checkbox({ checked, onClick, label }) {
  return (
    <button onClick={onClick} aria-pressed={checked} aria-label={label}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition ${checked
        ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white hover:border-indigo-400"}`}>
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
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
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-600" />
            <h3 className="text-xl font-semibold text-slate-900">{doc?.title || "Loading…"}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {doc ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{doc.content}</p> : <Skeleton className="h-40" />}
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

function HeroStat({ label, value, alert }) {
  return (
    <div className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
      <p className={`text-2xl font-bold ${alert && value ? "text-rose-200" : "text-white"}`}>{value}</p>
      <p className="text-xs text-indigo-100">{label}</p>
    </div>
  );
}

function PersonChip({ person, label }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/10 py-2 pl-2 pr-4 ring-1 ring-white/15">
      <div className="rounded-full ring-2 ring-white/40"><Avatar name={person.name} /></div>
      <div className="leading-tight">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">{label}</p>
        <p className="text-sm font-semibold text-white">{person.name}</p>
        <p className="text-xs text-indigo-100">{person.role}</p>
      </div>
    </div>
  );
}

/** Small item facts (owner, due, status) looked up from the live workflow data. */
function ItemFacts({ item }) {
  if (!item) return null;
  return (
    <>
      {item.owner && <span>{item.owner}</span>}
      {item.due_date && (
        <span className={`flex items-center gap-1 ${item.is_overdue ? "font-medium text-rose-600" : ""}`}>
          <Clock className="h-3 w-3" /> {item.is_overdue ? "overdue · " : "due "}{fmtDate(item.due_date)}
        </span>
      )}
      {item.status === "blocked" && <Badge color="red">blocked</Badge>}
      {item.carry_count >= 2 && <Badge color="amber">carried {item.carry_count}×</Badge>}
    </>
  );
}

function BreakdownRow({ label, done, total }) {
  if (!total) return null;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-700">{done}/{total}</span></div>
      <ProgressBar value={(100 * done) / total} />
    </div>
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
    setPack((p) => ({ ...p, progress: { ...p.progress, checked } })); // optimistic; server returns the real readiness
    api.patch(`/takeover-packs/${pack.id}/progress`, { checked })
      .then((progress) => setPack((p) => ({ ...p, progress })))
      .catch(() => setPack((p) => ({ ...p, progress: before })));
  };

  const readDoc = (docId) => {
    setOpenDoc(docId);
    if (!pack.progress.checked.includes(`doc:${docId}`)) toggle(`doc:${docId}`);
  };

  if (generating && !pack) return <Generating />;
  if (!pack) return <div className="space-y-4"><Skeleton className="h-56" /><Skeleton className="h-64" /></div>;

  const c = pack.content;
  const checked = new Set(pack.progress.checked);
  const isHandover = c.mode === "handover";
  const allItems = Object.values(pack.workflow).flat();
  const itemById = Object.fromEntries(allItems.map((i) => [i.item_id, i]));
  const openCount = allItems.filter((i) => i.status !== "done" && i.status !== "dropped").length;
  const count = (prefix) => pack.progress.checked.filter((k) => k.startsWith(prefix)).length;
  const ready = pack.progress.readiness === 100;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 p-8 text-white shadow-lg shadow-indigo-200">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <Link to={`/me/${personId}`} className="inline-flex items-center gap-1 text-sm text-indigo-100 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to inbox
          </Link>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
              {pack.source === "ai" ? "✦ AI generated" : "Rule-based fallback"} · {fmtDateTime(pack.created_at)}
            </span>
            <button onClick={generate} disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm transition hover:bg-indigo-50 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} /> {generating ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        </div>

        <p className="relative mt-6 text-xs font-semibold uppercase tracking-widest text-indigo-200">
          {isHandover ? "Takeover Pack" : "Catch-up Pack"}
        </p>
        <h1 className="relative mt-1 text-3xl font-bold tracking-tight">{pack.meeting_title}</h1>
        <Link to={`/manage/meetings/${pack.meeting_id}`} className="relative mt-1 inline-block text-sm text-indigo-100 hover:text-white hover:underline">
          {fmtDate(pack.meeting_date)} · view source meeting
        </Link>

        <div className="relative mt-6 flex flex-wrap items-center gap-3">
          {isHandover && pack.from_person ? (
            <>
              <PersonChip person={pack.from_person} label="Handing over" />
              <ArrowRight className="h-5 w-5 text-indigo-200" />
              <PersonChip person={pack.person} label="Taking over (you)" />
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
              <CalendarX2 className="h-5 w-5 text-indigo-200" />
              <p className="text-sm">{firstName(pack.person.name)}, you {c.mode === "missed" ? "missed" : "are catching up on"} this meeting.</p>
            </div>
          )}
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <HeroStat label="Open items" value={openCount} />
          <HeroStat label="Overdue" value={allItems.filter((i) => i.is_overdue).length} alert />
          <HeroStat label="Blocked" value={pack.workflow.blocked.length} alert />
          <HeroStat label="Decisions" value={c.key_decisions.length} />
          <HeroStat label="Docs to read" value={c.read_these.length} />
        </div>
      </motion.div>

      {ready && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
          <PartyPopper className="h-5 w-5" />
          <p className="text-sm font-medium">
            You&apos;re ready to take over.{pack.from_person && ` ${firstName(pack.from_person.name)} can see this in their inbox.`}
          </p>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {/* TL;DR */}
          <Card className="p-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">TL;DR</p>
            </div>
            <ul className="space-y-2">
              {c.tldr.map((line, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-slate-800">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />{line}
                </li>
              ))}
            </ul>
          </Card>

          {/* Next actions */}
          <Section title="Your first moves" icon={ListChecks} hint="tick when done">
            <ol className="space-y-3">
              {c.next_actions.map((a, i) => {
                const key = `action:${i}`;
                const done = checked.has(key);
                return (
                  <li key={key} className={`flex items-start gap-4 rounded-xl border p-4 transition ${done
                    ? "border-emerald-200 bg-emerald-50/40" : i === 0 ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200"}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done
                      ? "bg-emerald-100 text-emerald-700" : "bg-indigo-600 text-white"}`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`font-medium ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>{a.text}</p>
                        {i === 0 && !done && <Badge color="indigo">Start here</Badge>}
                      </div>
                      {a.why && <p className="mt-0.5 text-sm text-slate-500">{a.why}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {a.item_id && <SourceTag itemId={a.item_id} />}
                        <ItemFacts item={itemById[a.item_id]} />
                      </div>
                    </div>
                    <Checkbox checked={done} onClick={() => toggle(key)} label="Mark done" />
                  </li>
                );
              })}
            </ol>
          </Section>

          {/* Role gap */}
          {isHandover && (
            <Section title="Your role gap" icon={GitBranch}>
              <div className="mb-5 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Their role</p>
                  <p className="mt-1 font-semibold text-slate-700">{c.role_gap.from_role}</p>
                </div>
                <ArrowRight className="mx-auto h-5 w-5 text-indigo-400" />
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-400">Your role</p>
                  <p className="mt-1 font-semibold text-indigo-800">{c.role_gap.to_role}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">New for you</p>
                  <ul className="space-y-2">
                    {c.role_gap.new_for_you.map((x, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-700"><CirclePlus className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">You can ignore</p>
                  <ul className="space-y-2">
                    {c.role_gap.can_ignore.length ? c.role_gap.can_ignore.map((x, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-500"><CircleMinus className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{x}</li>
                    )) : <li className="text-sm text-slate-400">Nothing flagged.</li>}
                  </ul>
                </div>
              </div>
            </Section>
          )}

          {/* Decisions */}
          <Section title="Decisions you must respect" icon={Landmark} hint="acknowledge each one">
            <ul className="space-y-3">
              {c.key_decisions.map((d) => {
                const key = `decision:${d.decision_id}`;
                const ack = checked.has(key);
                return (
                  <li key={key} className={`flex items-start gap-4 rounded-xl border-l-4 bg-slate-50/60 p-4 ${ack ? "border-emerald-400" : "border-indigo-400"}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{d.text}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <SourceTag meetingId={d.meeting_id} label={d.meeting_title} />
                        {d.why && <span>{d.why}</span>}
                      </div>
                    </div>
                    <button onClick={() => toggle(key)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${ack
                        ? "bg-emerald-100 text-emerald-700" : "border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700"}`}>
                      {ack ? "✓ Acknowledged" : "Acknowledge"}
                    </button>
                  </li>
                );
              })}
              {!c.key_decisions.length && <li className="text-sm text-slate-400">No decisions recorded.</li>}
            </ul>
          </Section>

          <Section title="State of work" icon={ShieldCheck} hint="live item statuses">
            <Workflow stages={pack.workflow} />
          </Section>

          <Section title={isHandover ? "Where they left off" : "What happened"} icon={History} hint="from the item history log">
            <Timeline events={pack.timeline} />
          </Section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-4 p-6">
            <ReadinessRing value={pack.progress.readiness} done={pack.progress.checked.length} total={pack.progress.total} />
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <BreakdownRow label="First moves" done={count("action:")} total={c.next_actions.length} />
              <BreakdownRow label="Decisions acknowledged" done={count("decision:")} total={c.key_decisions.length} />
              <BreakdownRow label="Docs read" done={count("doc:")} total={c.read_these.length} />
            </div>
          </Card>

          <Section title="Who to ask" icon={Users}>
            <ul className="space-y-3">
              {c.who_to_ask.map((w) => (
                <li key={w.person_id} className="flex gap-3">
                  <Avatar name={w.name} size="sm" />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-slate-800">{w.name}</p>
                    <p className="text-xs text-slate-400">{w.role}</p>
                    <p className="mt-0.5 text-slate-600">{w.about}</p>
                  </div>
                </li>
              ))}
              {!c.who_to_ask.length && <li className="text-sm text-slate-400">No one specific.</li>}
            </ul>
          </Section>

          <Section title="Read these" icon={BookOpen}>
            <ul className="space-y-2">
              {c.read_these.map((d) => {
                const read = checked.has(`doc:${d.doc_id}`);
                return (
                  <li key={d.doc_id}>
                    <button onClick={() => readDoc(d.doc_id)}
                      className="flex w-full gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40">
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${read
                        ? "bg-emerald-100 text-emerald-600" : "bg-indigo-50 text-indigo-500"}`}>
                        {read ? <Check className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium text-slate-800">{d.title}</span>
                        <span className="text-xs text-slate-500">{d.why}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {!c.read_these.length && <li className="text-sm text-slate-400">No documents linked.</li>}
            </ul>
          </Section>

          {(c.risks.length > 0 || c.warnings.length > 0) && (
            <Card className="border-amber-200 bg-amber-50/50 p-6">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">Watch out</h2>
              </div>
              <ul className="space-y-1.5 text-sm text-slate-700">
                {c.risks.map((r, i) => <li key={i} className="flex gap-2"><span className="text-amber-500">•</span>{r}</li>)}
              </ul>
              {c.warnings.length > 0 && (
                <div className="mt-4 border-t border-amber-200 pt-3 text-xs text-amber-800">
                  <p className="mb-1 font-semibold">Quality checks on this pack</p>
                  {c.warnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}
            </Card>
          )}
        </aside>
      </div>

      {openDoc && <DocModal docId={openDoc} onClose={() => setOpenDoc(null)} />}
    </div>
  );
}
