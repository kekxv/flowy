import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import DashboardChart from "./DashboardChart"

vi.mock("echarts-for-react", () => ({
  default: ({ option, style }: { option: unknown; style?: Record<string, string | number> }) => <div data-testid="dashboard-echart" data-option={JSON.stringify(option)} style={style} />,
}))

describe("DashboardChart", () => {
  it("renders an ECharts chart for an option with series data", () => {
    render(<DashboardChart option={{ series: [{ type: "line", data: [1] }] }} />)
    expect(screen.getByTestId("dashboard-echart")).toBeInTheDocument()
  })

  it("shows the no-data message when every series is empty", () => {
    render(<DashboardChart option={{ series: [] }} emptyText="No data" />)
    expect(screen.getByText("No data")).toBeInTheDocument()
  })

  it("uses an explicit width for a compact chart", () => {
    render(<DashboardChart option={{ series: [{ type: "pie", data: [{ value: 1 }] }] }} height={44} width={44} />)

    expect(screen.getByTestId("dashboard-echart")).toHaveStyle({ width: "44px", height: "44px" })
  })
})
