import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Clock, Flag } from "lucide-react";
import api from "../api/client";
import Loader from "../components/Loader";

interface Milestone {
  id: string; name: string; description: string; due_date: string | null;
  status: string; total_issues: number; closed_issues: number; progress: number;
  created_at: string; updated_at: string;
}

const daysLeft = (date: string|null) => {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
};

export default function MilestonesPage() {
  const { t } = useTranslation();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", due_date: "" });
  const [filter, setFilter] = useState<"all"|"open"|"closed"|"published">("all");
  const [toast, setToast] = useState("");
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const fetch = async () => {
    const res = await api.get("/milestones");
    setMilestones(res.data); setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post("/milestones", form); setShowForm(false); setForm({ name: "", description: "", due_date: "" }); fetch(); }
    catch (err: any) { showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error","Failed")); }
  };

  const filtered = milestones.filter(m => filter === "all" || m.status === filter);

  if (loading) return <Loader />;

  return (
    <div className="mx-auto max-w-5xl space-y-5 page-enter">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-[8px] bg-red-50 border border-red-100 px-3 py-2 text-[12px] text-red-600 shadow-sm">{toast}</div>}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">{t("milestone.title")}</h1>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{milestones.length} milestones · {milestones.filter(m => m.status === "open").length} active</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary btn-sm"><Plus size={14} />{t("milestone.new_milestone")}</button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card rounded-[8px] p-4 animate-[fadeInUp_.15s_ease-out]">
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("milestone.name")}</label><input required placeholder="Sprint 3" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input" /></div>
              <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("common.due_date")}</label><input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} className="input" /></div>
            </div>
            <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("milestone.description")} <span className="font-normal lowercase text-[var(--text-muted)]/60">(Markdown)</span></label>
              <textarea rows={3} placeholder={t("milestone.desc_hint", "## Goals\n- Feature X\n- Bug fixes")} value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input resize-none mono text-[12px]" /></div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary btn-sm">{t("common.create")}</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
            </div>
          </form>
        </div>
      )}

      {/* Filter tabs — minimal */}
      <div className="flex items-center gap-1">
        {(["all", "open", "closed", "published"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              filter === f ? "bg-[#f3f4f6] text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}>
            {f === "all" ? t("common.all", "All") : t(`milestone.status.${f}`, f)}
          </button>
        ))}
      </div>

      {/* Grid cards */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 rounded-[8px] text-[var(--text-muted)]">
          <Flag size={28} className="mb-2 opacity-20" strokeWidth={1.5} />
          <p className="text-[13px]">{t("milestone.no_milestones")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(m => {
            const left = daysLeft(m.due_date);
            const overdue = left !== null && left < 0;
            const soon = left !== null && left >= 0 && left <= 3;
            return (
              <Link key={m.id} to={`/milestones/${m.id}`}
                className={`card rounded-[8px] p-4 transition-all group ${m.status === "closed" ? "opacity-60" : ""}`}>
                {/* Top: name + status */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[14px] font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors truncate">{m.name}</h3>
                  <span className={`rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${
                    m.status === "open" ? "bg-emerald-50 text-emerald-700" :
                    m.status === "published" ? "bg-sky-50 text-sky-700" :
                    "bg-[#f3f4f6] text-[#6b7280]"
                  }`}>
                    {t(`milestone.status.${m.status}`, m.status)}
                  </span>
                </div>

                {/* Description */}
                {m.description && <p className="mt-1.5 text-[12px] text-[var(--text-muted)] line-clamp-2">{m.description.replace(/[#*>[\]()!|-]/g, "").trim()}</p>}

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span className="tabular-nums">{m.closed_issues}/{m.total_issues} done</span>
                    <span className="mono font-semibold text-[var(--text-secondary)]">{m.progress}%</span>
                  </div>
                  <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-[#f3f4f6]">
                    <div className={`h-full rounded-full transition-all duration-700 ${
                      m.progress >= 100 ? "bg-emerald-500" : m.progress >= 50 ? "bg-[var(--primary)]" : "bg-amber-400"
                    }`} style={{ width: `${m.progress}%` }} />
                  </div>
                </div>

                {/* Due date */}
                {m.due_date && (
                  <div className={`mt-2 flex items-center gap-1 text-[11px] ${overdue ? "text-red-500 font-medium" : soon ? "text-amber-500" : "text-[var(--text-faint)]"}`}>
                    <Clock size={11} />
                    {overdue ? `${Math.abs(left)}d overdue` : left === 0 ? "Due today" : `${left}d left`}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
