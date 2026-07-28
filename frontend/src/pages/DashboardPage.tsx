import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3, AlertCircle, CheckCircle2, Flag, ChevronRight, Timer, Clock, Inbox, UserPlus, X } from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { ALL_ROLES } from "../constants";
import { timeAgo } from "../utils/time";
import Loader from "../components/Loader";

interface DashboardData {
  my_issues: Array<{ id: string; title: string; status: string; priority: string; issue_type?: string; roles: string[]; created_at: string }>;
  pending_issues: Array<{ id: string; title: string; status: string; priority: string; issue_type?: string; created_at: string }>;
  active_timers: Array<{ entry_id: string; issue_id: string; issue_title: string; started_at: string; duration_ms: number }>;
  stats: { total_issues: number; open_issues: number; closed_issues: number; my_reported: number };
  milestones: Array<{ id: string; name: string; status: string; due_date: string | null; total: number; closed: number; progress: number }>;
}

const fmtMs = (ms: number) => { const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return h > 0 ? `${h}h ${m}m` : `${m}m`; };

function RingProgress({ pct, size = 44, stroke = 4 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
    </svg>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [data, setData] = useState<DashboardData | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimRoles, setClaimRoles] = useState<string[]>([]);
  const [myRoles, setMyRoles] = useState<string[]>([]);

  useEffect(() => { api.get("/dashboard").then(r => setData(r.data)); }, []);

  if (!data) return <Loader />;

  const openClaim = async (issueId: string) => {
    setClaimId(issueId); setClaimRoles([]);
    try { const r = await api.get("/auth/me/project-roles"); setMyRoles(r.data); } catch { setMyRoles([...ALL_ROLES]); }
  };
  const toggleClaimRole = (r: string) => setClaimRoles(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const claimIssue = async () => {
    if (!user || !claimId || claimRoles.length === 0) return;
    try {
      const r = await api.get(`/issues/${claimId}`);
      const issue = r.data;
      const current = (issue.assignees || []).map((a: any) => ({ user_id: a.id, role: a.role }));
      for (const role of claimRoles) {
        if (!current.some((a: any) => a.user_id === user.id && a.role === role)) current.push({ user_id: user.id, role });
      }
      await api.put(`/issues/${claimId}`, { assignees: current });
      setClaimId(null); setClaimRoles([]);
      api.get("/dashboard").then(r => setData(r.data));
    } catch {}
  };
  const closedRate = data.stats.total_issues ? Math.round(data.stats.closed_issues / data.stats.total_issues * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">{t("dashboard.title")}</h1>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{data.stats.total_issues} issues · {closedRate}% completed</p>
        </div>
        <Link to="/issues/new" className="btn btn-primary btn-sm">
          <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M7.5 3v9M3 7.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          {t("issues.new_issue")}
        </Link>
      </div>

      {/* Stats — compact inline */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: "total_issues", icon: BarChart3, color: "text-[var(--primary)]" },
          { k: "open_issues", icon: AlertCircle, color: "text-amber-600" },
          { k: "closed_issues", icon: CheckCircle2, color: "text-emerald-600" },
          { k: "my_reported", icon: Flag, color: "text-sky-600" },
        ].map(s => (
          <div key={s.k} className="card rounded-[8px] px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <s.icon size={14} className={`${s.color} opacity-70`} strokeWidth={1.8} />
              <span className="text-[11px] font-medium text-[var(--text-muted)]">{t(`dashboard.${s.k}`)}</span>
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{(data.stats as any)[s.k] || 0}</div>
          </div>
        ))}
      </div>

      {/* Two-column: Tasks (left) + Milestones (right) */}
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* Left: My Tasks + Pending */}
        <div className="space-y-4 min-w-0">
          {/* My Tasks */}
          <div className="card rounded-[8px] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-light)] px-3.5 py-2.5">
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t("dashboard.my_tasks")}
                {data.my_issues.length > 0 && <span className="rounded-full bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] tabular-nums">{data.my_issues.length}</span>}
              </h2>
              <Link to="/issues" className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">{t("issues.all_issues")} →</Link>
            </div>
            {data.my_issues.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">{t("dashboard.all_clear", "All clear")}</div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto divide-y divide-[var(--border-light)]">
                {data.my_issues.map(issue => (
                  <Link key={issue.id} to={`/issues/${issue.id}`}
                    className="flex items-center gap-2.5 px-3.5 py-2 transition-colors hover:bg-[#f9fafb]" style={{ minHeight: 44 }}>
                    <span className={`status-${issue.status} text-[11px]`}>{t(`issues.status.${issue.status}`)}</span>
                    <span className="mono text-[11px] text-[var(--text-faint)]">#{issue.id.slice(0, 6)}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-secondary)]">{issue.title}</span>
                    <span className={`priority-${issue.priority} rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium hidden sm:inline`}>{t(`issues.priority.${issue.priority}`)}</span>
                    <span className="text-[11px] text-[var(--text-faint)] hidden sm:block">{timeAgo(issue.created_at)}</span>
                    <ChevronRight size={13} className="text-[var(--text-faint)] hidden sm:block" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Pending */}
          <div className="card rounded-[8px] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-light)] px-3.5 py-2.5">
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <Inbox size={13} strokeWidth={1.8} className="text-amber-500" />{t("dashboard.pending")}
                {data.pending_issues.length > 0 && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 tabular-nums">{data.pending_issues.length}</span>}
              </h2>
            </div>
            {data.pending_issues.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[var(--text-muted)]">{t("dashboard.none_pending")}</div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto divide-y divide-[var(--border-light)]">
                {data.pending_issues.map(issue => (
                  <div key={issue.id} className="flex items-center gap-2.5 px-3.5 py-2 transition-colors hover:bg-[#f9fafb] group" style={{ minHeight: 44 }}>
                    <span className={`status-${issue.status} text-[11px]`}>{t(`issues.status.${issue.status}`)}</span>
                    <Link to={`/issues/${issue.id}`} className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="mono text-[11px] text-[var(--text-faint)]">#{issue.id.slice(0, 6)}</span>
                      <span className="truncate text-[13px] font-medium text-[var(--text-secondary)]">{issue.title}</span>
                    </Link>
                    <span className={`priority-${issue.priority} rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium shrink-0`}>{t(`issues.priority.${issue.priority}`)}</span>
                    <button onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); openClaim(issue.id); }}
                      className="shrink-0 rounded p-1 text-[var(--text-faint)] hover:bg-[var(--primary-subtle)] hover:text-[var(--primary)] transition-all opacity-0 group-hover:opacity-100">
                      <UserPlus size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Timers */}
          {data.active_timers.length > 0 && (
            <div className="card rounded-[8px] overflow-hidden">
              <div className="flex items-center gap-1.5 border-b border-[var(--border-light)] px-3.5 py-2.5">
                <Timer size={13} strokeWidth={1.8} className="text-red-500" />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("dashboard.active_timers")}</h2>
              </div>
              <div className="divide-y divide-[var(--border-light)]">
                {data.active_timers.map(timer => (
                  <div key={timer.entry_id} className="flex items-center justify-between px-3.5 py-2.5" style={{ minHeight: 40 }}>
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2"><span className="absolute h-2 w-2 animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative h-2 w-2 rounded-full bg-red-500" /></span>
                      <Link to={`/issues/${timer.issue_id}`} className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--primary)]">{timer.issue_title}</Link>
                    </div>
                    <span className="mono rounded-[4px] bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 tabular-nums">{fmtMs(timer.duration_ms)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Milestones */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("dashboard.milestones")}</h2>
            <Link to="/milestones" className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">View →</Link>
          </div>
          {data.milestones.length === 0 ? (
            <div className="card flex flex-col items-center justify-center rounded-[8px] py-10 text-[var(--text-muted)]">
              <Flag size={24} className="mb-2 opacity-20" strokeWidth={1.5} />
              <p className="text-[12px]">{t("milestone.no_milestones")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.milestones.map(m => (
                <Link key={m.id} to={`/milestones/${m.id}`}
                  className="card flex items-center gap-3 rounded-[8px] px-3.5 py-3 transition-colors hover:border-[#d1d5db]">
                  <div className="relative flex items-center justify-center shrink-0">
                    <RingProgress pct={m.progress} size={40} stroke={3.5} />
                    <span className="absolute text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">{m.progress}%</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-[var(--text)] truncate">{m.name}</span>
                      <span className={`rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${m.status === "published" ? "bg-sky-50 text-sky-700" : m.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-[#f3f4f6] text-[#6b7280]"}`}>
                        {t(`milestone.status.${m.status}`, m.status)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      <span className="tabular-nums">{m.closed}/{m.total} done</span>
                      {m.due_date && <span className="flex items-center gap-0.5"><Clock size={10} />{m.due_date}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Claim role modal */}
      {claimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => { setClaimId(null); setClaimRoles([]); }}>
          <div className="card w-72 rounded-[8px] p-4 animate-[scaleIn_.15s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">{t("roles.title")}</h3>
              <button onClick={() => { setClaimId(null); setClaimRoles([]); }} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={14} /></button>
            </div>
            <div className="space-y-0.5 mb-3">
              {myRoles.map(r => (
                <label key={r}
                  className={`flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] cursor-pointer transition-colors ${
                    claimRoles.includes(r) ? "bg-[var(--primary-subtle)] text-[var(--primary)] font-medium" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  }`}>
                  <input type="checkbox" checked={claimRoles.includes(r)} onChange={() => toggleClaimRole(r)} className="rounded accent-[var(--primary)]" />
                  <span className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>
                </label>
              ))}
            </div>
            <button onClick={claimIssue} disabled={claimRoles.length === 0} className="btn btn-primary btn-sm w-full">{t("common.confirm")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
