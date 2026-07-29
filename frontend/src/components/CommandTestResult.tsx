import { useState } from "react"
import { Code2, Eye } from "lucide-react"

import MarkdownContent from "./MarkdownContent"

interface CommandTestResultProps {
  content: string
}

export default function CommandTestResult({ content }: CommandTestResultProps) {
  const [mode, setMode] = useState<"source" | "preview">("source")

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-light)] bg-[var(--bg-muted)]">
      <div className="flex items-center justify-between border-b border-[var(--border-light)] bg-[var(--bg-card)] px-2 py-1.5">
        <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          返回内容
        </span>
        <div className="flex overflow-hidden rounded-md border border-[var(--border)]">
          <button
            type="button"
            aria-pressed={mode === "source"}
            onClick={() => setMode("source")}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
              mode === "source"
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            <Code2 size={12} />
            源文件
          </button>
          <button
            type="button"
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
              mode === "preview"
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            <Eye size={12} />
            Markdown 预览
          </button>
        </div>
      </div>
      {mode === "source" ? (
        <pre
          aria-label="返回内容源文件"
          className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px]"
        >
          {content}
        </pre>
      ) : (
        <div className="max-h-80 overflow-y-auto bg-[var(--bg-card)] px-4 py-3">
          <MarkdownContent className="prose prose-sm max-w-none text-[12px] text-[var(--text-secondary)]">
            {content}
          </MarkdownContent>
        </div>
      )}
    </div>
  )
}
