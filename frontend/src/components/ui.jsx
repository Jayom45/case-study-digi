// Small shared building blocks so every screen looks consistent.
import { Link } from "react-router-dom";
import { initials } from "../format";

export function Card({ className = "", children, ...props }) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Section({ title, icon: Icon, hint, children, className = "" }) {
  return (
    <Card className={`p-6 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-indigo-600" />}
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        {hint && <span className="ml-auto text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </Card>
  );
}

const BUTTON = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
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

const AVATAR = ["bg-indigo-100 text-indigo-700", "bg-sky-100 text-sky-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-violet-100 text-violet-700"];

export function Avatar({ name, size = "md" }) {
  const color = AVATAR[[...(name || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];
  const dims = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-sm";
  return <div className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${dims} ${color}`}>{initials(name)}</div>;
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />;
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
      <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${value}%` }} />
    </div>
  );
}
