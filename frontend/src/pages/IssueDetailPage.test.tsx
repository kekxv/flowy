import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import IssueDetailPage from "./IssueDetailPage"

const apiMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock("../api/client", () => ({
  default: apiMocks,
}))

vi.mock("../api/connections", () => ({
  createExternalIssue: vi.fn(),
  linkExternalIssue: vi.fn(),
  listConnectionRepos: vi.fn(),
  listConnections: vi.fn().mockResolvedValue([]),
  listExternalLinks: vi.fn().mockResolvedValue([]),
  refreshExternalLink: vi.fn(),
  searchExternalIssues: vi.fn(),
  unlinkExternalIssue: vi.fn(),
}))

vi.mock("../store/authStore", () => ({
  useAuthStore: (selector: (state: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: { id: "viewer", role: "member" } }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => ({
      "comment_status.invalid": "无效",
      "comment_status.outdated": "已过时",
      "comment_status.duplicate": "重复",
      "comment_status.resolved": "已解决",
      "comment_status.valid": "有效",
    }[key] ?? fallback ?? key),
  }),
}))

describe("IssueDetailPage", () => {
  it("previews Markdown while composing a comment", async () => {
    apiMocks.get.mockImplementation((url: string) => {
      if (url === "/issues/issue-0001") {
        return Promise.resolve({
          data: {
            assignees: [],
            created_at: "2026-08-05T00:00:00",
            description: "已有描述",
            id: "issue-0001",
            issue_type: "bug",
            labels: [],
            milestone_ids: [],
            priority: "medium",
            reporter: { display_name: "Reporter" },
            status: "open",
            title: "评论预览",
          },
        })
      }
      if (url.endsWith("/comments") || url.endsWith("/assignee-logs")) {
        return Promise.resolve({ data: [] })
      }
      return Promise.resolve({ data: [] })
    })

    render(
      <MemoryRouter initialEntries={["/issues/issue-0001"]}>
        <Routes>
          <Route path="/issues/:id" element={<IssueDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const comment = await screen.findByPlaceholderText("issues.write_comment")
    fireEvent.change(comment, { target: { value: "# 评论标题" } })
    fireEvent.click(screen.getByRole("button", { name: "Markdown 预览" }))

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "评论标题" })).toBeInTheDocument()
    })
  })

  it("shows and deletes Base62 attachments using their original labels", async () => {
    apiMocks.delete.mockReset()
    apiMocks.get.mockImplementation((url: string) => {
      if (url === "/issues/issue-0001") {
        return Promise.resolve({
          data: {
            assignees: [],
            created_at: "2026-08-05T00:00:00",
            description: "已有描述",
            id: "issue-0001",
            issue_type: "bug",
            labels: [],
            milestone_ids: [],
            priority: "medium",
            reporter: { display_name: "Reporter" },
            status: "open",
            title: "附件名称",
          },
        })
      }
      if (url.endsWith("/comments")) {
        return Promise.resolve({
          data: [
            {
              author: { id: "viewer", display_name: "Viewer" },
              body: "[项目 报告.txt](attachment:AbC123xyz)",
              created_at: "2026-08-05T00:00:00",
              id: "comment-1",
              replies: [],
              status: "valid",
            },
          ],
        })
      }
      return Promise.resolve({ data: [] })
    })
    vi.stubGlobal("confirm", vi.fn(() => true))

    render(
      <MemoryRouter initialEntries={["/issues/issue-0001"]}>
        <Routes>
          <Route path="/issues/:id" element={<IssueDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const attachmentLinks = await screen.findAllByRole("link", { name: "项目 报告.txt" })
    expect(attachmentLinks).toHaveLength(2)
    expect(attachmentLinks[1]).toHaveAttribute(
      "href",
      "api/v1/bot-attachments/AbC123xyz",
    )

    fireEvent.click(screen.getByTitle("Delete"))
    await waitFor(() => {
      expect(apiMocks.delete).toHaveBeenCalledWith("/bot-attachments/AbC123xyz")
    })
    vi.unstubAllGlobals()
  })

  it("renders a non-valid comment status in the active locale", async () => {
    apiMocks.get.mockImplementation((url: string) => {
      if (url === "/issues/issue-0001") {
        return Promise.resolve({
          data: {
            assignees: [], created_at: "2026-08-05T00:00:00", description: "",
            id: "issue-0001", issue_type: "bug", labels: [], milestone_ids: [],
            priority: "medium", reporter: { display_name: "Reporter" }, status: "open", title: "状态翻译",
          },
        })
      }
      if (url.endsWith("/comments")) {
        return Promise.resolve({
          data: [{
            author: { id: "viewer", display_name: "Viewer" }, body: "已过时评论",
            created_at: "2026-08-05T00:00:00", id: "comment-1", replies: [], status: "outdated",
          }],
        })
      }
      return Promise.resolve({ data: [] })
    })

    render(
      <MemoryRouter initialEntries={["/issues/issue-0001"]}>
        <Routes><Route path="/issues/:id" element={<IssueDetailPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText("⚠ 已过时")).toBeInTheDocument()
  })
})
