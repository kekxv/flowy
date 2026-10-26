import { BarChart3, CheckCircle2, CircleDot, Layers3, ListFilter } from "lucide-react"
import type { IssueListDashboardBucket, IssueListDashboardData } from "./IssueListDashboardData"

const statusColors: Record<string, string> = {
  open: "#f59e0b", in_progress: "#0ea5e9", proposed: "#6366f1", accepted: "#10b981",
  resolved: "#22c55e", closed: "#94a3b8", cancelled: "#ef4444", rejected: "#ec4899",
}
const priorityColors: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#94a3b8", low: "#0ea5e9", trivial: "#cbd5e1",
}
const typeColors: Record<string, string> = { bug: "#8b5cf6", feature: "#14b8a6" }

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时`
  return `${Math.floor(seconds / 86400)}天`
}

function BarGroup({ buckets, colors, label }: { buckets: IssueListDashboardBucket[]; colors: Record<string, string>; label: string }) {
  const max = Math.max(1, ...buckets.map(bucket => bucket.count))
  return <section className="issue-dashboard-chart" aria-label={label}>
    <h3>{label}</h3>
    <div className="issue-dashboard-bars">
      {buckets.map(bucket => <div className="issue-dashboard-bar-row" key={bucket.key}>
        <span className="issue-dashboard-bar-label">{bucket.label}</span>
        <span className="issue-dashboard-bar-track"><i style={{ width: `${Math.max(5, bucket.count / max * 100)}%`, background: colors[bucket.key] || "#64748b" }} /></span>
        <b>{bucket.count}</b>
      </div>)}
    </div>
  </section>
}

function ActivityTrend({ activity }: { activity: Array<{ date: string; count: number }> }) {
  const max = Math.max(1, ...activity.map(item => item.count))
  const points = activity.map((item, index) => {
    const x = activity.length <= 1 ? 50 : index / (activity.length - 1) * 100
    const y = 96 - item.count / max * 76
    return `${x},${y}`
  }).join(" ")
  return <section className="issue-dashboard-trend" aria-label="新增趋势">
    <div className="issue-dashboard-section-heading"><div><span className="issue-dashboard-eyebrow">ACTIVITY</span><h3>新增趋势</h3></div><span>近 30 天</span></div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="近 30 天新增问题趋势">
      <path d="M0 96H100" className="issue-dashboard-axis" />
      <polyline points={points || "0,96 100,96"} className="issue-dashboard-line" />
    </svg>
    <div className="issue-dashboard-trend-labels"><span>{activity[0]?.date.slice(5) || "-"}</span><span>{activity.at(-1)?.date.slice(5) || "-"}</span></div>
  </section>
}

export default function IssueListDashboard({ data }: { data: IssueListDashboardData }) {
  const active = data.statuses.filter(item => ["open", "in_progress", "proposed", "accepted"].includes(item.key)).reduce((sum, item) => sum + item.count, 0)
  const done = data.statuses.filter(item => ["resolved", "closed", "cancelled", "rejected"].includes(item.key)).reduce((sum, item) => sum + item.count, 0)
  return <div className="issue-dashboard" data-testid="issue-list-dashboard">
    <div className="issue-dashboard-intro"><div><span className="issue-dashboard-eyebrow">ISSUE REPORT</span><h2>问题概览</h2><p>{data.scope} · 共收录 {data.shown} 条问题</p></div><BarChart3 size={30} strokeWidth={1.4} /></div>
    <div className="issue-dashboard-kpis">
      <div><CircleDot size={16} /><span>问题总数</span><b>{data.total}</b></div>
      <div><ListFilter size={16} /><span>处理中</span><b>{active}</b></div>
      <div><CheckCircle2 size={16} /><span>已完成</span><b>{done}</b></div>
      <div><Layers3 size={16} /><span>问题类型</span><b>{data.types.length}</b></div>
    </div>
    <div className="issue-dashboard-grid">
      <BarGroup buckets={data.statuses} colors={statusColors} label="状态分布" />
      <BarGroup buckets={data.priorities} colors={priorityColors} label="优先级分布" />
      <BarGroup buckets={data.types} colors={typeColors} label="类型分布" />
    </div>
    <ActivityTrend activity={data.activity} />
    <section className="issue-dashboard-recent" aria-label="问题明细">
      <div className="issue-dashboard-section-heading"><div><span className="issue-dashboard-eyebrow">RECENT ISSUES</span><h3>问题明细</h3></div><span>{data.issues.length} 条</span></div>
      <div className="issue-dashboard-issue-list">{data.issues.map((issue, index) => <article key={`${issue.title}-${index}`}>
        <span className="issue-dashboard-issue-index">{String(index + 1).padStart(2, "0")}</span>
        <div className="issue-dashboard-issue-main"><h4>{issue.title}</h4><p>{issue.issue_type === "feature" ? "需求" : "问题"} · {formatDuration(issue.duration_seconds)}</p></div>
        <span className="issue-dashboard-issue-status" style={{ color: statusColors[issue.status] || "#64748b" }}>{data.statuses.find(item => item.key === issue.status)?.label || issue.status}</span>
      </article>)}</div>
    </section>
  </div>
}
