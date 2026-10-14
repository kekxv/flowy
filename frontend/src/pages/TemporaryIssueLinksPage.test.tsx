import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import TemporaryIssueLinksPage from './TemporaryIssueLinksPage'
import i18n from '../i18n'
import * as api from '../api/temporaryIssueLinks'
vi.mock('../api/temporaryIssueLinks')
const mocked = vi.mocked(api)
const link = { id: 'l1', expires_at: '2099-01-01T00:00:00Z', used_at: null, revoked_at: null, issue_id: null, created_at: '2026-10-13', active: true, url: 'https://flowy.example/#/public/issue-links/token' }

describe('TemporaryIssueLinksPage', () => {
  beforeEach(async () => {
    cleanup()
    vi.resetAllMocks()
    await i18n.changeLanguage('en')
    mocked.listTemporaryIssueLinks.mockResolvedValue([link])
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
