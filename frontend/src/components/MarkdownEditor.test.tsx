import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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
    vi.clearAllMocks()
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

  it("uploads a dropped file only after confirmation", async () => {
    const onChange = vi.fn()
    vi.stubGlobal("confirm", vi.fn(() => true))
    await renderMarkdownEditor(<MarkdownEditor value="" onChange={onChange} />)

    const file = new File(["contents"], "dropped.any", { type: "application/octet-stream" })
    fireEvent.drop(screen.getByTestId("markdown-editor-dropzone"), {
      dataTransfer: { files: [file] },
    })

    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith(
      "/bot-attachments/upload",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } },
    )
    vi.unstubAllGlobals()
  })

  it("does not upload a dropped file when confirmation is cancelled", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false))
    await renderMarkdownEditor(<MarkdownEditor value="" onChange={vi.fn()} />)

    const file = new File(["contents"], "dropped.any", { type: "application/octet-stream" })
    fireEvent.drop(screen.getByTestId("markdown-editor-dropzone"), {
      dataTransfer: { files: [file] },
    })

    expect(window.confirm).toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("renders distinct controls for file and image insertion", async () => {
    await renderMarkdownEditor(<MarkdownEditor value="" onChange={vi.fn()} />)

    expect(screen.getByLabelText("上传文件")).toHaveAttribute("type", "file")
    expect(screen.getByLabelText("上传图片")).toHaveAttribute("accept", "image/*")
  })
})

describe('chart insertion dialog', () => {
  it('collects chart data and inserts valid Markdown at the saved selection without submitting the report', async () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn(event => event.preventDefault())
    await renderMarkdownEditor(<form onSubmit={onSubmit}><MarkdownEditor value="Before REPLACE After" onChange={onChange} reportVisuals /></form>)
    const editor = screen.getByRole('textbox') as HTMLTextAreaElement
    editor.setSelectionRange(7, 14)
    fireEvent.click(screen.getByRole('button', { name: '插入图表' }))
    const dialog = screen.getByRole('dialog', { name: '插入图表' })
    fireEvent.change(within(dialog).getByLabelText('图表标题'), { target: { value: '模块验证结果' } })
    fireEvent.change(within(dialog).getByLabelText('第 1 行分类'), { target: { value: '登录' } })
    fireEvent.change(within(dialog).getByLabelText('第 1 行第 1 组数值'), { target: { value: '18' } })
    fireEvent.change(within(dialog).getByLabelText('第 1 行第 2 组数值'), { target: { value: '2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '插入图表' }))
    const inserted = onChange.mock.lastCall![0] as string
    expect(inserted.startsWith('Before ')).toBe(true)
    expect(inserted.endsWith(' After')).toBe(true)
    expect(inserted).not.toContain('REPLACE')
    const spec = JSON.parse(inserted.match(/```chart\n([\s\S]*?)\n```/)![1]!)
    expect(spec).toMatchObject({ type: 'bar', title: '模块验证结果' })
    expect(spec.labels[0]).toBe('登录')
    expect(spec.series.map((series: { data: number[] }) => series.data[0])).toEqual([18, 2])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('validates empty numeric cells and pie values instead of silently inserting zero', async () => {
    await renderMarkdownEditor(<MarkdownEditor value="" onChange={vi.fn()} reportVisuals />)
    fireEvent.click(screen.getByRole('button', { name: '插入图表' }))
    const dialog = screen.getByRole('dialog')
    const value = within(dialog).getByLabelText('第 1 行第 1 组数值')
    fireEvent.change(value, { target: { value: '' } })
    expect(within(dialog).getByRole('button', { name: '插入图表' })).toBeDisabled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('数值')
    fireEvent.click(within(dialog).getByRole('button', { name: '饼图' }))
    fireEvent.change(value, { target: { value: '-1' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('不能为负')
    expect(within(dialog).getByRole('button', { name: '插入图表' })).toBeDisabled()
    fireEvent.change(value, { target: { value: '0' } })
    expect(within(dialog).getByRole('button', { name: '插入图表' })).toBeEnabled()
  })

  it('supports adding and removing data rows and series, and pie inserts only the visible series', async () => {
    const onChange = vi.fn()
    await renderMarkdownEditor(<MarkdownEditor value="" onChange={onChange} reportVisuals />)
    fireEvent.click(screen.getByRole('button', { name: '插入图表' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '添加分类' }))
    fireEvent.change(within(dialog).getByLabelText('第 4 行分类'), { target: { value: '导出' } })
    fireEvent.change(within(dialog).getByLabelText('第 4 行第 1 组数值'), { target: { value: '7.5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '添加数据组' }))
    expect(within(dialog).getByLabelText('第 3 组名称')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: '删除第 3 组' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '删除第 2 行' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '饼图' }))
    expect(within(dialog).queryByLabelText('第 2 组名称')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: '插入图表' }))
    const spec = JSON.parse(onChange.mock.lastCall![0].match(/```chart\n([\s\S]*?)\n```/)[1])
    expect(spec.type).toBe('pie')
    expect(spec.series).toHaveLength(1)
    expect(spec.labels).toHaveLength(3)
    expect(spec.labels[2]).toBe('导出')
    expect(spec.series[0].data[2]).toBe(7.5)
  })

  it('cancels without changing content and keeps chart insertion out of ordinary editors', async () => {
    const onChange = vi.fn()
    const { unmount } = await renderMarkdownEditor(<MarkdownEditor value="已有内容" onChange={onChange} reportVisuals />)
    fireEvent.click(screen.getByRole('button', { name: '插入图表' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    unmount()
    await renderMarkdownEditor(<MarkdownEditor value="" onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '插入图表' })).not.toBeInTheDocument()
  })

  it('builds a flowchart from text steps without requiring diagram syntax', async () => {
    const onChange = vi.fn()
    await renderMarkdownEditor(<MarkdownEditor value="" onChange={onChange} reportVisuals />)
    fireEvent.click(screen.getByRole('button', { name: '插入图表' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '流程图' }))
    fireEvent.change(within(dialog).getByLabelText('第 1 个步骤'), { target: { value: '准备"环境' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '插入图表' }))
    const markdown = onChange.mock.lastCall![0] as string
    expect(markdown).toContain('```mermaid')
    expect(markdown).toContain('-->')
    expect(markdown).not.toContain('["准备"环境"]')
  })
})

it('localizes the chart dialog controls, data defaults and validation in English', async () => {
  await renderMarkdownEditor(<MarkdownEditor value="" onChange={vi.fn()} reportVisuals />, 'en')
  fireEvent.click(screen.getByRole('button', { name: 'Insert chart' }))
  const dialog = screen.getByRole('dialog', { name: 'Insert chart' })
  expect(within(dialog).getByRole('button', { name: 'Bar chart' })).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Chart title')).toHaveValue('Test case results')
  expect(within(dialog).getByLabelText('Category in row 1')).toHaveValue('Login')
  fireEvent.change(within(dialog).getByLabelText('Value in row 1, series 1'), { target: { value: '' } })
  expect(within(dialog).getByRole('alert')).toHaveTextContent('row 1')
  expect(within(dialog).getByRole('button', { name: 'Insert chart' })).toBeDisabled()
  expect(dialog.textContent).not.toMatch(/[\p{Script=Han}]/u)
})
