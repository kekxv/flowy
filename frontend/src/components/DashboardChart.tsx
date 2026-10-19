import ReactEChartsCore from "echarts-for-react/esm/core"
import * as echarts from "echarts/core"
import { LineChart } from "echarts/charts"
import { GridComponent, TooltipComponent } from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import type { EChartsOption } from "echarts"

// Register only what the dashboard actually draws: importing the full `echarts`
// bundle put ~1 MB of unused chart types into the dashboard chunk.
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

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

  return <ReactEChartsCore data-testid="dashboard-echart" echarts={echarts} option={option} style={style} notMerge lazyUpdate />
}
