import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { ChartSpec } from './chartSpec'

echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, SVGRenderer])

export async function renderChart(spec: ChartSpec): Promise<string> {
  // Explicit dimensions and SSR make SVGs work in the hidden print document.
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 800, height: 380 })
  try {
    const colors = ['#3b82f6', '#16a370', '#f59e0b', '#e35d6a', '#8b5cf6', '#0891b2', '#64748b', '#d946ef', '#84a332', '#bc7347']
    const common = { animation: false, color: colors, textStyle: { fontFamily: 'Arial, Microsoft YaHei, sans-serif', color: '#334155' }, legend: { bottom: 0, type: 'plain' as const, textStyle: { color: '#475569' } } }
    if (spec.type === 'pie') {
      chart.setOption({ ...common, series: [{ type: 'pie', radius: ['35%', '63%'], center: ['50%', '45%'], label: { formatter: '{b}: {c} ({d}%)', color: '#334155', overflow: 'truncate', width: 160 }, data: spec.labels.map((name, index) => ({ name, value: spec.series[0]!.data[index] })) }] })
    } else {
      chart.setOption({ ...common, grid: { containLabel: true, left: 35, right: 25, top: 24, bottom: 76 }, xAxis: { type: 'category', data: spec.labels, axisLabel: { color: '#64748b', width: 95, overflow: 'truncate' }, axisLine: { lineStyle: { color: '#cbd5e1' } } }, yAxis: { type: 'value', axisLabel: { color: '#64748b' }, splitLine: { lineStyle: { color: '#e8edf3' } } }, series: spec.series.map(series => ({ type: spec.type, name: series.name, data: series.data, barMaxWidth: 50, smooth: false, symbolSize: 7 })) })
    }
    return chart.renderToSVGString()
  } finally { chart.dispose() }
}
