export interface IssueListDashboardItem {
  title: string
  status: string
  priority: string
  issue_type: string
  created_at: string
  updated_at?: string
  duration_seconds: number
}

export interface IssueListDashboardBucket {
  key: string
  label: string
  count: number
}

export interface IssueListDashboardData {
  kind: "issue-list"
  scope: string
  total: number
  shown: number
  statuses: IssueListDashboardBucket[]
  priorities: IssueListDashboardBucket[]
  types: IssueListDashboardBucket[]
  activity: Array<{ date: string; count: number }>
  issues: IssueListDashboardItem[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isBucket(value: unknown): boolean {
  return isRecord(value) && typeof value.key === 'string' && typeof value.label === 'string' && isCount(value.count)
}

function isDashboard(value: unknown): value is IssueListDashboardData {
  return isRecord(value) && value.kind === 'issue-list' && typeof value.scope === 'string'
    && isCount(value.total) && isCount(value.shown)
    && [value.statuses, value.priorities, value.types].every(buckets => Array.isArray(buckets) && buckets.every(isBucket))
    && Array.isArray(value.activity) && value.activity.every(item => isRecord(item) && typeof item.date === 'string' && isCount(item.count))
    && Array.isArray(value.issues) && value.issues.every(item => isRecord(item)
      && ['title', 'status', 'priority', 'issue_type', 'created_at'].every(key => typeof item[key] === 'string')
      && (item.updated_at === undefined || typeof item.updated_at === 'string') && isCount(item.duration_seconds))
}

export function parseIssueListDashboard(content: string): { dashboard: IssueListDashboardData | null; markdown: string } {
  const marker = content.match(/^<!-- flowy-dashboard:(.*?) -->\r?\n?(?:\r?\n)?/)
  if (!marker) return { dashboard: null, markdown: content }
  try {
    const dashboard: unknown = JSON.parse(marker[1] || "")
    if (!isDashboard(dashboard)) {
      return { dashboard: null, markdown: content }
    }
    return { dashboard, markdown: content.slice(marker[0].length) }
  } catch {
    return { dashboard: null, markdown: content }
  }
}
