import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3, AlertCircle, CheckCircle2, Flag, Layers, ChevronRight, TrendingUp, Timer, Clock, Inbox, UserPlus, X } from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";

const ALL_ROLES = ["project_lead","backend_dev","frontend_dev","tester","ui_designer","devops","clerk","member"];

interface DashboardData {
  my_issues: Array<{ id: string; title: string; status: string; priority: string; issue_type?: string; roles: string[]; created_at: string }>;
  pending_issues: Array<{ id: string; title: string; status: string; priority: string; issue_type?: string; created_at: string }>;
  active_timers: Array<{ entry_id: string; issue_id: string; issue_title: string; started_at: string; duration_ms: number }>;
  stats: { total_issues: number; open_issues: number; closed_issues: number; my_reported: number };
  milestones: Array<{ id: string; name: string; status: string; due_date: string | null; total: number; closed: number; progress: number }>;
}

const timeAgo = (iso: string) => { const d=Date.now()-new Date(iso).getTime(); const m=Math.floor(d/60000); if(m<1)return"now";if(m<60)return`${m}m`;const h=Math.floor(m/60);if(h<24)return`${h}h`;return`${Math.floor(h/24)}d`; };
const fmtMs = (ms: number) => { const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000); return h>0?`${h}h ${m}m`:`${m}m`; };

export default function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [data, setData] = useState<DashboardData | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimRoles, setClaimRoles] = useState<string[]>([]);
  const [myRoles, setMyRoles] = useState<string[]>([]);

  useEffect(() => { api.get("/dashboard").then(r => setData(r.data)); }, []);

  if (!data) return (
    <div className="flex justify-center pt-24">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--primary)] border-t-transparent" />
    </div>
  );

  const openClaim = async (issueId: string) => {
    setClaimId(issueId); setClaimRoles([]);
    // Fetch user's project roles
    try { const r = await api.get("/auth/me/project-roles"); setMyRoles(r.data); } catch { setMyRoles(ALL_ROLES); }
  };
  const toggleClaimRole = (r: string) => setClaimRoles(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const claimIssue = async () => {
    if (!user || !claimId || claimRoles.length === 0) return;
    try {
      const r = await api.get(`/issues/${claimId}`);
      const issue = r.data;
      const current = (issue.assignees || []).map((a: any) => ({ user_id: a.id, role: a.role }));
      for (const role of claimRoles) {
        if (!current.some((a: any) => a.user_id === user.id && a.role === role)) {
          current.push({ user_id: user.id, role });
        }
      }
      await api.put(`/issues/${claimId}`, { assignees: current });
      setClaimId(null); setClaimRoles([]);
      api.get("/dashboard").then(r => setData(r.data));
    } catch {}
  };
  const closedRate = data.stats.total_issues ? Math.round(data.stats.closed_issues/data.stats.total_issues*100) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5 page-enter">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{data.stats.total_issues} issues · {data.stats.open_issues} active · {closedRate}% closed</p>
        </div>
        <div className="flex items-center gap-2">
          {closedRate > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <TrendingUp size={14} />{closedRate}% completed
            </div>
          )}
          <Link to="/issues/new" className="btn btn-primary"><PlusIcon />{t("issues.new_issue")}</Link>
        </div>
      </div>

      {/* Stats - compact row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k:"total_issues", path:"/issues", icon:BarChart3, c:"text-[var(--primary)] bg-[var(--primary)]/6" },
          { k:"open_issues", path:"/issues?status=open,in_progress", icon:AlertCircle, c:"text-amber-600 bg-amber-50" },
          { k:"closed_issues", path:"/issues?status=closed,resolved", icon:CheckCircle2, c:"text-emerald-600 bg-emerald-50" },
          { k:"my_reported", path:"/issues?reporter=me", icon:Flag, c:"text-violet-600 bg-violet-50" },
        ].map(s => (
          <Link key={s.k} to={s.path} className="group flex items-center gap-3 card rounded-xl px-4 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.c}`}><s.icon size={18} /></div>
            <div>
              <div className="text-lg font-bold tracking-tight">{(data.stats as any)[s.k]||0}</div>
              <div className="text-[10px] text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors">{t(`dashboard.${s.k}`)}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Main content: Issues (left, scrollable) + Milestones (right, sticky) */}
      <div className="grid gap-5 lg:grid-cols-5">
        {/* Left: My Tasks + Pending — 3 cols */}
        <div className="lg:col-span-3 space-y-4">
          {/* My Tasks — max 6 items, scrollable */}
          <div className="card rounded-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-light)] px-4 py-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <Layers size={14} className="text-[var(--primary)]" />{t("dashboard.my_tasks")}
                {data.my_issues.length>0 && <span className="rounded-full bg-[var(--primary)]/8 px-1.5 py-0.5 text-[10px] font-bold text-[var(--primary)]">{data.my_issues.length}</span>}
              </h2>
              <Link to="/issues" className="text-[10px] font-medium text-[var(--primary)] hover:underline">{t("issues.all_issues")} &rarr;</Link>
            </div>
            {data.my_issues.length===0 ? (
              <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">{t("dashboard.all_clear","All clear")}</div>
            ) : (
              <div className="max-h-[280px] overflow-y-auto divide-y divide-[var(--border-light)]">
                {data.my_issues.map((issue, idx) => (
                  <Link key={issue.id} to={`/issues/${issue.id}`} className={`flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-hover)] ${idx%2?"bg-[var(--bg)]/40":""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${(issue.issue_type==="feature"?"bg-violet-50 text-violet-600":"bg-amber-50 text-amber-600")}`}>{t(`issues.type.${issue.issue_type||"bug"}`)}</span>
                        <span className="truncate text-[12px] font-medium">{issue.title}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--text-muted)]">
                        <span className="font-mono text-[var(--text-muted)]/60">#{issue.id.slice(0,8)}</span>
                        <span>{timeAgo(issue.created_at)}</span>
                        <span className={`status-${issue.status}`}>{t(`issues.status.${issue.status}`)}</span>
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-1">
                      <span className={`priority-${issue.priority} rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium`}>{t(`issues.priority.${issue.priority}`)}</span>
                      {issue.roles?.slice(0,2).map((r:string)=><span key={r} className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>)}
                    </div>
                    <ChevronRight size={12} className="hidden sm:block shrink-0 text-[var(--text-muted)]/30" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Pending — max 4 items, scrollable */}
          <div className="card rounded-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-light)] px-4 py-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <Inbox size={14} className="text-amber-500" />{t("dashboard.pending")}
                {data.pending_issues.length>0 && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">{data.pending_issues.length}</span>}
              </h2>
            </div>
            {data.pending_issues.length===0 ? (
              <div className="py-6 text-center text-[12px] text-[var(--text-muted)]">{t("dashboard.none_pending")}</div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto divide-y divide-[var(--border-light)]">
                {data.pending_issues.map(issue => (
                  <div key={issue.id} className="flex items-center justify-between gap-2 px-4 py-2 transition-colors hover:bg-[var(--bg-hover)] group">
                    <Link to={`/issues/${issue.id}`} className="min-w-0 flex-1 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${(issue.issue_type==="feature"?"bg-violet-50 text-violet-600":"bg-amber-50 text-amber-600")}`}>{t(`issues.type.${issue.issue_type||"bug"}`)}</span>
                          <span className="truncate text-[12px] font-medium">{issue.title}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-x-2 text-[10px] text-[var(--text-muted)]">
                          <span className="font-mono">#{issue.id.slice(0,8)}</span>
                          <span>{timeAgo(issue.created_at)}</span>
                          <span className={`status-${issue.status}`}>{t(`issues.status.${issue.status}`)}</span>
                        </div>
                      </div>
                      <span className={`priority-${issue.priority} rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium shrink-0`}>{t(`issues.priority.${issue.priority}`)}</span>
                    </Link>
                    <button onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); openClaim(issue.id); }}
                      className="shrink-0 rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--primary-light)] hover:text-[var(--primary)] transition-all opacity-0 group-hover:opacity-100">
                      <UserPlus size={13}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Timers */}
          {data.active_timers.length > 0 && (
            <div className="card rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--border-light)] px-4 py-3">
                <Timer size={14} className="text-red-500" /><h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("dashboard.active_timers")}</h2>
              </div>
              <div className="divide-y divide-[var(--border-light)]">
                {data.active_timers.map(timer => (
                  <div key={timer.entry_id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2"><span className="absolute h-2 w-2 animate-ping rounded-full bg-red-400 opacity-75"/><span className="relative h-2 w-2 rounded-full bg-red-500"/></span>
                      <Link to={`/issues/${timer.issue_id}`} className="text-[12px] font-medium hover:text-[var(--primary)]">{timer.issue_title}</Link>
                    </div>
                    <span className="rounded-full bg-red-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-red-600 tabular-nums">{fmtMs(timer.duration_ms)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Milestones — sticky, 2 cols */}
        <div className="lg:col-span-2">
          <div className="card rounded-xl overflow-hidden lg:sticky lg:top-8">
            <div className="flex items-center justify-between border-b border-[var(--border-light)] px-4 py-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <Flag size={14} className="text-violet-500" />{t("dashboard.milestones")}
              </h2>
              <Link to="/milestones" className="text-[10px] font-medium text-[var(--primary)] hover:underline">{t("milestone.title")} &rarr;</Link>
            </div>
            {data.milestones.length===0 ? (
              <div className="py-10 text-center text-[12px] text-[var(--text-muted)]">
                <Flag size={28} className="mx-auto mb-2 text-[var(--border)]"/>{t("milestone.no_milestones")}
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-light)]">
                {data.milestones.map(m => (
                  <Link key={m.id} to={`/milestones/${m.id}`} className="block px-4 py-3.5 transition-colors hover:bg-[var(--bg-hover)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${m.status==="published"?"bg-blue-50 text-blue-700":"bg-emerald-50 text-emerald-700"}`}>{t(`milestone.status.${m.status}`,m.status)}</span>
                        <span className="text-[12px] font-medium hover:text-[var(--primary)] transition-colors">{m.name}</span>
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-violet-600">{m.progress}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-500 transition-all duration-700 ease-out" style={{width:`${m.progress}%`}}/>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                      <span>{m.closed}/{m.total} {t("dashboard.done","done")}</span>
                      {m.due_date && <span><Clock size={9} className="mr-0.5 inline"/>{m.due_date}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Claim role modal */}
      {claimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => { setClaimId(null); setClaimRoles([]); }}>
          <div className="card w-72 rounded-xl p-5 shadow-[var(--shadow-lg)] animate-[fadeInUp_.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("roles.title")}</h3>
              <button onClick={() => { setClaimId(null); setClaimRoles([]); }} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={16}/></button>
            </div>
            <div className="space-y-0.5 mb-4">
              {myRoles.map(r => (
                <label key={r}
                  className={`flex items-center gap-2 rounded-md px-2 py-2 text-[12px] cursor-pointer transition-colors ${
                    claimRoles.includes(r) ? "bg-[var(--primary-light)] text-[var(--primary)] font-medium" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  }`}>
                  <input type="checkbox" checked={claimRoles.includes(r)}
                    onChange={() => toggleClaimRole(r)}
                    className="rounded accent-[var(--primary)]"/>
                  <span className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>
                </label>
              ))}
            </div>
            <button onClick={claimIssue} disabled={claimRoles.length===0}
              className="btn btn-primary btn-sm w-full">{t("common.confirm")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlusIcon() { return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 3v9M3 7.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
