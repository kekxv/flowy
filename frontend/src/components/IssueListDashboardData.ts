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

export function parseIssueListDashboard(content: string): { dashboard: IssueListDashboardData | null; markdown: string } {
  const marker = content.match(/^<!-- flowy-dashboard:(.*?) -->\r?\n?(?:\r?\n)?/)
  if (!marker) return { dashboard: null, markdown: content }
  try {
    const dashboard = JSON.parse(marker[1] || "") as IssueListDashboardData
    if (dashboard.kind !== "issue-list" || !Array.isArray(dashboard.issues)) {
      return { dashboard: null, markdown: content }
    }
    return { dashboard, markdown: content.slice(marker[0].length) }
  } catch {
    return { dashboard: null, markdown: content }
  }
}
