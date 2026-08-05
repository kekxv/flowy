import { useState } from "react";
import { useTranslation } from "react-i18next";

import MarkdownContent from "./MarkdownContent";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
  className?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 6,
  id,
  className = "",
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  return (
    <div className={`overflow-hidden rounded-lg border border-[var(--border)] ${className}`}>
      <div className="flex justify-end gap-1 border-b border-[var(--border-light)] bg-[var(--bg-muted)] p-1.5">
        <button
          type="button"
          aria-pressed={mode === "edit"}
          onClick={() => setMode("edit")}
          className={`rounded px-2 py-1 text-[11px] transition-colors ${mode === "edit" ? "bg-white font-medium text-[var(--text)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
        >
          {t("markdown_editor.edit", "编辑")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "preview"}
          onClick={() => setMode("preview")}
          className={`rounded px-2 py-1 text-[11px] transition-colors ${mode === "preview" ? "bg-white font-medium text-[var(--text)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
        >
          {t("markdown_editor.preview", "Markdown 预览")}
        </button>
      </div>
      {mode === "edit" ? (
        <textarea
          id={id}
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="input min-h-[100px] resize-y rounded-none border-0 text-sm"
        />
      ) : (
        <div className="prose prose-sm min-h-[100px] max-w-none p-3 text-[var(--text-secondary)]">
          <MarkdownContent>{value || "—"}</MarkdownContent>
        </div>
      )}
    </div>
  );
}
