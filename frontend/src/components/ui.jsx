// Small shared building blocks so every screen looks consistent.
import { Link } from "react-router-dom";
import { initials } from "../format";

export function Card({ className = "", children, ...props }) {
  return (
    <div className={`elevated rounded-2xl border border-slate-200/70 bg-white/90 backdrop-blur-sm ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Section({ title, icon: Icon, hint, children, className = "" }) {
  return (
    <Card className={`p-6 ${className}`}>
      <div className="mb-5 flex items-center gap-2.5">
        {Icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-50 to-violet-50 ring-1 ring-indigo-100">
            <Icon className="h-3.5 w-3.5 text-indigo-600" />
          </span>
        )}
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
        {hint && <span className="ml-auto text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </Card>
  );
}

const BUTTON = {
  primary: "bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm shadow-indigo-200 hover:from-indigo-600 hover:to-indigo-700",
  secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
};

export function Button({ variant = "primary", className = "", children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition
        disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const BADGE = {
  slate: "bg-slate-100 text-slate-600",
  indigo: "bg-indigo-50 text-indigo-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-rose-50 text-rose-700",
};

export function Badge({ color = "slate", className = "", children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[color]} ${className}`}>
      {children}
    </span>
  );
}

/** 'AI' vs 'fallback' label: users always know whether a model or simple rules produced the content. */
export function SourceBadge({ source }) {
  return source === "ai" ? <Badge color="indigo">✦ AI generated</Badge> : <Badge color="amber">Rule-based fallback</Badge>;
}

/** Traceability tag: every line points back to the meeting or item it came from. */
export function SourceTag({ meetingId, itemId, label }) {
  const to = meetingId ? `/manage/meetings/${meetingId}` : `/manage/items?item=${itemId}`;
  return (
    <Link to={to} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 hover:bg-indigo-50 hover:text-indigo-700">
      {label || (meetingId ? `meeting ${meetingId}` : `#${itemId}`)}
    </Link>
  );
}

// Soft two-tone gradients; colour is picked from the name so a person always looks the same.
const AVATAR = [
  "from-indigo-100 to-indigo-200 text-indigo-700", "from-sky-100 to-sky-200 text-sky-700",
  "from-emerald-100 to-emerald-200 text-emerald-700", "from-amber-100 to-amber-200 text-amber-700",
  "from-rose-100 to-rose-200 text-rose-700", "from-violet-100 to-violet-200 text-violet-700",
];

export function Avatar({ name, size = "md" }) {
  const color = AVATAR[[...(name || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];
  const dims = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-sm";
  return <div className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold ring-2 ring-white ${dims} ${color}`}>{initials(name)}</div>;
}

export function Skeleton({ className = "" }) {
  return <div className={`shimmer rounded-xl bg-slate-200/60 ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-32" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center py-10 text-center text-slate-500">
      {Icon && <Icon className="mb-3 h-8 w-8 text-slate-300" />}
      <p className="font-medium text-slate-600">{title}</p>
      {children && <p className="mt-1 text-sm">{children}</p>}
    </div>
  );
}

export function ProgressBar({ value }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${value === 100
        ? "from-emerald-400 to-emerald-500" : "from-indigo-400 to-violet-500"}`} style={{ width: `${value}%` }} />
    </div>
  );
}

// ---------- Forms, modal, drawer ----------
const INPUT = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export const Input = (props) => <input {...props} className={`${INPUT} ${props.className || ""}`} />;
export const Textarea = (props) => <textarea {...props} className={`${INPUT} ${props.className || ""}`} />;
export const Select = ({ children, ...props }) => (
  <select {...props} className={`${INPUT} ${props.className || ""}`}>{children}</select>
);

export function Modal({ title, onClose, children, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[88vh] w-full flex-col rounded-2xl bg-white shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-[2px]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        {children}
      </div>
    </div>
  );
}

export const STATUS_COLOR = {
  scheduled: "indigo", held: "green", closed: "slate",
  open: "slate", in_progress: "indigo", blocked: "red", done: "green", dropped: "slate",
};

export function StatusBadge({ status }) {
  return <Badge color={STATUS_COLOR[status] || "slate"}>{status.replace("_", " ")}</Badge>;
}
