import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import MarkdownContent from './MarkdownContent'
vi.mock('./markdown/renderChart', () => ({ renderChart: vi.fn(async () => '<svg viewBox="0 0 800 360"><text>SVG_CHART</text></svg>') }))
vi.mock('./markdown/renderMermaid', () => ({ renderMermaid: vi.fn(async () => '<svg viewBox="0 0 800 360"><text>SVG_FLOW</text></svg>') }))
afterEach(cleanup)
const source = JSON.stringify({ type: 'bar', title: '用例分布', labels: ['登录', '权限'], series: [{ name: '通过', data: [12, 8] }] })
it('renders a single newline as a line break and blank lines as separate paragraphs', () => {
  const { container } = render(<MarkdownContent>{'第一行\n第二行\n\n下一段'}</MarkdownContent>)
  const paragraphs = container.querySelectorAll('p')
  expect(paragraphs).toHaveLength(2)
  expect(paragraphs[0]?.innerHTML).toBe('第一行<br>\n第二行')
  expect(paragraphs[1]).toHaveTextContent('下一段')
})
it('preserves literal newlines in fenced code without inserting breaks', () => {
  const { container } = render(<MarkdownContent>{'```text\n第一行\n第二行\n```'}</MarkdownContent>)
  expect(container.querySelector('pre code')?.textContent).toBe('第一行\n第二行\n')
  expect(container.querySelector('pre br')).toBeNull()
})
it('renders fenced charts as SVG with a data table while keeping normal code intact', async () => {
  render(<MarkdownContent>{'```chart\n'+source+'\n```\n\n```python\nprint(1)\n```'}</MarkdownContent>)
  expect(await screen.findByText('SVG_CHART')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: '用例分布' })).toBeInTheDocument()
  expect(screen.getByRole('table', { name: '用例分布数据' })).toHaveTextContent('登录12')
  expect(screen.getByText('print(1)')).toHaveClass('language-python')
})
it('renders Mermaid diagrams and preserves following Markdown', async () => {
  render(<MarkdownContent>{'```mermaid\nflowchart LR\nA[申请] --> B[测试]\n```\n\n## 后续章节'}</MarkdownContent>)
  expect(await screen.findByText('SVG_FLOW')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '后续章节' })).toBeInTheDocument()
})
it('shows invalid chart source with a readable error instead of losing report content', async () => {
  render(<MarkdownContent>{'```chart\n{broken}\n```'}</MarkdownContent>)
  expect(await screen.findByRole('alert')).toHaveTextContent('图表')
  expect(screen.getByText('{broken}')).toBeInTheDocument()
})
