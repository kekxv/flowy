import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import IssueListDashboard from "./IssueListDashboard"
import { parseIssueListDashboard, type IssueListDashboardData } from "./IssueListDashboardData"

const data: IssueListDashboardData = {
  kind: "issue-list", scope: "全部", total: 2, shown: 2,
  statuses: [{ key: "open", label: "待处理", count: 1 }, { key: "resolved", label: "已解决", count: 1 }],
  priorities: [{ key: "high", label: "高", count: 1 }, { key: "medium", label: "中", count: 1 }],
  types: [{ key: "bug", label: "问题", count: 2 }],
  activity: [{ date: "2026-10-25", count: 2 }],
  issues: [{ title: "登录问题", status: "open", priority: "high", issue_type: "bug", created_at: "2026-10-25T10:00:00", updated_at: "2026-10-25T10:00:00", duration_seconds: 3600 }],
}

describe("IssueListDashboard", () => {
  it("extracts the dashboard marker and leaves markdown content", () => {
    const content = `<!-- flowy-dashboard:${JSON.stringify(data)} -->\n\n### 列表`
    const parsed = parseIssueListDashboard(content)
    expect(parsed.dashboard?.kind).toBe("issue-list")
    expect(parsed.dashboard?.total).toBe(2)
    expect(parsed.markdown).toBe("### 列表")
  })

  it("renders responsive report sections without IDs or my-work content", () => {
    render(<IssueListDashboard data={data} />)
    expect(screen.getByTestId("issue-list-dashboard")).toBeInTheDocument()
    expect(screen.getByText("问题总数")).toBeInTheDocument()
    expect(screen.getByText("登录问题")).toBeInTheDocument()
    expect(screen.getAllByText("待处理").length).toBeGreaterThan(0)
    expect(screen.queryByText("我的工作")).not.toBeInTheDocument()
    expect(screen.queryByText(/2155f2af/)).not.toBeInTheDocument()
  })
})

it.each([
  { kind: 'issue-list', issues: [] },
  { ...data, statuses: null },
  { ...data, activity: [{ date: 1, count: 2 }] },
  { ...data, total: '2' },
  { ...data, priorities: [{ key: 'high', label: '高', count: -1 }] },
  { ...data, issues: [{ title: {} }] },
])('falls back to readable Markdown for malformed dashboard data: %j', (malformed) => {
  const content = `<!-- flowy-dashboard:${JSON.stringify(malformed)} -->\n\n可读正文`
  expect(parseIssueListDashboard(content)).toEqual({ dashboard: null, markdown: content })
})
