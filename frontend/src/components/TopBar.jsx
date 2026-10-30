import { motion } from "framer-motion";
import { ArrowRightLeft, BookOpen, CalendarDays, Check, ChevronDown, Inbox, ListTodo, Network } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Avatar } from "./ui";
import { useViewer } from "./Viewer";

const NAV = [
  { to: "/who", label: "People", icon: Network },
  { to: "/manage/meetings", label: "Meetings", icon: CalendarDays },
  { to: "/manage/items", label: "Action items", icon: ListTodo, countKey: "overdue" },
  { to: "/manage/kb", label: "Knowledge base", icon: BookOpen },
];

/** Flatten the org tree into [{team, people:[...]}] for the "Viewing as" menu. */
function groupByTeam(roots) {
  const groups = new Map();
  const walk = (n) => {
    if (!groups.has(n.team)) groups.set(n.team, []);
    groups.get(n.team).push(n);
    n.reports.forEach(walk);
  };
  roots.forEach(walk);
  return [...groups.entries()].map(([team, people]) => ({ team, people }));
}

const waitingOf = (p) => (p ? p.badges.handovers + p.badges.missed : 0);

function ViewerMenu({ groups, viewer, onPick }) {
  const [open, setOpen] = useState(false);
  const me = groups.flatMap((g) => g.people).find((p) => p.id === viewer?.id);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-left transition hover:border-slate-300 hover:shadow-sm">
        {viewer ? <Avatar name={viewer.name} size="sm" /> : <span className="h-7 w-7 rounded-full bg-slate-100" />}
        <span className="hidden leading-tight sm:block">
          <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400">Viewing as</span>
          <span className="block text-sm font-medium text-slate-800">{viewer ? viewer.name : "Choose a person"}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="absolute right-0 z-50 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            {groups.map((g) => (
              <div key={g.team} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.team}</p>
                {g.people.map((p) => (
                  <button key={p.id} onClick={() => { setOpen(false); onPick(p.id); }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50 ${p.id === me?.id ? "bg-indigo-50/60" : ""}`}>
                    <Avatar name={p.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{p.name}</span>
                      <span className="block truncate text-xs text-slate-500">{p.role}</span>
                    </span>
                    {waitingOf(p) > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold leading-5 text-white">{waitingOf(p)}</span>}
                    {p.id === me?.id && <Check className="h-4 w-4 text-indigo-600" />}
                  </button>
                ))}
              </div>
            ))}
          </motion.div>
        </>
      )}
    </div>
  );
}

export default function TopBar() {
  const { viewer, setViewer } = useViewer();
  const [health, setHealth] = useState(null);
  const [org, setOrg] = useState([]);
  const [counts, setCounts] = useState({});
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/health", { silent: true }).then(setHealth).catch(() => setHealth({ status: "down" }));
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Refresh badge counts on every page change so they stay in sync with what the user just did.
  useEffect(() => {
    api.get("/org", { silent: true }).then((d) => setOrg(d.roots)).catch(() => {});
    api.get("/dashboard", { silent: true }).then((d) => setCounts(d.counts)).catch(() => {});
  }, [pathname]);

  const groups = groupByTeam(org);
  const myWaiting = waitingOf(groups.flatMap((g) => g.people).find((p) => p.id === viewer?.id));
  const pick = (id) => {
    setViewer(id);
    navigate(`/me/${id}`);
  };

  return (
    <header className={`sticky top-0 z-40 border-b bg-white/85 backdrop-blur-md transition-shadow ${scrolled
      ? "border-slate-200 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.12)]" : "border-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-sm shadow-indigo-200">
            <ArrowRightLeft className="h-4 w-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold text-slate-900">Handover AI</span>
            <span className="block text-[11px] text-slate-400">Northwind Telecom</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 rounded-xl bg-slate-100/80 p-1 md:flex">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.to);
            const count = n.countKey ? counts[n.countKey] : 0;
            return (
              <NavLink key={n.to} to={n.to}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${active ? "text-slate-900" : "text-slate-500 hover:text-slate-800"}`}>
                {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-white shadow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <n.icon className={`relative h-4 w-4 ${active ? "text-indigo-600" : ""}`} />
                <span className="relative font-medium">{n.label}</span>
                {count > 0 && <span className="relative rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold leading-4 text-white"
                  title={`${count} overdue`}>{count}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {health && (
            <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium lg:flex ${health.ai_enabled
              ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
              title={health.ai_enabled ? `Model: ${health.model}` : "No AI key: features use rule-based fallbacks"}>
              <span className={`h-1.5 w-1.5 rounded-full ${health.ai_enabled ? "bg-emerald-500" : "bg-amber-500"}`} />
              {health.ai_enabled ? "Gemini online" : "Fallback mode"}
            </span>
          )}
          {viewer && (
            <Link to={`/me/${viewer.id}`} title="My inbox"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
              <Inbox className="h-5 w-5" />
              {myWaiting > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold leading-4 text-white ring-2 ring-white">{myWaiting}</span>}
            </Link>
          )}
          <ViewerMenu groups={groups} viewer={viewer} onPick={pick} />
        </div>
      </div>
    </header>
  );
}
