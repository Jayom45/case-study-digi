import { ArrowRightLeft, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Avatar } from "./ui";
import { useViewer } from "./Viewer";

const NAV = [
  { to: "/who", label: "People" },
  { to: "/manage/meetings", label: "Meetings" },
  { to: "/manage/items", label: "Action items" },
  { to: "/manage/kb", label: "Knowledge base" },
];

export default function TopBar() {
  const { people, viewer, setViewer } = useViewer();
  const [health, setHealth] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/health", { silent: true }).then(setHealth).catch(() => setHealth({ status: "down" }));
  }, []);

  const switchTo = (e) => {
    const id = Number(e.target.value) || null;
    setViewer(id);
    if (id) navigate(`/me/${id}`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <ArrowRightLeft className="h-4 w-4" />
          </span>
          Handover AI
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm transition ${isActive
                ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          {health && (
            <span className="hidden items-center gap-1.5 text-xs text-slate-500 lg:flex"
              title={health.ai_enabled ? `Model: ${health.model}` : "No AI key: features use rule-based fallbacks"}>
              <span className={`h-2 w-2 rounded-full ${health.ai_enabled ? "bg-emerald-500" : "bg-amber-400"}`} />
              {health.ai_enabled ? "AI online" : "AI offline · fallback mode"}
            </span>
          )}
          {/* Native <select> stretched invisibly over a styled pill: accessible and zero extra code. */}
          <label className="relative flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1 pl-1.5 pr-8 text-sm hover:border-slate-300">
            {viewer ? <Avatar name={viewer.name} size="sm" /> : <span className="h-7 w-1" />}
            <span className="text-slate-400">Viewing as</span>
            <span className="font-medium text-slate-700">{viewer ? viewer.name : "nobody"}</span>
            <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-400" />
            <select value={viewer?.id || ""} onChange={switchTo}
              className="absolute inset-0 cursor-pointer opacity-0" aria-label="Viewing as">
              <option value="">Choose a person…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
            </select>
          </label>
        </div>
      </div>
    </header>
  );
}
