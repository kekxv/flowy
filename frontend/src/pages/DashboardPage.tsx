import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle, Flag, Timer, Inbox, UserPlus, X, BookOpen, Boxes, Layers,
  ChevronRight, CheckCircle2, CircleDot,
} from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { ALL_ROLES, PRIS, STAT } from "../constants";
import { timeAgo } from "../utils/time";
import { ListSkeleton, Skeleton } from "../components/ui/Skeleton";
import type { EChartsOption } from "echarts";

// The chart library is heavy; load it after the dashboard shell has painted.
const DashboardChart = lazy(() => import("../components/DashboardChart"));

interface WorkIssue {
  id: string; title: string; status: string; priority: string;
  issue_type?: string; created_at: string; updated_at?: string; due_date?: string | null;
}
interface DashboardData {
  my_issues: Array<WorkIssue & { roles: string[] }>;
  pending_issues: WorkIssue[];
  active_timers: Array<{ entry_id: string; issue_id: string; issue_title: string; started_at: string; duration_ms: number }>;
  stats: {
    total_issues: number; open_issues: number; closed_issues: number; my_reported: number;
    bug_count: number; feature_count: number; overdue_milestones: number;
    total_milestones: number; software_components: number; software_versions: number; wiki_pages: number;
    by_status: Record<string, number>; by_priority: Record<string, number>;
    recent_activity: Array<{ date: string; count: number }>;
    completion_activity?: Array<{ date: string; count: number }>;
  };
  milestones: Array<{ id: string; name: string; status: string; due_date: string | null; total: number; closed: number; progress: number }>;
}

const STATUS_COLORS: Record<string, string> = {
  open: "#f59e0b", in_progress: "#0ea5e9", proposed: "#6366f1", accepted: "#10b981",
  resolved: "#22c55e", closed: "#9ca3af", cancelled: "#ef4444", rejected: "#ec4899",
};
const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#94a3b8", low: "#0ea5e9", trivial: "#cbd5e1",
};

const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (issue: WorkIssue) =>
  Boolean(issue.due_date) && (issue.due_date as string) < today() &&
  ["open", "in_progress", "proposed", "accepted"].includes(issue.status);
const daysOverdue = (issue: WorkIssue) => {
  const diff = Date.now() - new Date(issue.due_date as string).getTime();
  return Math.max(1, Math.floor(diff / 86400000));
};
const fmtMs = (ms: number) => {
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/** Re-render once a second while timers are running. */
function useTick(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

function trendOption(created: Array<{ date: string; count: number }>, done: Array<{ date: string; count: number }>): EChartsOption {
  return {
    grid: { left: 30, right: 12, top: 16, bottom: 22 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category", boundaryGap: false, data: created.map(d => d.date.slice(5)),
      axisLabel: { fontSize: 10, color: "#a1a1a6" }, axisLine: { show: false }, axisTick: { show: false },
    },
    yAxis: {
      type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#f1f2f6" } },
      axisLabel: { fontSize: 10, color: "#a1a1a6" },
    },
    series: [
      {
        name: "new", type: "line", smooth: true, symbol: "none",
        data: created.map(d => d.count),
        lineStyle: { color: "#2563eb", width: 2 },
        areaStyle: { color: "rgba(37,99,235,.10)" },
      },
      {
        name: "done", type: "line", smooth: true, symbol: "none",
        data: done.map(d => d.count),
        lineStyle: { color: "#10b981", width: 2 },
        areaStyle: { color: "rgba(16,185,129,.08)" },
      },
    ],
  };
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [data, setData] = useState<DashboardData | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimRoles, setClaimRoles] = useState<string[]>([]);
  const [myRoles, setMyRoles] = useState<string[]>([]);

  const load = () => api.get("/dashboard").then(r => setData(r.data));
  useEffect(() => { load(); }, []);
  const now = useTick(Boolean(data?.active_timers.length));

  const groups = useMemo(() => {
    if (!data) return [];
    const mine = data.my_issues;
    const pending = data.pending_issues;
    return [
      { key: "overdue", tone: "overdue", label: t("dashboard.group_overdue", "已逾期"), items: mine.filter(isOverdue) },
      { key: "in_progress", tone: "", label: t("dashboard.group_in_progress", "进行中"), items: mine.filter(i => i.status === "in_progress" && !isOverdue(i)) },
      { key: "open", tone: "", label: t("dashboard.group_open", "待处理"), items: mine.filter(i => i.status !== "in_progress" && !isOverdue(i)) },
      { key: "unclaimed", tone: "", label: t("dashboard.group_unclaimed", "待认领"), items: pending },
    ].filter(g => g.items.length > 0);
  }, [data, t]);

  if (!data) return (
    <div className="space-y-3 page-enter">
      <div><Skeleton className="h-6 w-28" /><Skeleton className="mt-2 h-3 w-52" /></div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="panel px-4 py-3.5"><Skeleton className="h-2.5 w-16" /><Skeleton className="mt-2.5 h-5 w-10" /><Skeleton className="mt-2 h-2.5 w-14" /></div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ListSkeleton rows={7} />
        <div className="space-y-3">
          <div className="panel p-4"><Skeleton className="h-3 w-24" /><Skeleton className="mt-4 h-8 w-full" /></div>
          <div className="panel p-4"><Skeleton className="h-3 w-20" /><Skeleton className="mt-4 h-2.5 w-full" /></div>
        </div>
      </div>
    </div>
  );

  const stats = data.stats;
  const byStatus = stats.by_status || {};
  const byPriority = stats.by_priority || {};
  const created = stats.recent_activity || [];
  const completed = stats.completion_activity || created.map(d => ({ ...d, count: 0 }));
  const last7Created = created.slice(-7).reduce((sum, d) => sum + d.count, 0);
  const last7Done = completed.slice(-7).reduce((sum, d) => sum + d.count, 0);
  const closedRate = stats.total_issues ? Math.round(stats.closed_issues / stats.total_issues * 100) : 0;
  const myOverdue = data.my_issues.filter(isOverdue).length;
  const statusTotal = STAT.reduce((sum, s) => sum + (byStatus[s] || 0), 0);
  const priorityMax = Math.max(1, ...PRIS.map(p => byPriority[p] || 0));
  const todayLabel = new Date().toLocaleDateString(i18n?.language === "zh" ? "zh-CN" : "en-US", { month: "long", day: "numeric", weekday: "short" });

  const openClaim = async (issueId: string) => {
    setClaimId(issueId); setClaimRoles([]);
    try { const r = await api.get("/auth/me/project-roles"); setMyRoles(r.data); } catch { setMyRoles([...ALL_ROLES]); }
  };
  const toggleClaimRole = (r: string) => setClaimRoles(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const claimIssue = async () => {
    if (!user || !claimId || claimRoles.length === 0) return;
    try {
      const r = await api.get(`/issues/${claimId}`);
      const current = (r.data.assignees || []).map((a: any) => ({ user_id: a.id, role: a.role }));
      for (const role of claimRoles) {
        if (!current.some((a: any) => a.user_id === user.id && a.role === role)) current.push({ user_id: user.id, role });
      }
      await api.put(`/issues/${claimId}`, { assignees: current });
      setClaimId(null); setClaimRoles([]);
      load();
    } catch { /* keep the modal open */ }
  };

  const kpis = [
    {
      key: "open", to: "/issues?status=open", icon: CircleDot, label: t("dashboard.open_issues", "待处理"),
      value: byStatus.open || 0, sub: `+${last7Created} ${t("dashboard.this_week_new", "本周新增")}`,
    },
    {
      key: "in_progress", to: "/issues?status=in_progress", icon: Timer, label: t("dashboard.in_progress", "进行中"),
      value: byStatus.in_progress || 0, sub: `${t("dashboard.active_timers", "计时中")} ${data.active_timers.length}`,
    },
    {
      key: "mine", to: "/issues?assignee=me", icon: UserPlus, label: t("dashboard.assigned_to_me", "我负责"),
      value: data.my_issues.length, sub: myOverdue > 0 ? `${t("dashboard.group_overdue", "已逾期")} ${myOverdue}` : t("dashboard.all_clear", "全部完成"),
      alert: myOverdue > 0,
    },
    {
      key: "done", to: "/issues?status=closed,resolved,cancelled,rejected", icon: CheckCircle2, label: t("dashboard.this_week_done", "本周完成"),
      value: last7Done, sub: `${t("dashboard.completion_rate", "完成率")} ${closedRate}%`,
    },
    {
      key: "rate", to: "/issues?status=closed,resolved,cancelled,rejected", icon: CheckCircle2, label: t("dashboard.completion", "完成率"),
      value: closedRate, suffix: "%", sub: `${stats.closed_issues}/${stats.total_issues}`,
    },
  ];

  return (
    <div className="page-enter space-y-4">
      <div className="page-head">
        <div>
          <h1>{t("dashboard.title")}</h1>
          <p className="page-sub">
            {todayLabel} · {t("dashboard.my_work", "我的工作")} {data.my_issues.length + data.pending_issues.length}
            {myOverdue > 0 && <span className="ml-1 font-medium text-red-600">（{t("dashboard.group_overdue", "已逾期")} {myOverdue}）</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/issues" className="btn btn-outline btn-sm">{t("issues.all_issues", "全部问题")}</Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="kpi-strip">
        {kpis.map(k => (
          <Link key={k.key} to={k.to} className={`kpi-cell${k.alert ? " is-alert" : ""}`}>
            <span className="kpi-label">
              <k.icon size={12} strokeWidth={2} className={k.alert ? "text-red-500" : undefined} />
              {k.label}
            </span>
            <span className="kpi-value">
              {k.value}
              {k.suffix && <small>{k.suffix}</small>}
            </span>
            <span className="kpi-sub">{k.sub}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left: my work + trend */}
        <div className="min-w-0 space-y-4">
          <section className="panel">
            <div className="panel-head">
              <h2>{t("dashboard.my_work", "我的工作")}</h2>
              <span className="panel-count">{data.my_issues.length + data.pending_issues.length}</span>
              <Link to="/issues" className="panel-action">{t("dashboard.all_work", "全部")} →</Link>
            </div>
            {groups.length === 0 ? (
              <p className="py-10 text-center text-[12px] text-[var(--text-muted)]">{t("dashboard.empty_work", "当前没有待办")}</p>
            ) : (
              <div>
                {groups.map(group => (
                  <div key={group.key}>
                    <div className={`taskgroup${group.tone === "overdue" ? " is-overdue" : ""}`}>
                      {group.tone === "overdue"
                        ? <AlertTriangle size={12} />
                        : group.key === "unclaimed" ? <Inbox size={12} /> : <CircleDot size={12} />}
                      <span>{group.label}</span>
                      <span className="tabular-nums">{group.items.length}</span>
                      {group.key === "unclaimed" && (
                        <span className="taskgroup-note">{t("dashboard.unclaimed_hint", "自动分配未命中")}</span>
                      )}
                    </div>
                    {group.items.map(issue => {
                      const isFeature = issue.issue_type === "feature";
                      const meta = (
                        <>
                          <span className="mono text-[10.5px] text-[var(--text-faint)]">#{issue.id.slice(0, 8)}</span>
                          {isOverdue(issue) && (
                            <span className="font-medium text-red-600">
                              {t("dashboard.overdue_days", "逾期 {{days}} 天", { days: daysOverdue(issue) })}
                            </span>
                          )}
                          <span className="text-[var(--border)]">·</span>
                          <span className="truncate">{timeAgo(issue.updated_at || issue.created_at, i18n?.language)}</span>
                        </>
                      );
                      return (
                        <div key={issue.id} className="taskrow group">
                          <span className={`wtype ${isFeature ? "is-feature" : "is-bug"}`}>{isFeature ? "需" : "问"}</span>
                          <span className="min-w-0">
                            <Link to={`/issues/${issue.id}`}
                              className="block truncate text-[13px] font-medium text-[var(--text-secondary)] transition-colors group-hover:text-[var(--primary)]">
                              {issue.title}
                            </Link>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-faint)]">{meta}</span>
                          </span>
                          <span className={`status-${issue.status} hidden shrink-0 sm:inline-flex`}>{t(`issues.status.${issue.status}`)}</span>
                          <span className={`task-pr priority-${issue.priority} shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10.5px] font-medium`}>
                            {t(`issues.priority.${issue.priority}`)}
                          </span>
                          {group.key === "unclaimed" ? (
                            <button onClick={() => openClaim(issue.id)}
                              className="shrink-0 rounded-[6px] border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]">
                              {t("issues.claim", "认领")}
                            </button>
                          ) : (
                            <span className="task-av shrink-0 items-center gap-1 text-[10px] text-[var(--text-faint)]">
                              <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{t("dashboard.activity_trend", "工作趋势")}</h2>
              <span className="panel-count">30</span>
              <span className="panel-action flex items-center gap-3">
                <span className="flex items-center gap-1"><i className="inline-block h-[2px] w-3 rounded bg-[#2563eb]" />{t("dashboard.trend_new", "新增")}</span>
                <span className="flex items-center gap-1"><i className="inline-block h-[2px] w-3 rounded bg-[#10b981]" />{t("dashboard.trend_done", "完成")}</span>
              </span>
            </div>
            <div className="px-2 pb-2 pt-1">
              <Suspense fallback={<Skeleton className="h-[180px] w-full" />}>
                <DashboardChart option={trendOption(created, completed)} height={180} />
              </Suspense>
            </div>
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <section className="panel">
            <div className="panel-head">
              <h2>{t("dashboard.active_timers", "计时中")}</h2>
              <span className="panel-count">{data.active_timers.length}</span>
            </div>
            {data.active_timers.length === 0 ? (
              <p className="px-4 py-5 text-[12px] text-[var(--text-muted)]">{t("dashboard.no_timers", "没有进行中的计时")}</p>
            ) : (
              <div>
                {data.active_timers.map(timer => (
                  <Link key={timer.entry_id} to={`/issues/${timer.issue_id}`}
                    className="flex items-center gap-2 border-b border-[var(--border-light)] px-3 py-2.5 last:border-0 hover:bg-[var(--bg-muted)]">
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-[var(--text-secondary)]">{timer.issue_title}</span>
                      <span className="mono block text-[10px] text-[var(--text-faint)]">#{timer.issue_id.slice(0, 8)}</span>
                    </span>
                    <span className="mono shrink-0 text-[12px] font-semibold tabular-nums text-red-600">
                      {fmtMs(timer.duration_ms + Math.max(0, now - new Date(timer.started_at).getTime()))}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{t("dashboard.milestones")}</h2>
              <span className="panel-count">{data.milestones.length}</span>
              <Link to="/milestones" className="panel-action">{t("common.all", "全部")} →</Link>
            </div>
            {data.milestones.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-[var(--text-muted)]">
                <Flag size={22} className="mb-1.5 opacity-20" strokeWidth={1.5} />
                <p className="text-[12px]">{t("milestone.no_milestones")}</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-light)]">
                {data.milestones.map(m => {
                  const overdue = Boolean(m.due_date) && (m.due_date as string) < today() && m.status !== "closed";
                  return (
                    <Link key={m.id} to={`/milestones/${m.id}`} className="block px-3 py-2.5 transition-colors hover:bg-[var(--bg-muted)]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-[var(--text-secondary)]">{m.name}</span>
                        <span className={`ml-auto shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium ${
                          m.status === "published" ? "bg-sky-50 text-sky-700"
                          : m.status === "open" ? "bg-emerald-50 text-emerald-700"
                          : "bg-[#f3f4f6] text-[#6b7280]"
                        }`}>{t(`milestone.status.${m.status}`, m.status)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                          <div className="h-full rounded-full" style={{ width: `${m.progress}%`, backgroundColor: overdue ? "#ef4444" : m.progress === 100 ? "#10b981" : "#2563eb" }} />
                        </div>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--text-faint)]">{m.closed}/{m.total}</span>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--text-muted)]">{m.progress}%</span>
                      </div>
                      {m.due_date && (
                        <p className={`mt-1 text-[10.5px] ${overdue ? "font-medium text-red-600" : "text-[var(--text-faint)]"}`}>
                          {overdue && <AlertTriangle size={9} className="mr-1 inline" />}
                          {t("dashboard.due_short", "截止")} {m.due_date}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>{t("dashboard.by_status", "状态分布")}</h2></div>
            <div className="px-3.5 py-3">
              <div className="dist-bar">
                {STAT.map(s => {
                  const value = byStatus[s] || 0;
                  if (!value || !statusTotal) return null;
                  return <i key={s} style={{ width: `${(value / statusTotal) * 100}%`, backgroundColor: STATUS_COLORS[s] }} title={`${t(`issues.status.${s}`)} ${value}`} />;
                })}
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
                {STAT.filter(s => (byStatus[s] || 0) > 0).map(s => (
                  <div key={s} className="dist-row">
                    <i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[s] }} />
                    <span className="truncate">{t(`issues.status.${s}`)}</span>
                    <span className="dist-num">{byStatus[s]}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-[var(--border-light)] pt-2.5">
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{t("dashboard.by_priority", "优先级")}</p>
                <div className="space-y-1.5">
                  {PRIS.map(p => {
                    const value = byPriority[p] || 0;
                    if (!value) return null;
                    return (
                      <div key={p} className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-[11px] text-[var(--text-muted)]">{t(`issues.priority.${p}`)}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-muted)]">
                          <span className="block h-full rounded-full" style={{ width: `${(value / priorityMax) * 100}%`, backgroundColor: PRIORITY_COLORS[p] }} />
                        </span>
                        <span className="w-4 shrink-0 text-right text-[10.5px] tabular-nums text-[var(--text-secondary)]">{value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>{t("dashboard.content", "内容")}</h2></div>
            <div className="grid grid-cols-2 gap-px bg-[var(--border-light)]">
              {([
                { key: "total_milestones", to: "/milestones", icon: Flag },
                { key: "wiki_pages", to: "/wiki", icon: BookOpen },
                { key: "software_components", to: "/software", icon: Boxes },
                { key: "software_versions", to: "/software", icon: Layers },
              ] as const).map(item => (
                <Link key={item.key} to={item.to} className="bg-white px-3 py-2.5 transition-colors hover:bg-[var(--bg-muted)]">
                  <span className="flex items-center gap-1 text-[10.5px] text-[var(--text-muted)]">
                    <item.icon size={11} />{t(`dashboard.${item.key}`)}
                  </span>
                  <span className="mt-0.5 block text-[17px] font-semibold tabular-nums leading-tight text-[var(--text)]">
                    {data.stats[item.key] ?? 0}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      {claimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25" onClick={() => { setClaimId(null); setClaimRoles([]); }}>
          <div className="card w-72 rounded-[12px] p-4 animate-[scaleIn_.15s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">{t("roles.title")}</h3>
              <button onClick={() => { setClaimId(null); setClaimRoles([]); }} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={14} /></button>
            </div>
            <div className="mb-3 space-y-0.5">
              {myRoles.map(r => (
                <label key={r}
                  className={`flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] transition-colors ${
                    claimRoles.includes(r) ? "bg-[var(--primary-subtle)] font-medium text-[var(--primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
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
