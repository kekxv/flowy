import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import MarkdownEditor from "./MarkdownEditor"

describe("MarkdownEditor", () => {
  it("renders the source editor first and switches to rendered Markdown preview", () => {
    const onChange = vi.fn()
    render(<MarkdownEditor value={"# 标题\n\n**正文**"} onChange={onChange} />)

    expect(screen.getByRole("textbox")).toHaveValue("# 标题\n\n**正文**")
    expect(screen.queryByRole("heading", { name: "标题" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Markdown 预览" }))

    expect(screen.getByRole("button", { name: "Markdown 预览" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("heading", { name: "标题" })).toBeInTheDocument()
    expect(screen.getByText("正文").tagName).toBe("STRONG")

    fireEvent.click(screen.getByRole("button", { name: "编辑" }))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "更新内容" } })

    expect(onChange).toHaveBeenLastCalledWith("更新内容")
  })

  it("forwards placeholder, rows, and id to the editable textarea", () => {
    render(
      <MarkdownEditor
        id="issue-comment"
        value=""
        onChange={vi.fn()}
        rows={3}
        placeholder="写评论..."
      />,
    )

    expect(screen.getByRole("textbox")).toHaveAttribute("id", "issue-comment")
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "3")
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "写评论...")
  })
})
