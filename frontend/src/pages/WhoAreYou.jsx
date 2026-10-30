// "Who are you?" — the org chart. Clicking a person = "become" them and open their inbox.
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Avatar, PageSkeleton } from "../components/ui";
import { useViewer } from "../components/Viewer";
import { useLoad } from "../hooks";

function PersonCard({ person, depth, onPick }) {
  const waiting = person.badges.handovers + person.badges.missed;
  const label = [
    person.badges.handovers && `${person.badges.handovers} handover`,
    person.badges.missed && `${person.badges.missed} missed`,
  ].filter(Boolean).join(" · ");
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + depth * 0.15 }}
      whileHover={{ y: -3 }} onClick={() => onPick(person)}
      className={`relative w-44 rounded-2xl border bg-white p-4 text-center shadow-sm transition hover:shadow-md ${waiting
        ? "border-indigo-300 ring-4 ring-indigo-100" : "border-slate-200 hover:border-indigo-200"}`}>
      {waiting > 0 && (
        <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
          <span className="relative rounded-full bg-indigo-600 px-2 text-xs font-semibold leading-6 text-white">{waiting}</span>
        </span>
      )}
      <div className="flex justify-center"><Avatar name={person.name} size="lg" /></div>
      <p className="mt-3 truncate text-sm font-semibold text-slate-800">{person.name}</p>
      <p className="truncate text-xs text-slate-500">{person.role}</p>
      {label && <p className="mt-2 text-[11px] font-medium text-indigo-600">{label} waiting</p>}
    </motion.button>
  );
}

function Branch({ person, depth, onPick }) {
  return (
    <li>
      <PersonCard person={person} depth={depth} onPick={onPick} />
      {person.reports.length > 0 && (
        <ul>
          {person.reports.map((r) => <Branch key={r.id} person={r} depth={depth + 1} onPick={onPick} />)}
        </ul>
      )}
    </li>
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
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Who are you?</h1>
        <p className="mt-2 text-slate-500">
          {intent === "takeover" ? "Pick yourself to see the work being handed to you."
            : intent === "missed" ? "Pick yourself to catch up on the meetings you missed."
              : "Pick a person to see what is waiting for them."}
          {" "}Glowing cards have something waiting.
        </p>
      </div>
      {loading ? <PageSkeleton /> : (
        <div className="tree overflow-x-auto pb-6">
          <ul>
            {data.roots.map((r) => <Branch key={r.id} person={r} depth={0} onPick={pick} />)}
          </ul>
        </div>
      )}
    </div>
  );
}
