import { beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CollectionLinkGenerator from './CollectionLinkGenerator'
import i18n from '../../i18n'
import * as issues from '../../api/temporaryIssueLinks'
import * as tests from '../../api/tests'
vi.mock('../../api/temporaryIssueLinks')
vi.mock('../../api/tests')
beforeEach(async () => { cleanup(); vi.resetAllMocks(); await i18n.changeLanguage('en') })
it.each(['issue', 'test'] as const)('generates a %s link with a selected duration and shows expiry', async kind => {
  const create = kind === 'issue' ? vi.mocked(issues.createTemporaryIssueLink) : vi.mocked(tests.createTestCollection)
  create.mockResolvedValue({ token: 'token', url: 'https://example.test/form', expires_at: '2099-01-01T00:00:00Z' })
  render(<CollectionLinkGenerator kind={kind} />)
  fireEvent.change(screen.getByLabelText('Expires in'), { target: { value: '30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate link' }))
  expect(await screen.findByRole('link')).toHaveAttribute('href', 'https://example.test/form')
  expect(screen.getByText(/Expires:.*2099/)).toBeInTheDocument()
  expect(create).toHaveBeenCalledWith(30)
})
