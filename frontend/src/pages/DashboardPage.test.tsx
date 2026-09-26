import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { expect, it, vi } from "vitest"
import DashboardPage from "./DashboardPage"

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("../api/client", () => ({ default: apiMocks }))
vi.mock("../store/authStore", () => ({ useAuthStore: (select: (s: { user: null }) => unknown) => select({ user: null }) }))
vi.mock("../components/DashboardChart", () => ({ default: () => null }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

it("shows linked software, wiki and milestone totals", async () => {
  apiMocks.get.mockResolvedValue({ data: {
    my_issues: [], pending_issues: [], active_timers: [], milestones: [],
    stats: {
      total_issues: 0, open_issues: 0, closed_issues: 0, my_reported: 0,
      bug_count: 0, feature_count: 0, overdue_milestones: 0,
      software_components: 3, software_versions: 9, wiki_pages: 12, total_milestones: 4,
      by_status: {}, by_priority: {}, recent_activity: [], completion_activity: [],
    },
  } })
  render(<MemoryRouter><DashboardPage /></MemoryRouter>)
  expect(await screen.findByRole("link", { name: /dashboard.software_versions.*9/ })).toHaveAttribute("href", "/software")
  expect(screen.getByRole("link", { name: /dashboard.wiki_pages.*12/ })).toHaveAttribute("href", "/wiki")
  expect(screen.getByRole("link", { name: /dashboard.total_milestones.*4/ })).toHaveAttribute("href", "/milestones")
  expect(screen.getByRole("link", { name: /dashboard.software_components.*3/ })).toHaveAttribute("href", "/software")
})
