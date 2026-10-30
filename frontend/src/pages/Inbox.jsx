// "My inbox": handovers coming to me + meetings I missed. Each opens a Takeover Pack.
import { motion } from "framer-motion";
import { ArrowRight, CalendarX2, CheckCircle2, Inbox as InboxIcon, UserRoundPlus } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Avatar, Badge, Card, Empty, PageSkeleton, ProgressBar } from "../components/ui";
import { useViewer } from "../components/Viewer";
import { firstName, fmtDate } from "../format";
import { useLoad } from "../hooks";

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
              <span className="text-xs text-slate-400">
                {entry.pack_id ? `${entry.readiness}% ready` : "Pack not generated yet"}
              </span>
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

export default function Inbox() {
  const { personId } = useParams();
  const { setViewer } = useViewer();
  const { data, loading } = useLoad(() => api.get(`/people/${personId}/inbox`), [personId]);

  useEffect(() => setViewer(Number(personId)), [personId]); // deep links set "viewing as" too

  if (loading || !data) return <PageSkeleton />;
  const { person, handovers, missed } = data;
  const waiting = [...handovers, ...missed].filter((e) => !e.done).length;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center gap-4">
        <Avatar name={person.name} size="lg" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hi {firstName(person.name)}</h1>
          <p className="text-slate-500">
            {person.role} · {waiting ? `${waiting} thing${waiting === 1 ? "" : "s"} waiting for you` : "You're all caught up"}
          </p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <UserRoundPlus className="h-4 w-4 text-indigo-600" /> Work handed to you
        </h2>
        <div className="space-y-3">
          {handovers.length ? handovers.map((e, i) => <EntryCard key={e.meeting.id} entry={e} personId={person.id} index={i} />)
            : <Card><Empty icon={InboxIcon} title="No handovers">Nobody is handing work to you right now.</Empty></Card>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <CalendarX2 className="h-4 w-4 text-amber-600" /> Meetings you missed
        </h2>
        <div className="space-y-3">
          {missed.length ? missed.map((e, i) => <EntryCard key={e.meeting.id} entry={e} personId={person.id} index={i} />)
            : <Card><Empty icon={CheckCircle2} title="Nothing missed">You attended every meeting you were invited to.</Empty></Card>}
        </div>
      </section>
    </div>
  );
}
