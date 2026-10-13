import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicIssueLinkPage from './PublicIssueLinkPage'
import i18n from '../i18n'
import * as api from '../api/temporaryIssueLinks'
import { AxiosError } from 'axios'
vi.mock('../api/temporaryIssueLinks')
const mocked = vi.mocked(api)
function renderPage() {
  return render(<MemoryRouter initialEntries={['/public/issue-links/t']}><Routes><Route path="/public/issue-links/:token" element={<PublicIssueLinkPage />} /></Routes></MemoryRouter>)
}
describe('PublicIssueLinkPage', () => {
  afterEach(() => { cleanup(); vi.useRealTimers() })
  beforeEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    mocked.getPublicIssueLink.mockResolvedValue({ expires_at: '2099-01-01T00:00:00+00:00', creator_name: 'Owner' })
    mocked.submitPublicIssueLink.mockResolvedValue({ id: 'i1', title: 'Need help', status: 'open' })
  })
  it('closes the form at server expiry even if the device clock is wrong', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-13T00:00:00Z'))
    mocked.getPublicIssueLink.mockResolvedValue({
      creator_name: 'Owner', server_time: '2026-10-13T08:00:00Z', expires_at: '2026-10-13T08:00:05Z',
    })
    await act(async () => { renderPage() })
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByText('Temporary link unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit request/i })).not.toBeInTheDocument()
  })
  it('submits a one-time issue form and locks it after success', async () => {
    renderPage()
    const title = await screen.findByRole('textbox', { name: 'Title' })
    fireEvent.change(title, { target: { value: 'Need help' } })
    fireEvent.click(screen.getByRole('button', { name: /submit request/i }))
    await screen.findByText('Request submitted')
    expect(screen.queryByRole('button', { name: /submit request/i })).not.toBeInTheDocument()
  })
  it('checks expiry when a suspended mobile page becomes visible again', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-13T08:00:00Z'))
    mocked.getPublicIssueLink.mockResolvedValue({
      creator_name: 'Owner', server_time: '2026-10-13T08:00:00Z', expires_at: '2026-10-13T08:01:00Z',
    })
    await act(async () => { renderPage() })
    vi.setSystemTime(new Date('2026-10-13T08:02:00Z'))
    fireEvent(document, new Event('visibilitychange'))
    expect(screen.getByText('Temporary link unavailable')).toBeInTheDocument()
  })
  it('locks the form if the server rejects a used or expired link', async () => {
    const error = new AxiosError('Gone')
    error.response = { status: 410 } as NonNullable<AxiosError['response']>
    mocked.submitPublicIssueLink.mockRejectedValue(error)
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Title' }), { target: { value: 'Need help' } })
    fireEvent.click(screen.getByRole('button', { name: /submit request/i }))
    await screen.findByText('Temporary link unavailable')
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument()
  })
  it('keeps the form available for retry after a network failure', async () => {
    mocked.submitPublicIssueLink.mockRejectedValue(new Error('Network unavailable'))
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Title' }), { target: { value: 'Need help' } })
    fireEvent.click(screen.getByRole('button', { name: /submit request/i }))
    await screen.findByText('Submission failed. Please try again.')
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Need help')
  })
  it('submits the priority code with Chinese labels', async () => {
    await i18n.changeLanguage('zh')
    renderPage()
    fireEvent.change(await screen.findByRole('textbox', { name: '标题' }), { target: { value: '测试问题' } })
    fireEvent.change(screen.getByLabelText('优先级'), { target: { value: 'critical' } })
    fireEvent.click(screen.getByRole('button', { name: '提交需求' }))
    await screen.findByText('提交成功')
    expect(mocked.submitPublicIssueLink).toHaveBeenCalledWith('t', expect.objectContaining({ priority: 'critical' }))
  })
  it('includes a dropped attachment in the request after resetting text fields', async () => {
    mocked.uploadPublicIssueLinkAttachment.mockResolvedValue({ original_name: 'details.pdf', markdown: '[details.pdf](/attachment)' })
    renderPage()
    await screen.findByRole('textbox', { name: 'Title' })
    fireEvent.drop(screen.getByRole('button', { name: /click to upload/i }), { dataTransfer: { files: [new File(['test'], 'details.pdf', { type: 'application/pdf' })] } })
    await screen.findByText('details.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Need help' } })
    fireEvent.click(screen.getByRole('button', { name: /submit request/i }))
    await waitFor(() => expect(mocked.submitPublicIssueLink).toHaveBeenCalledWith('t', expect.objectContaining({ description: '[details.pdf](/attachment)' })))
  })
})
