import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Clock, Flag, GanttChart as GanttIcon, LayoutGrid, CalendarDays } from "lucide-react";
import api from "../api/client";
import PageHeader from "../components/ui/PageHeader";
import Segmented from "../components/ui/Segmented";
import EmptyState from "../components/ui/EmptyState";
import { CardsSkeleton } from "../components/ui/Skeleton";
import GanttChart, { type GanttMilestone } from "../components/GanttChart";

interface Milestone {
  id: string; name: string; description: string; start_date?: string | null; due_date: string | null;
  status: string; total_issues: number; closed_issues: number; progress: number;
  created_at: string; updated_at: string;
}

const daysLeft = (date: string|null) => {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
};

export default function MilestonesPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [sp, setSp] = useSearchParams();
  const updateQuery = (key: string, value: string) => setSp(previous => {
    const next = new URLSearchParams(previous);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  });
  const view: "cards" | "gantt" = sp.get("view") === "gantt" ? "gantt" : "cards";
  const filterValue = sp.get("filter");
  const filter: "all" | "open" | "closed" | "published" = filterValue === "open" || filterValue === "closed" || filterValue === "published" ? filterValue : "all";
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", start_date: "", due_date: "" });

  const [gantt, setGantt] = useState<GanttMilestone[]>([]);

  const [toast, setToast] = useState("");
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const fetch = async () => {
    const res = await api.get("/milestones");
    setMilestones(res.data); setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post("/milestones", form); setShowForm(false); setForm({ name: "", description: "", start_date: "", due_date: "" }); fetch(); }
    catch (err: any) { showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error","Failed")); }
  };

  const filtered = milestones.filter(m => filter === "all" || m.status === filter);
  useEffect(() => {
    if (view !== "gantt" || loading) return;
    let active = true;
    Promise.all(milestones.filter(m => filter === "all" || m.status === filter)
      .map(async m => ({ ...m, issues: (await api.get(`/milestones/${m.id}/issues`)).data })))
      .then(data => { if (active) setGantt(data); });
    return () => { active = false; };
  }, [view, filter, milestones, loading]);

  const counts = {
    all: milestones.length,
    open: milestones.filter(m => m.status === "open").length,
    closed: milestones.filter(m => m.status === "closed").length,
    published: milestones.filter(m => m.status === "published").length,
  };

  return (
    <div className="page-enter">
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-[8px] border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600 shadow-sm">{toast}</div>}

      <PageHeader
        icon={Flag}
        title={t("milestone.title")}
        subtitle={loading ? t("common.loading", "加载中…") : t("milestones.subtitle", "{{total}} 个里程碑 · {{open}} 个进行中", { total: milestones.length, open: counts.open })}
        actions={
          <>
            <Segmented
              ariaLabel={t("milestones.view", "视图")}
              value={view}
              onChange={v => updateQuery("view", v === "gantt" ? "gantt" : "")}
              items={[
                { key: "cards", label: <><LayoutGrid size={13} />{t("milestones.cards", "卡片")}</> },
                { key: "gantt", label: <><GanttIcon size={13} />{t("milestones.gantt", "甘特图")}</> },
              ]}
            />
            <button onClick={() => setShowForm(!showForm)} className="btn btn-primary btn-sm"><Plus size={14} />{t("milestone.new_milestone")}</button>
          </>
        }
      />

      {showForm && (
        <div className="panel mb-3 p-4">
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="field sm:col-span-1">
                <span className="field-label">{t("milestone.name")}</span>
                <input required placeholder="Sprint 3" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input h-9" />
              </label>
              <label className="field">
                <span className="field-label">{t("milestones.start", "开始时间")}</span>
                <input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} className="input h-9" />
              </label>
              <label className="field">
                <span className="field-label">{t("common.due_date")}</span>
                <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} className="input h-9" />
              </label>
            </div>
            <label className="field">
              <span className="field-label">{t("milestone.description")} <span className="font-normal text-[var(--text-faint)]">(Markdown)</span></span>
              <textarea rows={3} placeholder={t("milestone.desc_hint", "## Goals\n- Feature X\n- Bug fixes")} value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input mono resize-none text-[12px]" />
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary btn-sm">{t("common.create")}</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-2">
        <Segmented
          ariaLabel={t("milestones.filter", "筛选")}
          value={filter}
          onChange={f => updateQuery("filter", f === "all" ? "" : f)}
          items={[
            { key: "all", label: t("common.all", "All"), count: counts.all },
            { key: "open", label: t("milestone.status.open", "open"), count: counts.open },
            { key: "closed", label: t("milestone.status.closed", "closed"), count: counts.closed },
            { key: "published", label: t("milestone.status.published", "published"), count: counts.published },
          ]}
        />
      </div>

      {loading ? <CardsSkeleton cards={6} /> : view === "gantt" ? <GanttChart milestones={gantt} /> : (
        filtered.length === 0 ? (
          <div className="panel"><EmptyState icon={Flag} title={t("milestone.no_milestones")} /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(m => {
              const left = daysLeft(m.due_date);
              const overdue = left !== null && left < 0;
              const soon = left !== null && left >= 0 && left <= 3;
              return (
                <Link key={m.id} to={`/milestones/${m.id}`} state={{ from: location.pathname + location.search }}
                  className={`panel group flex flex-col p-4 transition-all hover:-translate-y-px hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] ${m.status === "closed" ? "opacity-65" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-[13.5px] font-semibold text-[var(--text)] transition-colors group-hover:text-[var(--primary)]">{m.name}</h3>
                    <span className={`chip shrink-0 ${m.status === "open" ? "chip-emerald" : m.status === "published" ? "chip-sky" : "chip-gray"}`}>
                      {t(`milestone.status.${m.status}`, m.status)}
                    </span>
                  </div>

                  {m.description && <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{m.description.replace(/[#*>[\]()!|-]/g, "").trim()}</p>}

                  <div className="mt-auto pt-3">
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                      <span className="tabular-nums">{m.closed_issues}/{m.total_issues} {t("milestones.done", "已完成")}</span>
                      <span className="mono font-semibold text-[var(--text-secondary)]">{m.progress}%</span>
                    </div>
                    <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-[var(--bg-muted)]">
                      <div className={`h-full rounded-full transition-all duration-700 ${
                        m.progress >= 100 ? "bg-emerald-500" : m.progress >= 50 ? "bg-[var(--primary)]" : "bg-amber-400"
                      }`} style={{ width: `${m.progress}%` }} />
                    </div>
                    {m.due_date && (
                      <div className={`mt-2 flex items-center gap-1 text-[11px] ${overdue ? "font-medium text-red-500" : soon ? "text-amber-500" : "text-[var(--text-faint)]"}`}>
                        {overdue ? <Clock size={11} /> : <CalendarDays size={11} />}
                        {m.due_date.slice(0, 10)}
                        <span className="opacity-60">·</span>
                        {overdue ? t("milestones.overdue", { n: Math.abs(left!) }) : left === 0 ? t("milestone.due_today") : t("milestones.left", { n: left })}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
