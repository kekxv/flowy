import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3, AlertCircle, CheckCircle2, Flag, ChevronRight, Timer, Clock, Inbox, UserPlus, X, Bug, Lightbulb, AlertTriangle, TrendingUp } from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { ALL_ROLES } from "../constants";
import { timeAgo } from "../utils/time";
import Loader from "../components/Loader";

interface DashboardData {
  my_issues: Array<{ id: string; title: string; status: string; priority: string; issue_type?: string; roles: string[]; created_at: string }>;
  pending_issues: Array<{ id: string; title: string; status: string; priority: string; issue_type?: string; created_at: string }>;
  active_timers: Array<{ entry_id: string; issue_id: string; issue_title: string; started_at: string; duration_ms: number }>;
  stats: {
    total_issues: number; open_issues: number; closed_issues: number; my_reported: number;
    bug_count: number; feature_count: number; overdue_milestones: number;
    by_status: Record<string, number>; by_priority: Record<string, number>;
    recent_activity: Array<{ date: string; count: number }>; completion_activity?: Array<{ date: string; count: number }>;
  };
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

const STATUS_COLORS: Record<string, string> = {
  open: "#f59e0b", in_progress: "#0ea5e9", proposed: "#6366f1", accepted: "#10b981",
  resolved: "#22c55e", closed: "#6b7280", cancelled: "#ef4444", rejected: "#ec4899",
};
const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#6b7280", low: "#0ea5e9", trivial: "#9ca3af",
};

function DonutChart({ data, size = 160 }: { data: Record<string, number>; size?: number }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return <div className="flex h-40 items-center justify-center text-[12px] text-[var(--text-muted)]">No data</div>;
  const r = (size - 20) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="-rotate-90 shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={14} />
        {entries.map(([key, value]) => {
          const pct = value / total;
          const dash = pct * c;
          const el = (
            <circle key={key} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={STATUS_COLORS[key] || "#9ca3af"} strokeWidth={14}
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}
              strokeLinecap="butt" className="transition-all duration-700" />
          );
          offset += dash;
          return el;
        })}
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
          className="rotate-90 fill-[var(--text)] text-[22px] font-semibold" style={{ transformOrigin: "center" }}>
          {total}
        </text>
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 text-[12px]">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[key] || "#9ca3af" }} />
            <span className="text-[var(--text-secondary)] truncate">{key.replace("_", " ")}</span>
            <span className="ml-auto font-semibold tabular-nums text-[var(--text)]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PriorityBars({ data }: { data: Record<string, number> }) {
  const order = ["critical", "high", "medium", "low", "trivial"];
  const max = Math.max(1, ...Object.values(data));
  const entries = order.filter(k => (data[k] ?? 0) > 0);
  if (entries.length === 0) return <div className="flex h-24 items-center justify-center text-[12px] text-[var(--text-muted)]">No data</div>;
  return (
    <div className="space-y-2">
      {entries.map(k => {
        const v = data[k] ?? 0;
        const pct = (v / max) * 100;
        return (
          <div key={k} className="flex items-center gap-2.5">
            <span className="w-14 text-[11px] font-medium text-[var(--text-muted)] capitalize">{k}</span>
            <div className="flex-1 h-4 rounded-full bg-[var(--bg-muted)] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: PRIORITY_COLORS[k] || "#9ca3af" }} />
            </div>
            <span className="w-6 text-right text-[12px] font-semibold tabular-nums text-[var(--text)]">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ data, width = 200, height = 40 }: { data: Array<{ date: string; count: number }>; width?: number; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(1, ...data.map(d => d.count));
  const step = width / Math.max(1, data.length - 1);
  const points = data.map((d, i) => `${i * step},${height - (d.count / max) * (height - 4) - 2}`).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <div>
      <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#sparkGrad)" />
        <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => d.count > 0 ? (
          <circle key={i} cx={i * step} cy={height - (d.count / max) * (height - 4) - 2} r="2.5"
            fill="white" stroke="var(--primary)" strokeWidth="1.5" />
        ) : null)}
      </svg>
      <div className="flex justify-between text-[9px] text-[var(--text-faint)] mt-1">
        {data.map((d, i) => (i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2))
          ? <span key={i}>{d.date.slice(5)}</span>
          : <span key={i} />)}
      </div>
    </div>
  );
}

function TrendPanel({ title, data, color = "var(--primary)" }: { title: string; data: Array<{ date: string; count: number }>; color?: string }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return <div className="card rounded-2xl p-5"><div className="mb-4 flex items-start justify-between"><div><p className="text-[12px] font-semibold tracking-normal text-[var(--text-secondary)]">{title}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--text)]">{total}</p></div><span className="rounded-full bg-[var(--primary-subtle)] px-2 py-1 text-[10px] font-medium text-[var(--primary)]">近 30 天</span></div><div style={{ color }}><Sparkline data={data} width={320} height={76} /></div></div>;
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
    <div className="mx-auto max-w-7xl space-y-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between px-1 py-2">
        <div><p className="text-[11px] font-medium text-[var(--text-muted)]">项目概览</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[var(--text)]">{t("dashboard.title")}</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">共 {data.stats.total_issues} 个问题，完成率 {closedRate}%</p>
        </div>
        <Link to="/issues/new" className="btn btn-primary btn-sm">
          <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M7.5 3v9M3 7.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          {t("issues.new_issue")}
        </Link>
      </div>

      {/* Stats — 8 cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {[
          { k: "total_issues", icon: BarChart3, color: "text-[var(--primary)]", bg: "bg-[var(--primary-subtle)]" },
          { k: "open_issues", icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50" },
          { k: "closed_issues", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
          { k: "my_reported", icon: Flag, color: "text-sky-600", bg: "bg-sky-50" },
          { k: "bug_count", icon: Bug, color: "text-rose-600", bg: "bg-rose-50" },
          { k: "feature_count", icon: Lightbulb, color: "text-violet-600", bg: "bg-violet-50" },
          { k: "overdue_milestones", icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-50" },
        ].map(s => (
          <div key={s.k} className="card rounded-2xl px-4 py-4 transition-all hover:shadow-md group">
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-[6px] ${s.bg} transition-transform group-hover:scale-110`}>
                <s.icon size={15} className={s.color} strokeWidth={2} />
              </div>
              <span className="text-[11px] font-medium text-[var(--text-muted)]">{t(`dashboard.${s.k}`, s.k)}</span>
            </div>
            <div className="mt-2.5 text-2xl font-bold tabular-nums tracking-tight text-[var(--text)]">{(data.stats as any)[s.k] || 0}</div>
          </div>
        ))}
        {/* Completion rate */}
        <div className="card rounded-2xl px-4 py-4 transition-all hover:shadow-md group">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-emerald-50 transition-transform group-hover:scale-110">
              <TrendingUp size={15} className="text-emerald-600" strokeWidth={2} />
            </div>
            <span className="text-[11px] font-medium text-[var(--text-muted)]">{t("dashboard.completion", "Completion")}</span>
          </div>
          <div className="mt-2.5 text-2xl font-bold tabular-nums tracking-tight text-[var(--text)]">{closedRate}%</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendPanel title={t("dashboard.activity_trend", "新增工作趋势")} data={data.stats.recent_activity || []} />
        <TrendPanel title={t("dashboard.completion_trend", "交付完成趋势")} data={data.stats.completion_activity || []} color="#10b981" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Status donut */}
        <div className="card rounded-[10px] p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">{t("dashboard.by_status", "By Status")}</h3>
          <DonutChart data={data.stats.by_status || {}} />
        </div>

        {/* Priority bars */}
        <div className="card rounded-[10px] p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">{t("dashboard.by_priority", "By Priority")}</h3>
          <PriorityBars data={data.stats.by_priority || {}} />
        </div>

        {/* 7-day activity sparkline */}
        <div className="card rounded-[10px] p-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">{t("dashboard.recent_activity", "Last 7 Days")}</h3>
          <Sparkline data={data.stats.recent_activity || []} />
          <div className="mt-3 flex items-center justify-between text-[12px] text-[var(--text-muted)]">
            <span>{(data.stats.recent_activity || []).reduce((a, d) => a + d.count, 0)} issues created</span>
            <span className="font-semibold text-[var(--primary)] tabular-nums">
              +{(data.stats.recent_activity || []).slice(-1)[0]?.count || 0} today
            </span>
          </div>
        </div>
      </div>

      {/* Two-column: Tasks (left) + Milestones (right) */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: My Tasks + Pending */}
        <div className="space-y-5 min-w-0">
          {/* My Tasks */}
          <div className="card rounded-[10px] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-light)] px-5 py-3">
              <h2 className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--primary-subtle)]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[var(--primary)]"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                </span>
                {t("dashboard.my_tasks")}
                {data.my_issues.length > 0 && <span className="rounded-full bg-[var(--primary-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)] tabular-nums">{data.my_issues.length}</span>}
              </h2>
              <Link to="/issues" className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">{t("issues.all_issues")} →</Link>
            </div>
            {data.my_issues.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-[var(--text-muted)]">{t("dashboard.all_clear", "All clear")}</div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto divide-y divide-[var(--border-light)]">
                {data.my_issues.map(issue => {
                  const isFeature = issue.issue_type === "feature";
                  return (
                  <Link key={issue.id} to={`/issues/${issue.id}`}
                    className="group flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-[var(--bg-muted)]" style={{ minHeight: 48 }}>
                    <div className="flex items-center gap-1.5 pt-0.5 shrink-0">
                      <div className={`w-[22px] h-[22px] shrink-0 rounded-[5px] flex items-center justify-center text-[9px] font-bold ${isFeature ? "bg-violet-50 text-violet-500" : "bg-amber-50 text-amber-500"}`}>
                        {isFeature ? "需" : "问"}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors">{issue.title}</span>
                        <span className={`priority-${issue.priority} rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium shrink-0`}>{t(`issues.priority.${issue.priority}`)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--text-faint)]">
                        <span className="mono">#{issue.id.slice(0, 6)}</span>
                        <span className={`status-${issue.status}`}>{t(`issues.status.${issue.status}`)}</span>
                        <span className="text-[var(--border)]">·</span>
                        <span>{timeAgo(issue.created_at)}</span>
                      </div>
                    </div>
                    <ChevronRight size={13} className="text-[var(--text-faint)] shrink-0 group-hover:text-[var(--text-muted)] group-hover:translate-x-0.5 transition-all self-center" />
                  </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending */}
          <div className="card rounded-[10px] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-light)] px-5 py-3">
              <h2 className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-amber-50">
                  <Inbox size={13} className="text-amber-500" strokeWidth={2} />
                </span>
                {t("dashboard.pending")}
                {data.pending_issues.length > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 tabular-nums">{data.pending_issues.length}</span>}
              </h2>
            </div>
            {data.pending_issues.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[var(--text-muted)]">{t("dashboard.none_pending")}</div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto divide-y divide-[var(--border-light)]">
                {data.pending_issues.map(issue => {
                  const isFeature = issue.issue_type === "feature";
                  return (
                  <div key={issue.id} className="group flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-[var(--bg-muted)]" style={{ minHeight: 48 }}>
                    <div className="flex items-center gap-1.5 pt-0.5 shrink-0">
                      <div className={`w-[22px] h-[22px] shrink-0 rounded-[5px] flex items-center justify-center text-[9px] font-bold ${isFeature ? "bg-violet-50 text-violet-500" : "bg-amber-50 text-amber-500"}`}>
                        {isFeature ? "需" : "问"}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Link to={`/issues/${issue.id}`} className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors">{issue.title}</Link>
                        <span className={`priority-${issue.priority} rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium shrink-0`}>{t(`issues.priority.${issue.priority}`)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--text-faint)]">
                        <span className="mono">#{issue.id.slice(0, 6)}</span>
                        <span className={`status-${issue.status}`}>{t(`issues.status.${issue.status}`)}</span>
                        <span className="text-[var(--border)]">·</span>
                        <span>{timeAgo(issue.created_at)}</span>
                      </div>
                    </div>
                    <button onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); openClaim(issue.id); }}
                      className="shrink-0 rounded p-1.5 text-[var(--text-faint)] hover:bg-[var(--primary-subtle)] hover:text-[var(--primary)] transition-all opacity-0 group-hover:opacity-100 self-center">
                      <UserPlus size={13} />
                    </button>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Timers */}
          {data.active_timers.length > 0 && (
            <div className="card rounded-[10px] overflow-hidden">
              <div className="flex items-center gap-2.5 border-b border-[var(--border-light)] px-5 py-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-red-50">
                  <Timer size={13} className="text-red-500" strokeWidth={2} />
                </span>
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
          <div className="flex items-center justify-between px-1">
            <h2 className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-violet-50">
                <Flag size={13} className="text-violet-500" strokeWidth={2} />
              </span>
              {t("dashboard.milestones")}
            </h2>
            <Link to="/milestones" className="text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">View →</Link>
          </div>
          {data.milestones.length === 0 ? (
            <div className="card flex flex-col items-center justify-center rounded-[10px] py-12 text-[var(--text-muted)]">
              <Flag size={28} className="mb-2 opacity-15" strokeWidth={1.5} />
              <p className="text-[12px]">{t("milestone.no_milestones")}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.milestones.map(m => (
                <Link key={m.id} to={`/milestones/${m.id}`}
                  className="card flex items-center gap-3.5 rounded-[10px] px-4 py-3.5 transition-all hover:border-[#d1d5db] hover:shadow-sm">
                  <div className="relative flex items-center justify-center shrink-0">
                    <RingProgress pct={m.progress} size={44} stroke={3.5} />
                    <span className="absolute text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">{m.progress}%</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-[var(--text)] truncate">{m.name}</span>
                      <span className={`rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${m.status === "published" ? "bg-sky-50 text-sky-700" : m.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-[#f3f4f6] text-[#6b7280]"}`}>
                        {t(`milestone.status.${m.status}`, m.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                      <span className="tabular-nums">{m.closed}/{m.total}</span>
                      {m.due_date && <span className="ml-2 flex items-center gap-0.5"><Clock size={10} />{m.due_date}</span>}
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
