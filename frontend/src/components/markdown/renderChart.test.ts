import { expect, it } from 'vitest'
import { renderChart } from './renderChart'
it.each(['bar', 'line', 'pie'] as const)('renders %s as an independent SVG with escaped labels', async type => {
  const svg = await renderChart({ type, title: '测试', labels: ['<script>alert(1)</script>', '权限'], series: [{ name: '用例', data: [12, 8] }] })
  expect(svg).toContain('<svg')
  expect(svg).toContain('viewBox="0 0 800 380"')
  expect(svg).toContain('权限')
  expect(svg).not.toContain('<script>')
})
