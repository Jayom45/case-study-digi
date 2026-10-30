// Diagrams for the Takeover Pack. Drawn from DATA the backend computed (item_events + item statuses),
// never from AI output, so they can't break if the model returns something odd.
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { fmtDate, fmtDateTime } from "../format";
import { SourceTag } from "./ui";

const EVENT_COLORS = {
  created: "bg-indigo-500",
  carried_forward: "bg-amber-500",
  reassigned: "bg-violet-500",
  status_changed: "bg-sky-500",
  closed: "bg-emerald-500",
  reopened: "bg-rose-500",
};

const EVENT_LABELS = {
  created: "Created", carried_forward: "Carried forward", reassigned: "Reassigned", status_changed: "Status",
  closed: "Closed", reopened: "Reopened", updated: "Updated", kb_linked: "KB linked", nudge_drafted: "Nudge",
};

/** "Where they left off": vertical timeline of the latest item events. */
export function Timeline({ events }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? events : events.slice(-8);
  if (!events.length) return <p className="text-sm text-slate-400">No history yet.</p>;
  return (
    <div>
      {events.length > shown.length && (
        <button onClick={() => setShowAll(true)} className="mb-3 text-xs font-medium text-indigo-600 hover:underline">
          Show all {events.length} events
        </button>
      )}
      <ol className="relative space-y-4 border-l border-slate-200 pl-6">
        {shown.map((e, i) => (
          <li key={i} className="relative">
            <span className={`absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${EVENT_COLORS[e.event_type] || "bg-slate-300"}`} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>{fmtDateTime(e.at)}</span>
              <span className="font-medium text-slate-500">{EVENT_LABELS[e.event_type] || e.event_type}</span>
              <SourceTag itemId={e.item_id} />
            </div>
            <p className="mt-0.5 text-sm text-slate-700">
              <span className="font-medium">{e.item_title}</span>
              <span className="text-slate-500"> — {e.message}</span>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

const STAGES = [
  { key: "not_started", label: "Not started", bar: "bg-slate-300" },
  { key: "in_progress", label: "In progress", bar: "bg-sky-500" },
  { key: "blocked", label: "Blocked", bar: "bg-rose-500" },
  { key: "done", label: "Done", bar: "bg-emerald-500" },
];

/** "State of work": items grouped by stage, left to right. */
export function Workflow({ stages }) {
  return (
    <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
      {STAGES.map((s, i) => (
        <div key={s.key} className="contents">
          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className={`h-1 rounded-t-xl ${s.bar}`} />
            <div className="flex items-center justify-between px-3 pt-2.5">
              <span className="text-xs font-semibold text-slate-600">{s.label}</span>
              <span className="text-lg font-bold text-slate-800">{stages[s.key].length}</span>
            </div>
            <div className="space-y-1.5 p-2.5">
              {stages[s.key].slice(0, 4).map((it) => (
                <div key={it.item_id} className="rounded-lg border border-slate-200 bg-white p-2 text-xs">
                  <p className="line-clamp-2 font-medium text-slate-700">{it.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                    <SourceTag itemId={it.item_id} />
                    {it.owner && <span>{it.owner.split(" ")[0]}</span>}
                    {it.is_overdue && <span className="font-medium text-rose-600">overdue {fmtDate(it.due_date)}</span>}
                    {it.carry_count >= 2 && <span className="font-medium text-amber-600">carried {it.carry_count}×</span>}
                  </div>
                </div>
              ))}
              {stages[s.key].length > 4 && <p className="px-1 text-[11px] text-slate-400">+{stages[s.key].length - 4} more</p>}
            </div>
          </div>
          {i < STAGES.length - 1 && <ChevronRight className="hidden h-5 w-5 self-center text-slate-300 md:block" />}
        </div>
      ))}
    </div>
  );
}

/** Takeover readiness meter: a ring that fills as checklist items are ticked. */
export function ReadinessRing({ value, done, total }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const color = value === 100 ? "stroke-emerald-500" : "stroke-indigo-500";
  return (
    <div className="flex items-center gap-5">
      <svg width="104" height="104" viewBox="0 0 104 104" className="-rotate-90">
        <circle cx="52" cy="52" r={r} strokeWidth="9" className="fill-none stroke-slate-100" />
        <circle cx="52" cy="52" r={r} strokeWidth="9" strokeLinecap="round"
          className={`fill-none transition-all duration-700 ${color}`}
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
        <text x="52" y="52" textAnchor="middle" dominantBaseline="central"
          className="rotate-90 fill-slate-800 text-xl font-bold" style={{ transformOrigin: "52px 52px" }}>
          {value}%
        </text>
      </svg>
      <div className="text-sm">
        <p className="font-semibold text-slate-800">{value === 100 ? "Ready to take over" : "Takeover readiness"}</p>
        <p className="text-slate-500">{done} of {total} done</p>
        <p className="mt-1 text-xs text-slate-400">Tick actions, acknowledge decisions and open the docs.</p>
      </div>
    </div>
  );
}
