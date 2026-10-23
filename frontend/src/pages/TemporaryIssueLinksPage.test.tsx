import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import TemporaryIssueLinksPage from './TemporaryIssueLinksPage'
import i18n from '../i18n'
import * as api from '../api/temporaryIssueLinks'
vi.mock('../api/temporaryIssueLinks')
vi.mock('../api/tests')
import * as testsApi from '../api/tests'
const mocked = vi.mocked(api)
const link = { id: 'l1', expires_at: '2099-01-01T00:00:00Z', used_at: null, revoked_at: null, issue_id: null, created_at: '2026-10-13', active: true, url: 'https://flowy.example/#/public/issue-links/token' }

describe('TemporaryIssueLinksPage', () => {
  beforeEach(async () => {
    cleanup()
    vi.resetAllMocks()
    await i18n.changeLanguage('en')
    mocked.listTemporaryIssueLinks.mockResolvedValue([link])
    vi.mocked(testsApi.listTestCollections).mockResolvedValue([])
  })
  it('manages both types without generating links here', async () => {
    vi.mocked(testsApi.listTestCollections).mockResolvedValue([{ ...link, id: 't1', url: 'https://flowy.example/#/public/test-collections/token' }])
    render(<TemporaryIssueLinksPage />)
    await screen.findByText('Test request')
    expect(screen.getAllByRole('link', { name: 'Open link' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Generate link' })).not.toBeInTheDocument()
  })
  it('cancels a test link without cancelling an issue link with the same id', async () => {
    vi.mocked(testsApi.listTestCollections).mockResolvedValue([{ ...link, url: 'https://flowy.example/#/public/test-collections/token' }])
    render(<TemporaryIssueLinksPage />)
    const label = await screen.findByText('Test request')
    vi.mocked(testsApi.cancelTestCollection).mockResolvedValue(undefined)
    vi.mocked(testsApi.listTestCollections).mockResolvedValue([{ ...link, active: false, revoked_at: '2026-10-13', url: null }])
    fireEvent.click(within(label.closest('article')!).getByRole('button', { name: 'Cancel link' }))
    await screen.findByText('Cancelled')
    expect(screen.getAllByRole('link', { name: 'Open link' })).toHaveLength(1)
    expect(mocked.cancelTemporaryIssueLink).not.toHaveBeenCalled()
  })
  it('expires a link while the list remains open', async () => {
    mocked.listTemporaryIssueLinks.mockResolvedValue([{ ...link, expires_at: new Date(Date.now() + 5000).toISOString() }])
    render(<TemporaryIssueLinksPage />)
    await screen.findByRole('link', { name: 'Open link' })
    vi.useFakeTimers()
    try {
      act(() => { vi.advanceTimersByTime(6000); window.dispatchEvent(new Event('focus')) })
      expect(screen.getByText('Expired')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Open link' })).not.toBeInTheDocument()
    } finally { vi.useRealTimers() }
  })
  it('shows a saved link that can be opened or copied after a reload', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
    render(<TemporaryIssueLinksPage />)
    const open = await screen.findByRole('link', { name: 'Open link' })
    expect(open).toHaveAttribute('href', link.url)
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await screen.findByText('Copied')
    expect(clipboard.writeText).toHaveBeenCalledWith(link.url)
  })
  it('cancels an active link and removes the open and cancel actions', async () => {
    render(<TemporaryIssueLinksPage />)
    const cancel = await screen.findByRole('button', { name: 'Cancel link' })
    mocked.cancelTemporaryIssueLink.mockResolvedValue(undefined)
    mocked.listTemporaryIssueLinks.mockResolvedValue([{ ...link, active: false, revoked_at: '2026-10-13T08:00:00Z', url: null }])
    fireEvent.click(cancel)
    await screen.findByText('Cancelled')
    expect(screen.queryByRole('link', { name: 'Open link' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel link' })).not.toBeInTheDocument()
  })
  it('keeps the active link if cancellation fails', async () => {
    render(<TemporaryIssueLinksPage />)
    const cancel = await screen.findByRole('button', { name: 'Cancel link' })
    mocked.cancelTemporaryIssueLink.mockRejectedValue(new Error('Network failure'))
    fireEvent.click(cancel)
    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: 'Open link' })).toHaveAttribute('href', link.url)
  })
})
