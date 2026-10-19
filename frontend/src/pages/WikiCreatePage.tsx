import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Globe, Lock, Image, Paperclip, Eye, Edit3, FileText, Sparkles, X } from "lucide-react";
import MarkdownContent from "../components/MarkdownContent";
import Segmented from "../components/ui/Segmented";
import { createWikiPage, uploadWikiFile, getWikiUploadLimit } from "../api/wiki";

const DEFAULT_LIMIT_MB = 5;

interface WikiTemplate {
  key: string;
  label: string;
  hint: string;
  summary: string;
  content: string;
}

const TEMPLATES: WikiTemplate[] = [
  {
    key: "blank",
    label: "空白页面",
    hint: "从零开始写",
    summary: "",
    content: "",
  },
  {
    key: "design",
    label: "技术方案",
    hint: "背景 · 方案 · 风险",
    summary: "一句话说明要解决什么问题，以及最终采用的做法。",
    content: `## 背景

为什么现在要做这件事。

## 目标

- [ ] 目标一
- [ ] 目标二

## 方案

关键设计、数据流、接口约定。

| 项 | 说明 |
| --- | --- |
| 改动范围 | |
| 兼容性 | |

## 风险与回滚

1. 风险点与应对
2. 回滚步骤

## 参考

- 相关 issue / 里程碑
`,
  },
  {
    key: "runbook",
    label: "排障手册",
    hint: "现象 · 定位 · 处置",
    summary: "出现什么现象时使用本手册，以及最快的恢复方式。",
    content: `## 现象

用户或监控侧看到的异常。

## 快速定位

\`\`\`bash
# 常用排查命令
journalctl -u flowy -n 200 --no-pager
\`\`\`

## 处置步骤

1. 确认影响范围
2. 执行恢复操作
3. 验证结果

## 复盘

- 根因：
- 后续改进：
`,
  },
  {
    key: "meeting",
    label: "会议纪要",
    hint: "结论 · 待办",
    summary: "会议结论与后续待办，方便没参会的人快速对齐。",
    content: `## 时间与参与人

- 时间：
- 参与人：

## 议题

1.

## 结论

-

## 待办

- [ ] 事项 — 负责人 — 截止时间
`,
  },
];

export default function WikiCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = typeof location.state?.from === "string" && (location.state.from === "/wiki" || location.state.from.startsWith("/wiki?")) ? location.state.from : "/wiki";
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [weight, setWeight] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [uploadLimitMb, setUploadLimitMb] = useState(DEFAULT_LIMIT_MB);
  const [template, setTemplate] = useState("blank");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getWikiUploadLimit().then(d => setUploadLimitMb(d.limit_mb)).catch(() => {});
  }, []);

  const applyTemplate = (next: WikiTemplate) => {
    if (next.key === "blank") {
      setTemplate("blank");
      return;
    }
    const hasContent = content.trim().length > 0;
    if (hasContent && !confirm(t("wiki.template_confirm", "用模板覆盖当前内容？"))) return;
    setTemplate(next.key);
    setContent(next.content);
    setSummary(next.summary);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const page = await createWikiPage({ title, summary, content, tags, is_public: isPublic, weight });
      navigate(`/wiki/${page.id}`, { state: { from: returnTo } });
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
    if (file.size > uploadLimitMb * 1024 * 1024) {
      alert(t("wiki.file_too_large", `File size exceeds {{mb}}MB limit`, { mb: uploadLimitMb }));
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
    <div className="page-enter mx-auto max-w-4xl space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => navigate(returnTo)} className="btn btn-ghost btn-sm">
          <ArrowLeft size={14} />
          {t("common.back", "Back")}
        </button>
        <h1 className="flex-1 truncate text-[15px] font-semibold tracking-tight text-[var(--text)]">
          {t("wiki.new_page", "New Wiki Page")}
        </h1>
        <button onClick={handleSave} disabled={saving || !title.trim()} className="btn btn-primary btn-sm">
          <Save size={13} />
          {saving ? t("common.saving", "Saving...") : t("common.save", "Save")}
        </button>
      </div>

      {/* Form */}
      <div className="panel space-y-4 p-4 sm:p-5">
        {/* Starter templates */}
        <div className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg-muted)]/60 p-2.5">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            <Sparkles size={12} className="text-[var(--primary)]" />
            {t("wiki.start_from_template", "从模板开始")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => applyTemplate(item)}
                className={`flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1.5 text-left transition-colors ${template === item.key
                  ? "border-[var(--primary)] bg-white shadow-[0_0_0_3px_rgba(37,99,235,.08)]"
                  : "border-[var(--border)] bg-white/70 hover:border-[var(--border-strong)] hover:bg-white"}`}
              >
                <FileText size={12} className={template === item.key ? "text-[var(--primary)]" : "text-[var(--text-faint)]"} />
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-medium text-[var(--text)]">{item.label}</span>
                  <span className="block text-[10px] text-[var(--text-faint)]">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="field-label">
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

        <div>
          <label htmlFor="wiki-summary" className="field-label">
            {t("wiki.summary", "Summary")} ({t("wiki.markdown", "Markdown")})
          </label>
          <textarea
            id="wiki-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={4000}
            rows={4}
            className="input resize-y font-mono text-[13px] leading-relaxed"
            placeholder={t("wiki.summary_placeholder", "A short Markdown overview shown in search results...")}
          />
        </div>

        {/* Content with toolbar */}
        <div>
          <label className="field-label">
            {t("wiki.content", "Content")} (Markdown)
          </label>
          <div className="overflow-hidden rounded-[8px] border border-[var(--border)]">
            {/* Toolbar */}
            <div className="flex items-center gap-1 border-b border-[var(--border-light)] bg-[var(--bg-muted)] px-2 py-1.5">
              <input
                ref={imageInputRef}
                type="file"
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
                className="hidden"
                onChange={(e) => handleFileUpload(e)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--primary)] transition-colors disabled:opacity-50"
                title={t("wiki.upload_file", `Upload File (max {{mb}}MB)`, { mb: uploadLimitMb })}
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
                {t("wiki.max_size", `Max {{mb}}MB`, { mb: uploadLimitMb })}
              </span>
              <div className="ml-2">
                <Segmented
                  ariaLabel={t("wiki.preview_mode", "Preview")}
                  value={preview ? "preview" : "edit"}
                  onChange={v => setPreview(v === "preview")}
                  items={[
                    { key: "edit", label: <><Edit3 size={12} />{t("wiki.edit_mode", "Edit")}</> },
                    { key: "preview", label: <><Eye size={12} />{t("wiki.preview_mode", "Preview")}</> },
                  ]}
                />
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

        <div className="flex flex-wrap gap-4">
          <div className="min-w-[180px] flex-1">
            <label className="field-label">
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
            <label className="field-label">
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

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-light)] pt-3">
          <p className="text-[11px] text-[var(--text-faint)]">
            {t("wiki.create_hint", "保存后可以继续补充协作人和相关内容。")}
          </p>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => navigate(returnTo)} className="btn btn-ghost btn-sm">
              <X size={13} />{t("common.cancel", "Cancel")}
            </button>
            <button type="button" onClick={handleSave} disabled={saving || !title.trim()} className="btn btn-primary btn-sm">
              <Save size={13} />
              {saving ? t("common.saving", "Saving...") : t("wiki.create_page", "创建页面")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
