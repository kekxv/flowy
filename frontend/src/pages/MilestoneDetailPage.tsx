import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Clock, Calendar, Flag, CheckCircle2, AlertCircle, Edit3, Rocket } from "lucide-react";
import ReactMarkdown from "react-markdown";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";

interface IssueItem { id: string; title: string; status: string; priority: string; issue_type?: string; created_at: string; }
interface MilestoneData { id: string; name: string; description: string; due_date: string|null; status: string; total_issues: number; closed_issues: number; progress: number; created_at: string; updated_at: string; owner_id?: string; }

const daysLeft = (date: string|null) => { if (!date) return null; return Math.ceil((new Date(date).getTime()-Date.now())/86400000); };

export default function MilestoneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [milestone, setMilestone] = useState<MilestoneData|null>(null);
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [ef, setEf] = useState({name:"",description:"",due_date:""});
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    if (!id) return;
    Promise.all([api.get("/milestones"), api.get(`/milestones/${id}/issues`)]).then(([mlRes, isRes]) => {
      const found = mlRes.data.find((m:any)=>m.id===id);
      if (found) { setMilestone(found); setEf({name:found.name,description:found.description||"",due_date:found.due_date||""}); }
      setIssues(isRes.data); setLoading(false);
    });
  }, [id]);

  const refresh = async () => {
    const [mlRes, isRes] = await Promise.all([api.get("/milestones"), api.get(`/milestones/${id}/issues`)]);
    const found = mlRes.data.find((m:any)=>m.id===id);
    if (found) { setMilestone(found); setEf({name:found.name,description:found.description||"",due_date:found.due_date||""}); }
    setIssues(isRes.data);
  };

  const canEdit = user?.role === "admin" || milestone?.owner_id === user?.id;

  const save = async () => {
    try { await api.put(`/milestones/${id}`,ef); setEdit(false); refresh(); }
    catch (err: any) { showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error","Failed")); }
  };
  const toggleStatus = async (s: string) => {
    if (!milestone) return;
    try { await api.put(`/milestones/${id}`,{status:s}); refresh(); }
    catch (err: any) { showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error","Failed")); }
  };

  if (loading) return <div className="flex justify-center pt-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--primary)] border-t-transparent"/></div>;
  if (!milestone) return <div className="text-center text-[var(--text-muted)] pt-16">{t("milestone.no_milestones")}</div>;

  const left = daysLeft(milestone.due_date);
  const overdue = left !== null && left < 0;
  const soon = left !== null && left >= 0 && left <= 3;

  return (
    <div className="mx-auto max-w-5xl space-y-5 page-enter">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-[13px] text-red-700 shadow-lg animate-[fadeInUp_.2s_ease-out]">{toast}</div>}

      <Link to="/milestones" className="btn btn-ghost btn-sm"><ArrowLeft size={14}/>{t("common.back")}</Link>

      {/* Header card */}
      <div className="card rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500/5 to-purple-500/5 px-6 py-5 border-b border-[var(--border-light)]">
          {edit ? (
            <div className="space-y-3">
              <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("milestone.name")}</label><input value={ef.name} onChange={e=>setEf({...ef,name:e.target.value})} className="input font-bold text-lg"/></div>
              <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("milestone.description")} <span className="font-normal lowercase">(Markdown)</span></label><textarea rows={4} value={ef.description} onChange={e=>setEf({...ef,description:e.target.value})} className="input resize-none font-mono text-xs"/></div>
              <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("common.due_date")}</label><input type="date" value={ef.due_date} onChange={e=>setEf({...ef,due_date:e.target.value})} className="input w-48"/></div>
              <div className="flex gap-2">
                <button onClick={save} className="btn btn-primary btn-sm">{t("common.save")}</button>
                <button onClick={()=>setEdit(false)} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{milestone.name}</h1>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    milestone.status==="open"?"bg-emerald-50 text-emerald-700":milestone.status==="published"?"bg-blue-50 text-blue-700":"bg-slate-100 text-slate-500"}`}>
                    {milestone.status==="published"?"🚀 ":""}{t(`milestone.status.${milestone.status}`,milestone.status)}
                  </span>
                </div>
                {milestone.description && <div className="mt-1.5 text-sm text-[var(--text-muted)] prose prose-sm max-w-none"><ReactMarkdown>{milestone.description}</ReactMarkdown></div>}
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1"><Calendar size={12}/>{t("common.created_at")}: {new Date(milestone.created_at).toLocaleDateString()}</span>
                  {milestone.due_date && (
                    <span className={`flex items-center gap-1 font-medium ${overdue?"text-red-500":soon?"text-amber-500":""}`}>
                      <Clock size={12}/>
                      {overdue?`${Math.abs(left!)}d ${t("milestone.overdue","overdue")}`:left===0?t("milestone.due_today","Due today"):`${left}d ${t("milestone.due_in","left")}`}
                    </span>
                  )}
                </div>
              </div>
              {canEdit && <div className="flex items-center gap-2">
                <button onClick={()=>setEdit(true)} className="btn btn-outline btn-sm"><Edit3 size={12}/>{t("common.edit")}</button>
                {milestone.status!=="published"&&<button onClick={()=>toggleStatus("published")}
                  className="btn btn-sm bg-blue-50 text-blue-700 hover:bg-blue-100"><Rocket size={12}/>{t("milestone.publish","Publish")}</button>}
                {milestone.status!=="closed"&&<button onClick={()=>toggleStatus("closed")}
                  className="btn btn-sm bg-slate-100 text-slate-600 hover:bg-slate-200"><CheckCircle2 size={12}/>{t("milestone.close")}</button>}
                {milestone.status!=="open"&&<button onClick={()=>toggleStatus("open")}
                  className="btn btn-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><Flag size={12}/>{t("milestone.reopen")}</button>}
              </div>}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="px-6 py-4 border-b border-[var(--border-light)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("milestone.progress")}</span>
            <span className="text-lg font-bold text-[var(--text)]">{milestone.progress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-muted)]">
            <div className={`h-full rounded-full transition-all duration-1000 ease-out ${milestone.progress>=100?"bg-emerald-500":milestone.progress>=50?"bg-[var(--primary)]":"bg-amber-400"}`}
              style={{width:`${milestone.progress}%`}}/>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-500"/>{milestone.closed_issues} closed</span>
            <span className="flex items-center gap-1"><AlertCircle size={12} className="text-amber-500"/>{(milestone.total_issues-milestone.closed_issues)} open</span>
            <span className="flex items-center gap-1"><Flag size={12} className="text-[var(--primary)]"/>{milestone.total_issues} total</span>
          </div>
        </div>
      </div>

      {/* Issue list */}
      <div className="card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-light)] px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t("issues.title")}
            <span className="rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">{issues.length}</span>
          </h2>
        </div>
        {issues.length===0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-muted)]">{t("issues.no_issues")}</div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {issues.map((issue, idx) => {
              const statusL = (s:string) => ({ open:"border-l-[#1a6ff5]", in_progress:"border-l-amber-400", resolved:"border-l-emerald-400", closed:"border-l-[var(--border)]", cancelled:"border-l-red-400", proposed:"border-l-purple-400", accepted:"border-l-emerald-400", rejected:"border-l-red-400" })[s]||"";
              return (
              <Link key={issue.id} to={`/issues/${issue.id}`}
                className={`flex items-center gap-3 border-l-[3px] px-5 py-3 transition-colors hover:bg-[var(--bg-hover)] ${statusL(issue.status)} ${idx%2?"bg-[var(--bg)]/40":""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${(issue as any).issue_type==="feature"?"bg-violet-50 text-violet-600":"bg-amber-50 text-amber-600"}`}>{t(`issues.type.${(issue as any).issue_type||"bug"}`)}</span>
                    <span className="truncate text-[13px] font-medium hover:text-[var(--primary)]">{issue.title}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-x-2 text-[10px] text-[var(--text-muted)]">
                    <span className="font-mono">#{issue.id.slice(0,8)}</span>
                    <span>{new Date(issue.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`priority-${issue.priority} rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium`}>{t(`issues.priority.${issue.priority}`)}</span>
                  <span className={`status-${issue.status}`}>{t(`issues.status.${issue.status}`)}</span>
                </div>
              </Link>
            )})}
          </div>
        )}
      </div>
    </div>
  );
}
