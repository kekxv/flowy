import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Globe, Lock, Image, Paperclip, Eye, Edit3 } from "lucide-react";
import MarkdownContent from "../components/MarkdownContent";
import { createWikiPage, uploadWikiFile } from "../api/wiki";

export default function WikiCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [weight, setWeight] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const page = await createWikiPage({ title, content, tags, is_public: isPublic, weight });
      navigate(`/wiki/${page.id}`);
    } finally {
      setSaving(false);
    }
  };

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setContent((prev) => prev + text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const newContent = before + text + after;
    setContent(newContent);
    // Restore cursor after insert
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(t("wiki.file_too_large", "File size exceeds 5MB limit"));
      return;
    }
    setUploading(true);
    try {
      const result = await uploadWikiFile(file);
      insertAtCursor(result.markdown + "\n");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      alert(t("wiki.upload_failed", "Upload failed") + (msg ? `: ${msg}` : ""));
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = "";
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/wiki")}
          className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold tracking-tight flex-1">
          {t("wiki.new_page", "New Wiki Page")}
        </h1>
        <button onClick={handleSave} disabled={saving || !title.trim()} className="btn btn-primary">
          <Save size={14} />
          {saving ? t("common.saving", "Saving...") : t("common.save", "Save")}
        </button>
      </div>

      {/* Form */}
      <div className="card rounded-xl p-5 space-y-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">
            {t("wiki.page_title", "Title")}
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input text-lg font-bold"
            placeholder={t("wiki.page_title_placeholder", "Enter page title...")}
            autoFocus
          />
        </div>

        {/* Content with toolbar */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">
            {t("wiki.content", "Content")} (Markdown)
          </label>
          <div className="rounded-lg border border-[var(--border)] overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg)] px-2 py-1.5">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileUpload(e)}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading}
                className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--primary)] transition-colors disabled:opacity-50"
                title={t("wiki.upload_image", "Upload Image")}
              >
                <Image size={15} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.zip,.rar"
                className="hidden"
                onChange={(e) => handleFileUpload(e)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--primary)] transition-colors disabled:opacity-50"
                title={t("wiki.upload_file", "Upload File (max 5MB)")}
              >
                <Paperclip size={15} />
              </button>
              {uploading && (
                <span className="text-[11px] text-[var(--text-muted)] ml-1">
                  {t("wiki.uploading", "Uploading...")}
                </span>
              )}
              <div className="flex-1" />
              <span className="text-[10px] text-[var(--text-muted)]">
                {t("wiki.max_5mb", "Max 5MB")}
              </span>
              <div className="ml-2 flex rounded-md border border-[var(--border)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPreview(false)}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                    !preview
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  }`}
                  title={t("wiki.edit_mode", "Edit")}
                >
                  <Edit3 size={12} />
                  {t("wiki.edit_mode", "Edit")}
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(true)}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                    preview
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                  }`}
                  title={t("wiki.preview_mode", "Preview")}
                >
                  <Eye size={12} />
                  {t("wiki.preview_mode", "Preview")}
                </button>
              </div>
            </div>
            {preview ? (
              <div className="prose prose-sm max-w-none min-h-[360px] p-4 text-[14px] leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-card)]">
                {content ? (
                  <MarkdownContent>{content}</MarkdownContent>
                ) : (
                  <p className="text-[var(--text-muted)] italic">{t("wiki.no_content_preview", "No content to preview")}</p>
                )}
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={16}
                className="w-full border-0 p-3 font-mono text-[13px] leading-relaxed resize-y outline-none bg-[var(--bg-card)]"
                placeholder={t("wiki.content_placeholder", "Write your content in Markdown...")}
              />
            )}
          </div>
        </div>

        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">
              {t("wiki.tags", "Tags")} ({t("wiki.tags_hint", "comma separated")})
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="input"
              placeholder={t("wiki.tags_placeholder", "tag1, tag2, tag3")}
            />
          </div>
          <div className="w-28">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">
              {t("wiki.weight", "Weight")}
            </label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(parseInt(e.target.value) || 0)}
              min={0}
              max={9999}
              className="input"
              title={t("wiki.weight_hint", "Higher weight = higher priority in listings and search")}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)]"
              />
              <span className="text-[13px] text-[var(--text-secondary)]">
                {isPublic ? (
                  <span className="inline-flex items-center gap-1 text-green-600">
                    <Globe size={14} />
                    {t("wiki.public", "Public")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Lock size={14} />
                    {t("wiki.private", "Private")}
                  </span>
                )}
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
