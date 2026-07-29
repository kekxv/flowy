import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import CommandTestResult from "./CommandTestResult"

describe("CommandTestResult", () => {
  it("switches between the exact response source and rendered Markdown", () => {
    const content = "# 返回标题\n\n**已完成**"
    render(<CommandTestResult content={content} />)

    expect(screen.getByRole("button", { name: "源文件" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByLabelText("返回内容源文件").textContent).toBe(content)
    expect(screen.queryByRole("heading", { name: "返回标题" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Markdown 预览" }))

    expect(screen.getByRole("button", { name: "Markdown 预览" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("heading", { name: "返回标题" })).toBeInTheDocument()
    expect(screen.getByText("已完成").tagName).toBe("STRONG")

    fireEvent.click(screen.getByRole("button", { name: "源文件" }))

    expect(screen.getByLabelText("返回内容源文件").textContent).toBe(content)
  })
})
