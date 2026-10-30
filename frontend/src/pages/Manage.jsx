// Manage screens. Step 2-3 version: read-only lists so links from the Takeover Pack work.
// Step 4 adds recap generation/review, closing items with outcome, nudges and history drawers.
import { BookOpen, CalendarDays } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Badge, Card, Empty, PageSkeleton, Section, SourceBadge } from "../components/ui";
import { fmtDate } from "../format";
import { useLoad } from "../hooks";

const STATUS_COLOR = { scheduled: "indigo", held: "green", closed: "slate", open: "slate", in_progress: "indigo",
  blocked: "red", done: "green", dropped: "slate" };

export function Meetings() {
  const { data, loading } = useLoad(() => api.get("/meetings"));
  if (loading) return <PageSkeleton />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Meetings & handovers</h1>
      <Card className="divide-y divide-slate-100">
        {data.map((m) => (
          <Link key={m.id} to={`/manage/meetings/${m.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800">{m.title}</p>
              <p className="text-xs text-slate-500">{fmtDate(m.scheduled_at)} · {m.open_items}/{m.total_items} items open</p>
            </div>
            {m.kind === "handover" && <Badge color="amber">handover</Badge>}
            <Badge color={STATUS_COLOR[m.status]}>{m.status}</Badge>
          </Link>
        ))}
      </Card>
    </div>
  );
}

export function MeetingDetail() {
  const { id } = useParams();
  const { data: m, loading } = useLoad(() => api.get(`/meetings/${id}`), [id]);
  if (loading || !m) return <PageSkeleton />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{m.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {fmtDate(m.scheduled_at)} · <Badge color={STATUS_COLOR[m.status]}>{m.status}</Badge>
          {m.recap_source && m.recap_source !== "manual" && <> · <SourceBadge source={m.recap_source} /></>}
        </p>
      </div>
      <Section title="Summary">
        <p className="text-sm leading-relaxed text-slate-700">{m.summary || "No recap yet."}</p>
      </Section>
      <Section title="Decisions">
        <ul className="space-y-1.5 text-sm text-slate-700">
          {m.decisions.map((d) => <li key={d.id}>• {d.text}</li>)}
          {!m.decisions.length && <li className="text-slate-400">None recorded.</li>}
        </ul>
      </Section>
      <Section title="Action items">
        <ItemRows items={m.items} />
      </Section>
    </div>
  );
}

function ItemRows({ items }) {
  if (!items.length) return <p className="text-sm text-slate-400">No items.</p>;
  return (
    <div className="divide-y divide-slate-100">
      {items.map((it) => (
        <div key={it.id} id={`item-${it.id}`} className="flex items-center gap-3 py-2.5 text-sm">
          <span className="font-mono text-xs text-slate-400">#{it.id}</span>
          <span className="min-w-0 flex-1 truncate text-slate-800">{it.title}</span>
          <span className="text-xs text-slate-500">{it.owner?.name || "unassigned"}</span>
          <span className={`w-16 text-right text-xs ${it.is_overdue ? "font-medium text-rose-600" : "text-slate-500"}`}>{fmtDate(it.due_date)}</span>
          <Badge color={STATUS_COLOR[it.status]}>{it.status.replace("_", " ")}</Badge>
        </div>
      ))}
    </div>
  );
}

export function Items() {
  const { data, loading } = useLoad(() => api.get("/items"));
  if (loading) return <PageSkeleton />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Action items</h1>
      <Card className="px-5 py-2"><ItemRows items={data} /></Card>
    </div>
  );
}

export function KnowledgeBase() {
  const { data, loading } = useLoad(() => api.get("/kb"));
  if (loading) return <PageSkeleton />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Knowledge base</h1>
      {!data.length && <Card><Empty icon={BookOpen} title="No documents yet" /></Card>}
      <div className="grid gap-4 md:grid-cols-2">
        {data.map((d) => (
          <Card key={d.id} className="p-5">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-800">{d.title}</p>
              <Badge color={d.doc_type === "meeting_recap" ? "indigo" : "slate"}>{d.doc_type === "meeting_recap" ? "recap" : "doc"}</Badge>
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-slate-500">{d.content}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
