import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import IssueListPage from "./IssueListPage"
import WikiListPage from "./WikiListPage"
import MilestonesPage from "./MilestonesPage"

const mocks = vi.hoisted(() => ({ listIssues: vi.fn(), listWikiPages: vi.fn(), get: vi.fn() }))
vi.mock("../api/issues", () => ({ listIssues: mocks.listIssues }))
vi.mock("../api/wiki", () => ({ listWikiPages: mocks.listWikiPages }))
vi.mock("../api/client", () => ({ default: { get: mocks.get } }))
vi.mock("../store/authStore", () => ({ useAuthStore: (select: (s: { user: null }) => unknown) => select({ user: null }) }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

function Detail() {
  const location = useLocation()
  return <div data-testid="detail-origin">{location.state?.from}</div>
}

describe("list navigation", () => {
  it("keeps issue filters and page in the URL and passes the origin to details", async () => {
    mocks.get.mockResolvedValue({ data: [] })
    mocks.listIssues.mockResolvedValue({ data: [{ id: "issue-1", title: "Matching issue", status: "open", priority: "medium", reporter: { username: "alice" }, labels: [], created_at: "2026-01-01" }], meta: { total: 25 } })
    render(<MemoryRouter initialEntries={["/issues?q=alpha&status=open&page=2"]}><Routes><Route path="/issues" element={<IssueListPage />} /><Route path="/issues/:id" element={<Detail />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(mocks.listIssues).toHaveBeenCalledWith(expect.objectContaining({ q: "alpha", status: "open", page: "2" })))
    fireEvent.click(await screen.findByText("Matching issue"))
    expect(screen.getByTestId("detail-origin")).toHaveTextContent("/issues?q=alpha&status=open&page=2")
  })

  it("records an issue page change before opening a detail", async () => {
    mocks.get.mockResolvedValue({ data: [] })
    mocks.listIssues.mockResolvedValue({ data: [{ id: "issue-1", title: "Paged issue", status: "open", priority: "medium", reporter: { username: "alice" }, labels: [], created_at: "2026-01-01" }], meta: { total: 25 } })
    render(<MemoryRouter initialEntries={["/issues?q=alpha"]}><Routes><Route path="/issues" element={<IssueListPage />} /><Route path="/issues/:id" element={<Detail />} /></Routes></MemoryRouter>)
    fireEvent.click(await screen.findByRole("button", { name: "Next" }))
    fireEvent.click(await screen.findByText("Paged issue"))
    expect(screen.getByTestId("detail-origin")).toHaveTextContent("/issues?q=alpha&page=2")
  })

  it("keeps wiki search, tab and page in the URL and passes the origin to details", async () => {
    mocks.listWikiPages.mockResolvedValue({ data: [{ id: "wiki-1", title: "Matching wiki", content: "Text", summary: "", owner_name: "alice", updated_at: "2026-01-01", weight: 0, tags: "", is_public: true }], meta: { total: 25 } })
    render(<MemoryRouter initialEntries={["/wiki?q=alpha&tab=mine&page=2"]}><Routes><Route path="/wiki" element={<WikiListPage />} /><Route path="/wiki/:id" element={<Detail />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(mocks.listWikiPages).toHaveBeenCalledWith(expect.objectContaining({ q: "alpha", tab: "mine", page: 2 })))
    fireEvent.click(await screen.findByText("Matching wiki"))
    expect(screen.getByTestId("detail-origin")).toHaveTextContent("/wiki?q=alpha&tab=mine&page=2")
  })

  it("passes the filtered wiki list to the new-page screen", async () => {
    mocks.listWikiPages.mockResolvedValue({ data: [], meta: { total: 0 } })
    render(<MemoryRouter initialEntries={["/wiki?q=guide&tab=mine&page=2"]}><Routes><Route path="/wiki" element={<WikiListPage />} /><Route path="/wiki/new" element={<Detail />} /></Routes></MemoryRouter>)
    fireEvent.click(await screen.findByRole("button", { name: "wiki.new_page" }))
    expect(screen.getByTestId("detail-origin")).toHaveTextContent("/wiki?q=guide&tab=mine&page=2")
  })

  it("keeps the milestone filter and view when opening a milestone", async () => {
    mocks.get.mockResolvedValue({ data: [{ id: "milestone-1", name: "Closed milestone", description: "", status: "closed", total_issues: 0, closed_issues: 0, progress: 0, due_date: null, created_at: "2026-01-01" }] })
    render(<MemoryRouter initialEntries={["/milestones?filter=closed&view=cards"]}><Routes><Route path="/milestones" element={<MilestonesPage />} /><Route path="/milestones/:id" element={<Detail />} /></Routes></MemoryRouter>)
    fireEvent.click(await screen.findByText("Closed milestone"))
    expect(screen.getByTestId("detail-origin")).toHaveTextContent("/milestones?filter=closed&view=cards")
  })

  it("loads milestone chart data when returning to the gantt view", async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve({ data: path === "/milestones" ? [{ id: "milestone-1", name: "Open milestone", status: "open", due_date: null, created_at: "2026-01-01" }] : [] }))
    render(<MemoryRouter initialEntries={["/milestones?view=gantt"]}><Routes><Route path="/milestones" element={<MilestonesPage />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/milestones/milestone-1/issues"))
  })
})
