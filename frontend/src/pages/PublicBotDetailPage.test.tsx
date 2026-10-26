import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { getPublicBotDetail } from '../api/temporaryBotDetails'
import PublicBotDetailPage from './PublicBotDetailPage'

vi.mock('../api/temporaryBotDetails', () => ({ getPublicBotDetail: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const detail = { title: '测试详情', summary: '申请概括', expires_at: '2099-01-01T00:00:00Z', content: '<!-- flowy-test-detail -->\n## 测试申请\n\n申请目标正文\n\n## 测试报告（按最新到最早）\n\n### 报告 1 · v2 · 通过\n\n**完整报告**\n\nREPORT_BODY_ONLY' }
function show() {
  return render(<MemoryRouter initialEntries={['/details/first']}><Link to="/details/second">切换链接</Link><Routes><Route path="/details/:token" element={<PublicBotDetailPage />} /></Routes></MemoryRouter>)
}
it('keeps report body out of the application article and opens it only in the report dialog', async () => {
  vi.mocked(getPublicBotDetail).mockResolvedValue(detail)
  const { container } = show()
  await screen.findByText('申请目标正文')
  expect(container.querySelector('.bot-detail-card')).not.toHaveTextContent('REPORT_BODY_ONLY')
  expect(screen.getAllByRole('button', { name: /查看报告/ })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: /查看报告/ }))
  expect(within(screen.getByRole('dialog')).getByText('REPORT_BODY_ONLY')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '关闭报告详情' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('clears an expired-link error when switching to another valid detail', async () => {
  vi.mocked(getPublicBotDetail).mockRejectedValueOnce({ response: { status: 410 } }).mockResolvedValueOnce(detail)
  show()
  await screen.findByText('链接已失效')
  fireEvent.click(screen.getByText('切换链接'))
  await screen.findByText('申请目标正文')
  expect(screen.queryByText('链接已失效')).not.toBeInTheDocument()
})
it('hides previous detail and its open report while a different link is loading', async () => {
  vi.mocked(getPublicBotDetail).mockResolvedValueOnce(detail).mockImplementationOnce(() => new Promise(() => {}))
  show()
  await screen.findByText('申请目标正文')
  fireEvent.click(screen.getByRole('button', { name: /查看报告/ }))
  fireEvent.click(screen.getByText('切换链接'))
  expect(screen.queryByText('申请目标正文')).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('加载中…')).toBeInTheDocument()
})
it('shows an empty report state separately from the application', async () => {
  vi.mocked(getPublicBotDetail).mockResolvedValue({ ...detail, content: '<!-- flowy-test-detail -->\n## 测试申请\n\n申请目标正文\n\n## 测试报告\n\n暂无测试报告' })
  const { container } = show()
  await screen.findByText('申请目标正文')
  expect(screen.getByText('暂无测试报告')).toBeInTheDocument()
  expect(container.querySelector('.bot-detail-card')).not.toHaveTextContent('暂无测试报告')
})
it('preserves test-report headings inside ordinary wiki articles', async () => {
  vi.mocked(getPublicBotDetail).mockResolvedValue({ ...detail, content: '## Wiki 正文\n\n## 测试报告\n\nWIKI_REPORT_SECTION' })
  show()
  await screen.findByText('WIKI_REPORT_SECTION')
  expect(screen.queryByRole('button', { name: /查看报告/ })).not.toBeInTheDocument()
})
