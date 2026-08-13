import { Link } from "react-router-dom";

export interface GanttItem { id: string; title: string; status: string; start_date?: string | null; due_date?: string | null; created_at: string; }
export interface GanttMilestone { id: string; name: string; start_date?: string | null; due_date?: string | null; issues: GanttItem[]; }

function dateValue(value?: string | null) { return value ? new Date(`${value.slice(0, 10)}T00:00:00`).getTime() : null; }
function dateLabel(value: number) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }

export default function GanttChart({ milestones }: { milestones: GanttMilestone[] }) {
  const scheduled = milestones.flatMap(m => [m.start_date, m.due_date, ...m.issues.flatMap(i => [i.start_date || i.created_at, i.due_date])]).map(dateValue).filter((v): v is number => v !== null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = Math.min(...scheduled, today.getTime() - 7 * 86400000);
  const end = Math.max(...scheduled, today.getTime() + 21 * 86400000, start + 28 * 86400000);
  const span = Math.max(end - start, 86400000);
  const left = (value: number) => `${Math.max(0, ((value - start) / span) * 100)}%`;
  const width = (from: number, to: number) => `${Math.max(2, ((to - from) / span) * 100)}%`;
  const ticks = Array.from({ length: 5 }, (_, index) => start + (span / 4) * index);
  return <div className="gantt-card overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
    <div className="min-w-[760px]">
      <div className="mb-3 grid grid-cols-[190px_1fr] border-b border-[var(--border-light)] pb-2"><span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Milestone / issue</span><div className="relative h-4">{ticks.map(t => <span key={t} className="absolute -translate-x-1/2 text-[10px] text-[var(--text-faint)]" style={{ left: left(t) }}>{dateLabel(t)}</span>)}</div></div>
      {milestones.map(m => <div key={m.id} className="border-b border-[var(--border-light)] py-3 last:border-0"><div className="grid grid-cols-[190px_1fr] items-center gap-3"><Link to={`/milestones/${m.id}`} className="truncate text-[13px] font-semibold text-[var(--text)] hover:text-[var(--primary)]">{m.name}</Link><TimelineBar start={dateValue(m.start_date) || Math.min(...m.issues.map(i => dateValue(i.start_date || i.created_at) || today.getTime()), today.getTime())} end={dateValue(m.due_date) || Math.max(...m.issues.map(i => dateValue(i.due_date) || today.getTime()), today.getTime())} left={left} width={width} className="bg-[var(--primary)]/20" /></div>
        {m.issues.map(i => { const from = dateValue(i.start_date || i.created_at) || today.getTime(); const to = dateValue(i.due_date) || from + 86400000; return <div key={i.id} className="mt-2 grid grid-cols-[190px_1fr] items-center gap-3"><Link to={`/issues/${i.id}`} className="truncate pl-4 text-[12px] text-[var(--text-muted)] hover:text-[var(--primary)]">{i.title}</Link><TimelineBar start={from} end={to} left={left} width={width} className={i.status === "closed" || i.status === "resolved" ? "bg-emerald-500" : "bg-[var(--primary)]"} /></div>; })}
      </div>)}
      <span aria-label="Today" className="pointer-events-none absolute hidden" />
    </div>
  </div>;
}

function TimelineBar({ start, end, left, width, className }: { start: number; end: number; left: (value: number) => string; width: (from: number, to: number) => string; className: string }) {
  return <div className="relative h-6 rounded bg-[var(--bg-muted)]"><span className={`absolute top-1 h-4 rounded-full ${className}`} style={{ left: left(start), width: width(start, Math.max(end, start + 86400000)) }} /></div>;
}
