import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Clock, Calendar, Flag, CheckCircle2, AlertCircle, Pencil, Rocket } from "lucide-react";
import MarkdownContent from "../components/MarkdownContent";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import EmptyState from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { formatDate } from "../utils/time";

interface IssueItem { id: string; title: string; status: string; priority: string; issue_type?: string; created_at: string; start_date?: string|null; due_date?: string|null; }
interface MilestoneData { id: string; name: string; description: string; start_date?: string|null; due_date: string|null; status: string; total_issues: number; closed_issues: number; progress: number; created_at: string; updated_at: string; owner_id?: string; }

const daysLeft = (date: string|null) => { if (!date) return null; return Math.ceil((new Date(date).getTime()-Date.now())/86400000); };

const STATUS_CHIP: Record<string, string> = { open: "chip-emerald", published: "chip-sky", closed: "chip-gray" };

export default function MilestoneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const returnTo = typeof location.state?.from === "string" && (location.state.from === "/milestones" || location.state.from.startsWith("/milestones?")) ? location.state.from : "/milestones";
  const { t, i18n } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [milestone, setMilestone] = useState<MilestoneData|null>(null);
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [ef, setEf] = useState({name:"",description:"",start_date:"",due_date:""});
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    if (!id) return;
    Promise.all([api.get("/milestones"), api.get(`/milestones/${id}/issues`)]).then(([mlRes, isRes]) => {
      const found = mlRes.data.find((m:any)=>m.id===id);
      if (found) { setMilestone(found); setEf({name:found.name,description:found.description||"",start_date:found.start_date||"",due_date:found.due_date||""}); }
      setIssues(isRes.data); setLoading(false);
    });
  }, [id]);

  const refresh = async () => {
    const [mlRes, isRes] = await Promise.all([api.get("/milestones"), api.get(`/milestones/${id}/issues`)]);
    const found = mlRes.data.find((m:any)=>m.id===id);
    if (found) { setMilestone(found); setEf({name:found.name,description:found.description||"",start_date:found.start_date||"",due_date:found.due_date||""}); }
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

  if (loading) return (
    <div className="page-enter space-y-3">
      <Skeleton className="h-7 w-24" />
      <div className="panel p-4">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="mt-3 h-3 w-72" />
        <Skeleton className="mt-4 h-2.5 w-full rounded-full" />
      </div>
      <div className="panel p-4"><Skeleton className="h-3 w-24" /><Skeleton className="mt-4 h-3 w-full" /></div>
    </div>
  );

  if (!milestone) return <EmptyState icon={Flag} title={t("milestone.no_milestones")} />;

  const left = daysLeft(milestone.due_date);
  const overdue = left !== null && left < 0;
  const soon = left !== null && left >= 0 && left <= 3;

  return (
    <div className="page-enter space-y-3">
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-[8px] border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600 shadow-sm">{toast}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <Link to={returnTo} className="btn btn-ghost btn-sm"><ArrowLeft size={14}/>{t("common.back")}</Link>
        <span className="mono text-[11px] text-[var(--text-faint)]">#{milestone.id.slice(0, 8)}</span>
        <span className={`chip ${STATUS_CHIP[milestone.status] ?? "chip-gray"}`}>
          {milestone.status === "published" && <Rocket size={11} />}
          {t(`milestone.status.${milestone.status}`,milestone.status)}
        </span>
        {canEdit && (
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={()=>setEdit(true)} className="btn btn-outline btn-sm"><Pencil size={12}/>{t("common.edit")}</button>
            {milestone.status!=="published" && <button onClick={()=>toggleStatus("published")} className="btn btn-outline btn-sm"><Rocket size={12}/>{t("milestone.publish","Publish")}</button>}
            {milestone.status!=="closed" && <button onClick={()=>toggleStatus("closed")} className="btn btn-outline btn-sm"><CheckCircle2 size={12}/>{t("milestone.close")}</button>}
            {milestone.status!=="open" && <button onClick={()=>toggleStatus("open")} className="btn btn-outline btn-sm"><Flag size={12}/>{t("milestone.reopen")}</button>}
          </div>
        )}
      </div>

      <div className="panel overflow-hidden">
        <div className="px-4 py-4">
          {edit ? (
            <div className="space-y-3">
              <label className="field">
                <span className="field-label">{t("milestone.name")}</span>
                <input value={ef.name} onChange={e=>setEf({...ef,name:e.target.value})} className="input h-9 font-semibold"/>
              </label>
              <label className="field">
                <span className="field-label">{t("milestone.description")} <span className="font-normal text-[var(--text-faint)]">(Markdown)</span></span>
                <textarea rows={4} value={ef.description} onChange={e=>setEf({...ef,description:e.target.value})} className="input mono resize-none text-[12px]"/>
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="field"><span className="field-label">{t("milestones.start")}</span><input type="date" value={ef.start_date} onChange={e=>setEf({...ef,start_date:e.target.value})} className="input h-9 w-44"/></label>
                <label className="field"><span className="field-label">{t("common.due_date")}</span><input type="date" value={ef.due_date} onChange={e=>setEf({...ef,due_date:e.target.value})} className="input h-9 w-44"/></label>
              </div>
              <div className="flex gap-2">
                <button onClick={save} className="btn btn-primary btn-sm">{t("common.save")}</button>
                <button onClick={()=>setEdit(false)} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-[19px] font-semibold tracking-[-.01em] text-[var(--text)]">{milestone.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11.5px] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1"><Calendar size={11.5}/>{t("common.created_at")}: {formatDate(milestone.created_at, i18n?.language)}</span>
                {milestone.due_date && (
                  <span className={`inline-flex items-center gap-1 ${overdue?"font-medium text-red-500":soon?"text-amber-500":""}`}>
                    <Clock size={11.5}/>
                    {milestone.due_date.slice(0,10)}
                    <span className="opacity-60">·</span>
                    {overdue?t("milestones.overdue",{n:Math.abs(left!)}):left===0?t("milestone.due_today"):t("milestones.left",{n:left})}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {!edit && milestone.description && (
          <div className="border-t border-[var(--border-light)] px-4 py-3">
            <div className="prose prose-sm max-w-none text-[var(--text-secondary)]"><MarkdownContent>{milestone.description}</MarkdownContent></div>
          </div>
        )}

        <div className="border-t border-[var(--border-light)] px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">{t("milestone.progress")}</span>
            <span className="text-[15px] font-semibold tabular-nums text-[var(--text)]">{milestone.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]">
            <div className={`h-full rounded-full transition-all duration-700 ${milestone.progress>=100?"bg-emerald-500":milestone.progress>=50?"bg-[var(--primary)]":"bg-amber-400"}`}
              style={{width:`${milestone.progress}%`}}/>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3.5 text-[11px] text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={11.5} className="text-emerald-500"/>{milestone.closed_issues} {t("milestones.closed", "closed")}</span>
            <span className="inline-flex items-center gap-1"><AlertCircle size={11.5} className="text-amber-500"/>{milestone.total_issues-milestone.closed_issues} {t("milestones.open", "open")}</span>
            <span className="inline-flex items-center gap-1"><Flag size={11.5} className="text-[var(--primary)]"/>{milestone.total_issues} {t("milestones.total", "total")}</span>
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="panel-head">
          <h2>{t("issues.title")}<span className="ws-count">{issues.length}</span></h2>
        </div>
        {issues.length===0 ? (
          <EmptyState icon={Flag} title={t("issues.no_issues")} compact />
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {issues.map(issue => {
              const isFeature = (issue as any).issue_type === "feature";
              const barColor = issue.status === "closed" || issue.status === "resolved" || issue.status === "cancelled" || issue.status === "rejected" ? "#cbd5e1" : issue.status === "in_progress" || issue.status === "accepted" ? "#f59e0b" : "#2563eb";
              return (
                <Link key={issue.id} to={`/issues/${issue.id}`} className="group flex items-center gap-3 px-4 py-[11px] transition-colors hover:bg-[var(--bg-hover)]">
                  <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: barColor }} />
                  <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[6px] text-[10px] font-bold ${isFeature ? "bg-violet-50 text-violet-500" : "bg-amber-50 text-amber-500"}`}>
                    {isFeature ? "需" : "问"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-[var(--text)] transition-colors group-hover:text-[var(--primary)]">{issue.title}</span>
                      <span className="mono shrink-0 text-[10px] text-[var(--text-faint)]">#{issue.id.slice(0,8)}</span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
                      <span className={`status-${issue.status}`}>{t(`issues.status.${issue.status}`)}</span>
                      <span>·</span>
                      <span className={`priority-${issue.priority} rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium`}>{t(`issues.priority.${issue.priority}`)}</span>
                      <span>·</span>
                      <span>{formatDate(issue.created_at, i18n?.language)}</span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
