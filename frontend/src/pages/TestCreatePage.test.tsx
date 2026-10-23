import { beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TestCreatePage from './TestCreatePage'
import { createTest } from '../api/tests'
import i18n from '../i18n'
import { getWikiUploadLimit } from '../api/wiki'
vi.mock('../api/tests')
vi.mock('../api/wiki', () => ({ getWikiUploadLimit: vi.fn().mockResolvedValue({ limit_mb: 5 }) }))
beforeEach(async () => { cleanup(); vi.resetAllMocks(); await i18n.changeLanguage('zh'); vi.mocked(getWikiUploadLimit).mockResolvedValue({ limit_mb: 5, limit: 5 * 1024 * 1024 }) })
it('creates a request with a Markdown objective and descriptions', async () => {
  vi.mocked(createTest).mockResolvedValue({ id: 'new-test' } as never)
  render(<MemoryRouter initialEntries={['/tests/new']}><Routes><Route path="/tests/new" element={<TestCreatePage/>}/><Route path="/tests/new-test" element={<p>申请详情</p>}/></Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('测试标题 *'), { target: { value: '登录测试' } })
  const objective = screen.getByLabelText('测试目标')
  expect(objective.tagName).toBe('TEXTAREA')
  fireEvent.change(objective, { target: { value: '## 测试范围\n验证登录' } })
  fireEvent.change(screen.getByLabelText('预期效果'), { target: { value: '**登录成功**' } })
  fireEvent.change(screen.getByLabelText('当前现象'), { target: { value: '- 偶发超时' } })
  const editor = objective.closest('[data-testid="markdown-editor-dropzone"]')!
  fireEvent.click(within(editor as HTMLElement).getByRole('button', { name: 'Markdown 预览' }))
  expect(screen.getByRole('heading', { name: '测试范围' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '提交测试申请' }))
  await waitFor(() => expect(createTest).toHaveBeenCalledWith({ title: '登录测试', objective: '## 测试范围\n验证登录', expected_effect: '**登录成功**', current_behavior: '- 偶发超时', issue_id: null }))
  expect(await screen.findByText('申请详情')).toBeInTheDocument()
})

it('renders the creation form in English', async () => {
  await i18n.changeLanguage('en')
  render(<MemoryRouter><TestCreatePage /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'New test request' })).toBeInTheDocument()
  expect(screen.getByLabelText('Test title *')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Submit test request' })).toBeInTheDocument()
  expect(screen.queryByText('申请流程')).not.toBeInTheDocument()
})
