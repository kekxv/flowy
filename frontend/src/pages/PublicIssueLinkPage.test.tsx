import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicIssueLinkPage from './PublicIssueLinkPage'
import '../i18n'
import * as api from '../api/temporaryIssueLinks'
vi.mock('../api/temporaryIssueLinks')
const mocked = vi.mocked(api)
describe('PublicIssueLinkPage', () => {
  it('submits a one-time issue form and locks it after success', async () => {
    mocked.getPublicIssueLink.mockResolvedValue({ expires_at: '2099-01-01T00:00:00+00:00', creator_name: 'Owner' })
    mocked.submitPublicIssueLink.mockResolvedValue({ id: 'i1', title: 'Need help', status: 'open' })
    render(<MemoryRouter initialEntries={['/public/issue-links/t']}><Routes><Route path="/public/issue-links/:token" element={<PublicIssueLinkPage />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Need help' } })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => expect(screen.getByText(/submitted/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument()
  })
})
