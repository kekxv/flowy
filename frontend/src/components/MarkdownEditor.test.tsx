import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import i18n from "i18next"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import api from "../api/client"
import { getWikiUploadLimit } from "../api/wiki"
import en from "../locales/en.json"
import zh from "../locales/zh.json"
import MarkdownEditor from "./MarkdownEditor"

vi.mock("../api/client", () => ({
  default: { post: vi.fn() },
}))
vi.mock("../api/wiki", () => ({
  getWikiUploadLimit: vi.fn(),
}))

async function renderMarkdownEditor(
  ui: React.ReactElement,
  language: "en" | "zh" = "zh",
) {
  const instance = i18n.createInstance()
  await instance.init({
    lng: language,
    fallbackLng: false,
    resources: { en: { translation: en }, zh: { translation: zh } },
  })
  return render(<I18nextProvider i18n={instance}>{ui}</I18nextProvider>)
}

describe("MarkdownEditor", () => {
  beforeEach(() => {
    vi.mocked(getWikiUploadLimit).mockResolvedValue({ limit: 5 * 1024 * 1024, limit_mb: 5 })
    vi.mocked(api.post).mockResolvedValue({
      data: {
        filename: "AbC123.bin",
        original_name: "note.any",
        url: "/api/v1/bot-attachments/AbC123.bin",
        is_image: false,
        markdown: "[note.any](/api/v1/bot-attachments/AbC123.bin)",
      },
    })
  })

  it("renders the source editor first and switches to rendered Markdown preview", async () => {
    const onChange = vi.fn()
    await renderMarkdownEditor(<MarkdownEditor value={"# 标题\n\n**正文**"} onChange={onChange} />)

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

  it("forwards placeholder, rows, and id to the editable textarea", async () => {
    await renderMarkdownEditor(
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

  it("uses the active locale for source and preview controls", async () => {
    await renderMarkdownEditor(<MarkdownEditor value="" onChange={vi.fn()} />, "en")

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Markdown preview" })).toBeInTheDocument()
  })

  it("uploads a file and inserts the returned Markdown at the cursor", async () => {
    const onChange = vi.fn()
    await renderMarkdownEditor(<MarkdownEditor value="Before " onChange={onChange} />)

    const file = new File(["contents"], "note.any", { type: "application/octet-stream" })
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    textarea.setSelectionRange(7, 7)
    fireEvent.change(screen.getByLabelText("上传文件"), { target: { files: [file] } })

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/bot-attachments/upload",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } },
    ))
    expect(onChange).toHaveBeenLastCalledWith(
      "Before [note.any](/api/v1/bot-attachments/AbC123.bin)",
    )
  })

  it("renders distinct controls for file and image insertion", async () => {
    await renderMarkdownEditor(<MarkdownEditor value="" onChange={vi.fn()} />)

    expect(screen.getByLabelText("上传文件")).toHaveAttribute("type", "file")
    expect(screen.getByLabelText("上传图片")).toHaveAttribute("accept", "image/*")
  })
})
