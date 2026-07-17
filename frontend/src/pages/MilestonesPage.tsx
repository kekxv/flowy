import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Clock, Flag, CheckCircle2 } from "lucide-react";
import MarkdownContent from "../components/MarkdownContent";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import Loader from "../components/Loader";

interface Milestone {
  id: string; name: string; description: string; due_date: string | null;
  status: string; total_issues: number; closed_issues: number; progress: number;
  created_at: string; updated_at: string;
}

const daysLeft = (date: string|null) => {
  if (!date) return null;
  const d = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  return d;
};

export default function MilestonesPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
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

  const canEdit = (m: any) => user?.role === "admin" || m.owner_id === user?.id;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post("/milestones", form); setShowForm(false); setForm({ name: "", description: "", due_date: "" }); fetch(); }
    catch (err: any) { showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error","Failed")); }
  };

  const toggleStatus = async (m: Milestone) => {
    try { await api.put(`/milestones/${m.id}`, { status: m.status === "open" ? "closed" : "open" }); fetch(); }
    catch (err: any) { showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error","Failed")); }
  };

  const filtered = milestones.filter(m => filter === "all" || m.status === filter);

  if (loading) return <Loader />;

  return (
    <div className="mx-auto max-w-4xl space-y-5 page-enter">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-[13px] text-red-700 shadow-lg animate-[fadeInUp_.2s_ease-out]">{toast}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("milestone.title")}</h1>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{milestones.length} milestones · {milestones.filter(m=>m.status==="open").length} active</p>
        </div>
        <button onClick={()=>setShowForm(!showForm)} className="btn btn-primary"><Plus size={15}/>{t("milestone.new_milestone")}</button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card rounded-xl p-4 animate-[fadeInUp_.15s_ease-out]">
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("milestone.name")}</label><input required placeholder="Sprint 3" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="input"/></div>
              <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("common.due_date")}</label><input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} className="input"/></div>
            </div>
            <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("milestone.description")} <span className="font-normal lowercase text-[var(--text-muted)]/60">(Markdown)</span></label>
              <textarea rows={3} placeholder={t("milestone.desc_hint","## Goals\n- Feature X\n- Bug fixes")} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="input resize-none font-mono text-xs"/></div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary btn-sm">{t("common.create")}</button>
              <button type="button" onClick={()=>setShowForm(false)} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
            </div>
          </form>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1">
        {(["all","open","closed","published"] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${filter===f?"bg-[var(--primary)] text-white":"text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"}`}>
            {f==="all"?t("common.all","All"):t(`milestone.status.${f}`,f)}
          </button>
        ))}
      </div>

      {filtered.length===0 ? (
        <div className="card flex flex-col items-center justify-center py-16 rounded-xl text-[var(--text-muted)]">
          <Flag size={36} className="mb-3 text-[var(--border)]"/><p className="text-sm">{t("milestone.no_milestones")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map(m => {
            const left = daysLeft(m.due_date);
            const overdue = left !== null && left < 0;
            const soon = left !== null && left >= 0 && left <= 3;
            return (
              <Link key={m.id} to={`/milestones/${m.id}`}
                className={`card rounded-xl p-5 hover:shadow-[var(--shadow-md)] transition-all group ${
                  m.status==="closed"?"opacity-60":""}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-[15px] group-hover:text-[var(--primary)] transition-colors">{m.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        m.status==="open"?"bg-emerald-50 text-emerald-700":m.status==="published"?"bg-blue-50 text-blue-700":"bg-slate-100 text-slate-500"}`}>
                        {m.status==="published"?"🚀 ":""}{t(`milestone.status.${m.status}`,m.status)}
                      </span>
                    </div>
                    {m.description && <div className="mt-1 text-[13px] text-[var(--text-muted)] line-clamp-2 prose prose-sm max-w-none"><MarkdownContent>{m.description}</MarkdownContent></div>}
                  </div>
                  {canEdit(m) && <button onClick={e=>{e.preventDefault();toggleStatus(m);}}
                    className="shrink-0 rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors opacity-0 group-hover:opacity-100">
                    {m.status==="open"?<CheckCircle2 size={16}/>:<Flag size={16}/>}
                  </button>}
                </div>

                {/* Progress */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>{t("milestone.progress")}</span>
                    <span className="font-mono font-semibold text-[var(--text)]">{m.progress}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                    <div className={`h-full rounded-full transition-all duration-700 ease-out ${
                      m.progress>=100?"bg-emerald-500":m.progress>=50?"bg-[var(--primary)]":"bg-amber-400"}`}
                      style={{width:`${m.progress}%`}}/>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                    <span>{m.closed_issues}/{m.total_issues} {t("dashboard.done","done")}</span>
                    {m.due_date && (
                      <span className={`flex items-center gap-1 ${overdue?"text-red-500 font-medium":soon?"text-amber-500":""}`}>
                        <Clock size={10}/>
                        {overdue?`${Math.abs(left)}d overdue`:left===0?"Due today":`${left}d left`}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
