// Action items tracker: filter, search, open an item's drawer (edit / close / nudge / history).
import { Clock, ListTodo, Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import ItemDrawer from "../components/ItemDrawer";
import { Avatar, Badge, Card, Empty, Input, PageSkeleton, Select, StatusBadge } from "../components/ui";
import { useViewer } from "../components/Viewer";
import { fmtDate } from "../format";
import { useLoad } from "../hooks";

// Each filter maps to the backend's query parameters (filtering happens server-side).
const FILTERS = [
  { key: "open", label: "Open", query: "open_only=true" },
  { key: "overdue", label: "Overdue", query: "overdue=true" },
  { key: "stale", label: "Stale (carried 2+)", query: "stale=true" },
  { key: "done", label: "Done", query: "status=done" },
  { key: "all", label: "All", query: "" },
];

export default function Items() {
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "open";
  const owner = params.get("owner") || "";
  const openItem = Number(params.get("item")) || null;
  const [search, setSearch] = useState("");
  const { people } = useViewer();

  const query = [FILTERS.find((f) => f.key === filter)?.query, owner && `owner_id=${owner}`].filter(Boolean).join("&");
  const { data, loading, reload } = useLoad(() => api.get(`/items${query ? `?${query}` : ""}`), [query]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };

  const shown = (data || []).filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Tracker</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Action items</h1>
        <p className="mt-1 text-slate-500">Every item keeps one history from creation to outcome, across meetings and handovers.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-100/80 p-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setParam("filter", f.key === "open" ? "" : f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${filter === f.key
                ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <Select value={owner} onChange={(e) => setParam("owner", e.target.value)} className="!w-56">
          <option value="">All owners</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <div className="relative ml-auto w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" className="pl-9" />
        </div>
      </div>

      {loading ? <PageSkeleton /> : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[60px_1fr_180px_110px_120px] gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>#</span><span>Item</span><span>Owner</span><span>Due</span><span>Status</span>
          </div>
          {shown.map((it) => (
            <button key={it.id} onClick={() => setParam("item", it.id)}
              className="grid w-full grid-cols-[60px_1fr_180px_110px_120px] items-center gap-3 border-b border-slate-100 px-5 py-3 text-left text-sm transition last:border-0 hover:bg-indigo-50/40">
              <span className="font-mono text-xs text-slate-400">#{it.id}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-800">{it.title}</span>
                <span className="mt-0.5 flex gap-1.5">
                  {it.carry_count >= 2 && <Badge color="amber">carried {it.carry_count}×</Badge>}
                  {it.outcome && <span className="truncate text-xs text-slate-500">Outcome: {it.outcome}</span>}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-2">
                {it.owner ? <><Avatar name={it.owner.name} size="sm" /><span className="truncate text-slate-600">{it.owner.name}</span></>
                  : <span className="text-slate-400">Unassigned</span>}
              </span>
              <span className={`flex items-center gap-1 text-xs ${it.is_overdue ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                <Clock className="h-3 w-3" /> {fmtDate(it.due_date)}
              </span>
              <span><StatusBadge status={it.status} /></span>
            </button>
          ))}
          {!shown.length && <Empty icon={ListTodo} title="No items match">Try another filter.</Empty>}
        </Card>
      )}

      {openItem && <ItemDrawer itemId={openItem} onClose={() => setParam("item", "")} onChanged={reload} />}
    </div>
  );
}
