const m: Record<string, string> = { open: "bg-blue-100 text-blue-700", in_progress: "bg-amber-100 text-amber-700", resolved: "bg-emerald-100 text-emerald-700", closed: "bg-slate-200 text-slate-500", cancelled: "bg-red-100 text-red-600" };
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${m[status]||"bg-slate-100 text-slate-500"}`}>{label||status}</span>;
}
