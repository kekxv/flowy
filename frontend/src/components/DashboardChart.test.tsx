import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import DashboardChart from "./DashboardChart"

vi.mock("echarts-for-react", () => ({
  default: ({ option }: { option: unknown }) => <div data-testid="dashboard-echart" data-option={JSON.stringify(option)} />,
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
})
