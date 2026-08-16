import ReactECharts from "echarts-for-react"
import type { EChartsOption } from "echarts"

interface DashboardChartProps {
  option: EChartsOption
  height?: number
  width?: number | string
  emptyText?: string
}

function hasSeriesData(option: EChartsOption): boolean {
  return Array.isArray(option.series) && option.series.some((series) => {
    const data = Array.isArray(series) ? series.flatMap((item) => item.data ?? []) : series.data
    return Array.isArray(data) && data.length > 0
  })
}

export default function DashboardChart({ option, height = 180, width = "100%", emptyText = "No data" }: DashboardChartProps) {
  const style = { width, height }

  if (!hasSeriesData(option)) {
    return <div className="flex items-center justify-center text-[12px] text-[var(--text-muted)]" style={style}>{emptyText}</div>
  }

  return <ReactECharts data-testid="dashboard-echart" option={option} style={style} notMerge lazyUpdate />
}
