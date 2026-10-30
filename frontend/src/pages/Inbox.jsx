// "My inbox": what is waiting for me (handovers to me, meetings I missed), what I handed over
// (and whether the receiver is ready), and my own open items.
import { motion } from "framer-motion";
import {
  ArrowRight, CalendarX2, CheckCircle2, Clock, Inbox as InboxIcon, ListTodo, Send, UserRoundPlus,
} from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Avatar, Badge, Card, Empty, PageSkeleton, ProgressBar } from "../components/ui";
import { useViewer } from "../components/Viewer";
import { firstName, fmtDate } from "../format";
import { useLoad } from "../hooks";

function SectionTitle({ icon: Icon, color, children, count }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
      <Icon className={`h-4 w-4 ${color}`} /> {children}
      {count > 0 && <span className="rounded-full bg-slate-200 px-1.5 text-[11px] leading-5 text-slate-600">{count}</span>}
    </h2>
  );
}

function EntryCard({ entry, personId, index }) {
  const m = entry.meeting;
  const handover = entry.reason === "handover";
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
      <Link to={`/takeover/${m.id}/${personId}`}>
        <Card className="group flex items-center gap-5 p-5 transition hover:border-indigo-200 hover:shadow-md">
          {handover && entry.from_person ? <Avatar name={entry.from_person.name} size="lg" />
            : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50"><CalendarX2 className="h-5 w-5 text-amber-600" /></div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold text-slate-800">{m.title}</p>
              {entry.done && <Badge color="green"><CheckCircle2 className="h-3 w-3" /> Ready</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {handover ? `From ${entry.from_person?.name} · ` : "You were absent · "}
              {fmtDate(m.scheduled_at)} · {entry.open_items} open item{entry.open_items === 1 ? "" : "s"}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="w-48"><ProgressBar value={entry.readiness} /></div>
              <span className="text-xs text-slate-400">{entry.pack_id ? `${entry.readiness}% ready` : "Pack not generated yet"}</span>
            </div>
          </div>
          <span className="flex items-center gap-1 text-sm font-medium text-indigo-600">
            {entry.pack_id ? "Open pack" : "Generate pack"}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </Card>
      </Link>
    </motion.div>
  );
}

/** A handover I gave: shows whether the receiver has actually picked it up. */
function GivenCard({ g }) {
  const status = !g.pack_id ? { text: "Not opened yet", color: "amber" }
    : g.readiness === 100 ? { text: "Ready", color: "green" } : { text: "In progress", color: "indigo" };
  return (
    <Card className="flex items-center gap-5 p-5">
      <Avatar name={g.to_person.name} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-slate-800">{g.meeting.title}</p>
          <Badge color={status.color}>{status.text}</Badge>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">
          To {g.to_person.name} ({g.to_person.role}) · {g.open_items} open item{g.open_items === 1 ? "" : "s"}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="w-48"><ProgressBar value={g.readiness} /></div>
          <span className="text-xs text-slate-400">{firstName(g.to_person.name)} is {g.readiness}% ready to take over</span>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function Inbox() {
  const { personId } = useParams();
  const { setViewer } = useViewer();
  const { data, loading } = useLoad(() => api.get(`/people/${personId}/inbox`), [personId]);

  useEffect(() => setViewer(Number(personId)), [personId]); // deep links set "viewing as" too

  if (loading || !data) return <PageSkeleton />;
  const { person, handovers, missed, handed_over, my_items } = data;
  const waiting = [...handovers, ...missed].filter((e) => !e.done).length;
  const overdue = my_items.filter((i) => i.is_overdue).length;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center gap-4">
        <Avatar name={person.name} size="lg" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hi {firstName(person.name)}</h1>
          <p className="text-slate-500">{person.role} · {person.team}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Waiting for you" value={waiting} tone={waiting ? "text-indigo-600" : "text-slate-800"} />
        <Stat label="Your open items" value={my_items.length} tone="text-slate-800" />
        <Stat label="Overdue" value={overdue} tone={overdue ? "text-rose-600" : "text-slate-800"} />
        <Stat label="Handed over by you" value={handed_over.length} tone="text-slate-800" />
      </div>

      <section>
        <SectionTitle icon={UserRoundPlus} color="text-indigo-600" count={handovers.length}>Work handed to you</SectionTitle>
        <div className="space-y-3">
          {handovers.length ? handovers.map((e, i) => <EntryCard key={e.meeting.id} entry={e} personId={person.id} index={i} />)
            : <Card><Empty icon={InboxIcon} title="No handovers">Nobody is handing work to you right now.</Empty></Card>}
        </div>
      </section>

      <section>
        <SectionTitle icon={CalendarX2} color="text-amber-600" count={missed.length}>Meetings you missed</SectionTitle>
        <div className="space-y-3">
          {missed.length ? missed.map((e, i) => <EntryCard key={e.meeting.id} entry={e} personId={person.id} index={i} />)
            : <Card><Empty icon={CheckCircle2} title="Nothing missed">You attended every meeting you were invited to.</Empty></Card>}
        </div>
      </section>

      {handed_over.length > 0 && (
        <section>
          <SectionTitle icon={Send} color="text-violet-600" count={handed_over.length}>Handed over by you</SectionTitle>
          <div className="space-y-3">{handed_over.map((g) => <GivenCard key={g.meeting.id} g={g} />)}</div>
        </section>
      )}

      <section>
        <SectionTitle icon={ListTodo} color="text-sky-600" count={my_items.length}>Your open items</SectionTitle>
        <Card className="divide-y divide-slate-100">
          {my_items.map((it) => (
            <Link key={it.id} to={`/manage/items?item=${it.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50">
              <span className="font-mono text-xs text-slate-400">#{it.id}</span>
              <span className="min-w-0 flex-1 truncate text-slate-800">{it.title}</span>
              {it.carry_count >= 2 && <Badge color="amber">carried {it.carry_count}×</Badge>}
              {it.status === "blocked" && <Badge color="red">blocked</Badge>}
              <span className={`flex w-20 items-center justify-end gap-1 text-xs ${it.is_overdue ? "font-medium text-rose-600" : "text-slate-500"}`}>
                <Clock className="h-3 w-3" /> {fmtDate(it.due_date)}
              </span>
            </Link>
          ))}
          {!my_items.length && <Empty icon={CheckCircle2} title="No open items">Nothing assigned to you.</Empty>}
        </Card>
      </section>
    </div>
  );
}
