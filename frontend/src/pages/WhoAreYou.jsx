// "Who are you?" — the org chart. Clicking a person = "become" them and open their inbox.
// Layout: head of department on top, managers in a row, each team stacked vertically under its manager
// (keeps the chart readable as teams grow, instead of one very wide row).
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Avatar, PageSkeleton } from "../components/ui";
import { useViewer } from "../components/Viewer";
import { useLoad } from "../hooks";

const waitingOf = (p) => p.badges.handovers + p.badges.missed;

// One colour per team: accents only (top bar, chip), so the chart stays calm.
const TEAM = {
  Leadership: { bar: "from-slate-600 to-slate-800", chip: "bg-slate-100 text-slate-600" },
  "Billing Platform": { bar: "from-indigo-500 to-violet-500", chip: "bg-indigo-50 text-indigo-700" },
  "Network OSS": { bar: "from-sky-500 to-cyan-500", chip: "bg-sky-50 text-sky-700" },
  "Product & Design": { bar: "from-fuchsia-500 to-pink-500", chip: "bg-fuchsia-50 text-fuchsia-700" },
};
const teamStyle = (team) => TEAM[team] || TEAM.Leadership;

function WaitingDot({ count }) {
  if (!count) return null;
  return (
    <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-50" />
      <span className="relative rounded-full bg-indigo-600 px-2 text-xs font-semibold leading-6 text-white shadow">{count}</span>
    </span>
  );
}

function badgeText(p) {
  return [p.badges.handovers && `${p.badges.handovers} handover`, p.badges.missed && `${p.badges.missed} missed`]
    .filter(Boolean).join(" · ");
}

/** Big card for the head and the managers. */
function LeaderCard({ person, delay, onPick }) {
  const waiting = waitingOf(person);
  return (
    <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      whileHover={{ y: -3 }} onClick={() => onPick(person)}
      className={`elevated relative w-56 rounded-2xl border bg-white p-4 pt-5 text-center transition hover:shadow-lg ${waiting
        ? "border-indigo-300 ring-4 ring-indigo-100" : "border-slate-200 hover:border-indigo-200"}`}>
      <span className={`absolute inset-x-4 top-0 h-1 rounded-b-full bg-gradient-to-r ${teamStyle(person.team).bar}`} />
      <WaitingDot count={waiting} />
      <div className="flex justify-center"><Avatar name={person.name} size="lg" /></div>
      <p className="mt-3 truncate text-sm font-semibold text-slate-800">{person.name}</p>
      <p className="truncate text-xs text-slate-500">{person.role}</p>
      {waiting > 0 && <p className="mt-2 text-[11px] font-medium text-indigo-600">{badgeText(person)} waiting</p>}
    </motion.button>
  );
}

/** Compact row card for team members. */
function MemberCard({ person, delay, onPick }) {
  const waiting = waitingOf(person);
  return (
    <motion.button initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay }}
      whileHover={{ x: 3 }} onClick={() => onPick(person)}
      className={`elevated relative flex w-full items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition hover:shadow-md ${waiting
        ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200 hover:border-indigo-200"}`}>
      <span className="absolute -left-4 top-1/2 w-4 border-t border-slate-300" />
      <Avatar name={person.name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{person.name}</span>
        <span className="block truncate text-xs text-slate-500">{waiting ? <span className="text-indigo-600">{badgeText(person)}</span> : person.role}</span>
      </span>
      {waiting > 0 && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-indigo-500" />}
    </motion.button>
  );
}

function TeamColumn({ manager, index, onPick }) {
  const delay = 0.2 + index * 0.08;
  return (
    <div className="flex w-60 flex-col items-center">
      <span className={`mb-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${teamStyle(manager.team).chip}`}>
        {manager.team} · {manager.reports.length + 1}
      </span>
      <LeaderCard person={manager} delay={delay} onPick={onPick} />
      {manager.reports.length > 0 && (
        <div className="relative mt-4 w-full pl-6">
          <span className="absolute bottom-6 left-2 top-[-16px] border-l border-slate-300" />
          <div className="space-y-2.5">
            {manager.reports.map((r, i) => <MemberCard key={r.id} person={r} delay={delay + 0.15 + i * 0.05} onPick={onPick} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WhoAreYou() {
  const { data, loading } = useLoad(() => api.get("/org"));
  const { setViewer } = useViewer();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const intent = params.get("intent");

  const pick = (person) => {
    setViewer(person.id);
    navigate(`/me/${person.id}`);
  };

  return (
    <div>
      <div className="mb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Northwind Telecom · Engineering</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">Who are you?</h1>
        <p className="mt-2 text-slate-500">
          {intent === "takeover" ? "Pick yourself to see the work being handed to you."
            : intent === "missed" ? "Pick yourself to catch up on the meetings you missed."
              : "Pick a person to see what is waiting for them."}
          {" "}<span className="font-medium text-indigo-600">Glowing</span> cards have something waiting.
        </p>
      </div>
      {loading || !data ? <PageSkeleton /> : (
        <div className="tree overflow-x-auto pb-8">
          <ul>
            {data.roots.map((root) => (
              <li key={root.id}>
                <LeaderCard person={root} delay={0.05} onPick={pick} />
                {root.reports.length > 0 && (
                  <ul>
                    {root.reports.map((m, i) => (
                      <li key={m.id}><TeamColumn manager={m} index={i} onPick={pick} /></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
