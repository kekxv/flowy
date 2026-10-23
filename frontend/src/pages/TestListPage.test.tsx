import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, expect, it, vi } from "vitest"
import TestListPage from "./TestListPage"
import i18n from "../i18n"

const mocks = vi.hoisted(() => ({ listTests: vi.fn(), getTestStats: vi.fn(), createTestCollection: vi.fn() }))
vi.mock("../api/tests", () => mocks)
beforeEach(async () => { cleanup(); vi.resetAllMocks(); await i18n.changeLanguage("zh") })

it("shows test statistics and filters requests by status", async () => {
  mocks.listTests.mockResolvedValue([{ id: "t-1", title: "登录验证", objective: "## 目标\n验证登录", status: "submitted", updated_at: "2026-10-23T00:00:00", tester: null }])
  mocks.getTestStats.mockResolvedValue({ total: 3, active: 2, by_status: { passed: 1, failed: 0 } })
  render(<MemoryRouter><TestListPage /></MemoryRouter>)
  expect(await screen.findByText("登录验证")).toBeInTheDocument()
  const generator = screen.getByText("创建采集链接")
  const workbench = screen.getByRole("heading", { name: /测试工作台/ })
  expect(generator.compareDocumentPosition(workbench) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getAllByText("3")[0]).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: /测试成功/ }))
  await waitFor(() => expect(mocks.listTests).toHaveBeenLastCalledWith({ status_filter: "passed" }))
})

it("searches tests by title", async () => {
  mocks.listTests.mockResolvedValue([])
  mocks.getTestStats.mockResolvedValue({ total: 0, active: 0, by_status: {} })
  render(<MemoryRouter><TestListPage /></MemoryRouter>)
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索测试申请' }), { target: { value: '支付' } })
  await waitFor(() => expect(mocks.listTests).toHaveBeenLastCalledWith({ q: '支付' }))
})

it('switches test status labels and list controls between English and Chinese', async () => {
  mocks.listTests.mockResolvedValue([{ id: 'en-1', title: '用户填写的标题', objective: '', status: 'submitted', updated_at: '2026-10-23T00:00:00', tester: null }])
  mocks.getTestStats.mockResolvedValue({ total: 1, active: 1, by_status: { submitted: 1 } })
  await i18n.changeLanguage('en')
  render(<MemoryRouter><TestListPage /></MemoryRouter>)
  expect(await screen.findByText('用户填写的标题')).toBeInTheDocument()
  expect(screen.getByRole('searchbox', { name: 'Search test requests' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Pending review/ })).toBeInTheDocument()
  expect(screen.queryByText('已填写测试目标')).not.toBeInTheDocument()
  await act(async () => { await i18n.changeLanguage('zh') })
  expect(screen.getByRole('searchbox', { name: '搜索测试申请' })).toBeInTheDocument()
  expect(screen.getByText('用户填写的标题')).toBeInTheDocument()
})
