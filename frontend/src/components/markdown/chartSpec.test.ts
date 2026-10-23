import { expect, it } from 'vitest'
import { parseChartSpec } from './chartSpec'

it('parses chart labels, finite values and multiple series', () => {
  const spec = { type: 'bar', title: '模块测试结果', labels: ['登录', '权限'], series: [{ name: '通过', data: [12, 8] }, { name: '失败', data: [0, 2] }] }
  expect(parseChartSpec(JSON.stringify(spec))).toEqual(spec)
})
it.each([
  '{bad json',
  JSON.stringify({ type: 'script', labels: ['A'], series: [{ name: 'X', data: [1] }] }),
  JSON.stringify({ type: 'line', labels: ['A', 'B'], series: [{ name: 'X', data: [1] }] }),
  JSON.stringify({ type: 'pie', labels: ['A'], series: [{ name: 'X', data: [-1] }] }),
  JSON.stringify({ type: 'bar', labels: ['A'], series: [{ name: 'X', data: ['2'] }] }),
  JSON.stringify({ type: 'bar', labels: Array(101).fill('A'), series: [{ name: 'X', data: Array(101).fill(1) }] }),
])('rejects malformed or excessive chart content without executing it', source => {
  expect(() => parseChartSpec(source)).toThrow()
})
