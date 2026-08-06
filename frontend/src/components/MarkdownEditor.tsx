import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, ImageUp } from "lucide-react";

import api from "../api/client";
import { getWikiUploadLimit } from "../api/wiki";
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
  const [uploading, setUploading] = useState(false);
  const [uploadLimitMb, setUploadLimitMb] = useState(5);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getWikiUploadLimit().then(({ limit_mb }) => setUploadLimitMb(limit_mb)).catch(() => {});
  }, []);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > uploadLimitMb * 1024 * 1024) {
      alert(t("markdown_editor.file_too_large", "文件大小超过 {{mb}}MB 限制", { mb: uploadLimitMb }));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post("/bot-attachments/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const markdown = response.data.markdown as string;
      const start = textareaRef.current?.selectionStart ?? value.length;
      const end = textareaRef.current?.selectionEnd ?? start;
      onChange(`${value.slice(0, start)}${markdown}${value.slice(end)}`);
    } catch (error: any) {
      const message = error?.response?.data?.detail || error?.message;
      alert(t("markdown_editor.upload_failed", "上传失败") + (message ? `: ${message}` : ""));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`overflow-hidden rounded-lg border border-[var(--border)] ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-light)] bg-[var(--bg-muted)] p-1.5">
        <div className="flex items-center gap-1">
          <input ref={imageInputRef} aria-label={t("markdown_editor.upload_image", "上传图片")} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <input ref={fileInputRef} aria-label={t("markdown_editor.upload_file", "上传文件")} type="file" className="hidden" onChange={handleUpload} />
          <button type="button" disabled={uploading} onClick={() => imageInputRef.current?.click()} title={t("markdown_editor.upload_image", "上传图片")}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-white hover:text-[var(--text)] disabled:opacity-50">
            <ImageUp size={13} /> {t("markdown_editor.upload_image", "上传图片")}
          </button>
          <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} title={t("markdown_editor.upload_file", "上传文件")}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-white hover:text-[var(--text)] disabled:opacity-50">
            <FileUp size={13} /> {uploading ? t("markdown_editor.uploading", "上传中...") : t("markdown_editor.upload_file", "上传文件")}
          </button>
          <span className="hidden text-[10px] text-[var(--text-muted)] sm:inline">{t("markdown_editor.max_size", "最大 {{mb}}MB", { mb: uploadLimitMb })}</span>
        </div>
        <div className="flex gap-1">
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
      </div>
      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
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
