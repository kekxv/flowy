import { beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import api from '../api/client'
import i18n from '../i18n'
import PublicTestCollectionPage from './PublicTestCollectionPage'
vi.mock('../api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
beforeEach(() => { cleanup(); vi.resetAllMocks() })
function show() { render(<MemoryRouter initialEntries={['/form/token']}><Routes><Route path="/form/:token" element={<PublicTestCollectionPage />} /></Routes></MemoryRouter>) }
it('blocks an expired form using server time', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { expires_at: '2026-01-01T00:00:00Z', server_time: '2026-01-02T00:00:00Z' } })
  show()
  await screen.findByText('链接已失效')
  expect(screen.queryByRole('button', { name: '提交申请' })).not.toBeInTheDocument()
})
it('shows unavailable when the server rejects a used or cancelled link', async () => {
  vi.mocked(api.get).mockRejectedValue({ response: { status: 410 } })
  show()
  await screen.findByText('链接已失效')
})

it('expires an open form without requiring a reload', async () => {
  const now = Date.now()
  vi.mocked(api.get).mockResolvedValue({ data: { expires_at: new Date(now + 5000).toISOString(), server_time: new Date(now).toISOString() } })
  show()
  await screen.findByRole('button', { name: '提交申请' })
  vi.useFakeTimers()
  try {
    act(() => { vi.advanceTimersByTime(6000); window.dispatchEvent(new Event('focus')) })
    expect(screen.getByText('链接已失效')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '提交申请' })).not.toBeInTheDocument()
  } finally { vi.useRealTimers() }
})
it('retries only attachments which have not uploaded successfully', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { expires_at: '2099-01-01T00:00:00Z', server_time: new Date().toISOString() } })
  vi.mocked(api.post).mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(new Error('network')).mockResolvedValue({ data: {} })
  show()
  fireEvent.change(await screen.findByLabelText('测试标题 *'), { target: { value: 'Test upload' } })
  const first = new File(['first'], 'first.txt')
  const second = new File(['second'], 'second.txt')
  fireEvent.change(screen.getByLabelText('图片、视频或文件（最多 5 个）'), { target: { files: [first, second] } })
  fireEvent.click(screen.getByRole('button', { name: '提交申请' }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '提交申请' }))
  await screen.findByText('测试申请已提交')
  const uploads = vi.mocked(api.post).mock.calls.filter(([url]) => url.endsWith('/attachments'))
  expect(uploads.map(([, body]) => (body as FormData).get('file'))).toEqual([first, second, second])
})
it('handles a link revoked while submitting', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { expires_at: '2099-01-01T00:00:00Z' } })
  vi.mocked(api.post).mockRejectedValue({ response: { status: 410 } })
  show()
  fireEvent.change(await screen.findByLabelText('测试标题 *'), { target: { value: 'Revoked' } })
  fireEvent.click(screen.getByRole('button', { name: '提交申请' }))
  await waitFor(() => expect(screen.getByText('链接已失效')).toBeInTheDocument())
})
it('collects a Markdown objective and uploads inline images using the public token', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { expires_at: '2099-01-01T00:00:00Z', max_file_size: 5 * 1024 * 1024 } })
  vi.mocked(api.post).mockResolvedValue({ data: { url: '/api/v1/public/test-collections/attachments/image.png', name: 'image.png', content_type: 'image/png' } })
  show()
  const objective = await screen.findByLabelText('测试目标')
  expect(objective.tagName).toBe('TEXTAREA')
  fireEvent.change(objective, { target: { value: '## 验证目标\n登录成功' } })
  const editor = objective.closest('[data-testid="markdown-editor-dropzone"]')!
  fireEvent.change(within(editor as HTMLElement).getByLabelText('上传图片'), { target: { files: [new File(['image'], 'image.png', { type: 'image/png' })] } })
  await waitFor(() => expect((objective as HTMLTextAreaElement).value).toContain('![image.png]'))
  expect(api.post).toHaveBeenCalledWith('/public/test-collections/token/attachments', expect.any(FormData))
  expect(api.get).toHaveBeenCalledTimes(1)
})

it('renders public test collection and expiry states in English', async () => {
  await i18n.changeLanguage('en')
  vi.mocked(api.get).mockResolvedValue({ data: { expires_at: '2099-01-01T00:00:00Z', server_time: new Date().toISOString() } })
  show()
  expect(await screen.findByRole('heading', { name: 'Test request collection' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Submit request' })).toBeInTheDocument()
  expect(screen.getByLabelText('Test title *')).toBeInTheDocument()
  await act(async () => { await i18n.changeLanguage('zh') })
  expect(screen.getByRole('button', { name: '提交申请' })).toBeInTheDocument()
})
