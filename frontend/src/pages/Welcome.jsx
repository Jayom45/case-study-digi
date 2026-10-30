import { motion } from "framer-motion";
import { ArrowRight, ArrowRightLeft, CalendarX2, LayoutList, UserRoundPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ACTIONS = [
  { icon: UserRoundPlus, title: "I'm taking over work", text: "Get a Takeover Pack tailored to your role.", to: "/who?intent=takeover", primary: true },
  { icon: CalendarX2, title: "I missed a meeting", text: "Catch up on decisions and your action items.", to: "/who?intent=missed" },
  { icon: LayoutList, title: "Manage meetings", text: "Recaps, action items and the knowledge base.", to: "/manage/meetings" },
];

// Subtle entrance: everything is in place in about 1 second.
const fade = (delay) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: "easeOut" },
});

export default function Welcome() {
  const navigate = useNavigate();
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-200/40 blur-3xl" />
      <motion.div {...fade(0)} className="relative mb-8 flex items-center gap-2 font-semibold text-slate-900">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <ArrowRightLeft className="h-4 w-4" />
        </span>
        Handover AI
      </motion.div>
      <motion.h1 {...fade(0.1)} className="relative max-w-3xl text-center text-5xl font-bold leading-tight tracking-tight text-slate-900 md:text-6xl">
        Never lose context when <span className="text-indigo-600">work changes hands</span>
      </motion.h1>
      <motion.p {...fade(0.2)} className="relative mt-5 max-w-xl text-center text-lg text-slate-500">
        Meetings, decisions and action items, turned into a clear, role-aware brief for whoever picks up the work next.
      </motion.p>
      <div className="relative mt-12 grid w-full max-w-4xl gap-4 md:grid-cols-3">
        {ACTIONS.map((a, i) => (
          <motion.button key={a.title} {...fade(0.35 + i * 0.1)} whileHover={{ y: -4 }} onClick={() => navigate(a.to)}
            className={`group rounded-2xl border p-6 text-left shadow-sm transition ${a.primary
              ? "border-indigo-600 bg-indigo-600 text-white shadow-indigo-200 hover:shadow-lg"
              : "border-slate-200 bg-white hover:border-indigo-200 hover:shadow-md"}`}>
            <a.icon className={`h-6 w-6 ${a.primary ? "text-indigo-100" : "text-indigo-600"}`} />
            <p className="mt-4 font-semibold">{a.title}</p>
            <p className={`mt-1 text-sm ${a.primary ? "text-indigo-100" : "text-slate-500"}`}>{a.text}</p>
            <ArrowRight className={`mt-4 h-4 w-4 transition group-hover:translate-x-1 ${a.primary ? "" : "text-slate-400"}`} />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
