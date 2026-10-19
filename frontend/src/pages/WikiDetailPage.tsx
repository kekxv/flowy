import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import MarkdownContent from "../components/MarkdownContent";
import Segmented from "../components/ui/Segmented";
import EmptyState from "../components/ui/EmptyState";
import {
  Edit3,
  Trash2,
  Globe,
  Lock,
  Save,
  X,
  UserPlus,
  Users,
  Clock,
  Image,
  Paperclip,
  Eye,
  BookOpen,
  Copy,
  Check,
  ListTree,
  ChevronRight,
  Star,
  FileText,
} from "lucide-react";
import {
  getWikiPage,
  updateWikiPage,
  deleteWikiPage,
  listCollaborators,
  addCollaborator,
  removeCollaborator,
  uploadWikiFile,
  getWikiUploadLimit,
  listWikiPages,
  type WikiPageData,
  type WikiCollaboratorData,
} from "../api/wiki";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { Skeleton } from "../components/ui/Skeleton";
import { formatDateTime } from "../utils/time";

interface UserData {
  id: string;
  username: string;
  display_name: string;
}

interface OutlineItem {
  id: string;
  text: string;
  level: number;
  line: number;
}

/** Headings (h1–h3) outside code fences, with ids used by both TOC and anchors. */
function buildOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let inFence = false;
  markdown.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = /^(#{1,3})\s+(.+?)\s*#*$/.exec(line);
    if (!match) return;
    const raw = match[2] ?? "";
    const text = raw
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .trim();
    if (!text) return;
    items.push({ id: `wiki-heading-${index + 1}`, text, level: (match[1] ?? "#").length, line: index + 1 });
  });
  return items;
}

export default function WikiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = typeof location.state?.from === "string" && (location.state.from === "/wiki" || location.state.from.startsWith("/wiki?")) ? location.state.from : "/wiki";
  const currentUser = useAuthStore((s) => s.user);

  const [page, setPage] = useState<WikiPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [weight, setWeight] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [uploadLimitMb, setUploadLimitMb] = useState(5);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reading aids: table of contents, copy-link feedback, related pages.
  const [activeHeading, setActiveHeading] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [related, setRelated] = useState<WikiPageData[]>([]);

  useEffect(() => {
    getWikiUploadLimit().then(d => setUploadLimitMb(d.limit_mb)).catch(() => {});
  }, []);

  // Collaborator state
  const [collaborators, setCollaborators] = useState<WikiCollaboratorData[]>([]);
  const [showCollabPanel, setShowCollabPanel] = useState(false);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [addingUserId, setAddingUserId] = useState("");

  const fetchPage = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getWikiPage(id);
      setPage(data);
      setTitle(data.title);
      setContent(data.content);
      setSummary(data.summary || "");
      setTags(data.tags);
      setIsPublic(data.is_public);
      setWeight(data.weight);
      const collabs = await listCollaborators(id);
      setCollaborators(collabs);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const outline = useMemo(() => (editing ? [] : buildOutline(page?.content || "")), [editing, page?.content]);

  // Anchor ids must come from the Markdown line numbers so they survive re-renders.
  const headingComponents = useMemo(() => {
    const idByLine = new Map(outline.map(item => [item.line, item.id]));
    const makeHeading = (Tag: "h1" | "h2" | "h3") =>
      function Heading({ node, children }: { node?: { position?: { start?: { line?: number } } }; children?: React.ReactNode }) {
        const line = node?.position?.start?.line;
        return <Tag id={line ? idByLine.get(line) : undefined}>{children}</Tag>;
      };
    return { h1: makeHeading("h1"), h2: makeHeading("h2"), h3: makeHeading("h3") };
  }, [outline]);

  // Highlight the heading currently in view (scroll-position based: the app
  // scrolls inside .ws-main, not the window).
  useEffect(() => {
    if (!outline.length) return;
    const scroller = document.querySelector(".ws-main") ?? window;
    const compute = () => {
      // The section occupying the upper third of the viewport is "current".
      const height = "clientHeight" in scroller ? scroller.clientHeight : window.innerHeight;
      const offset = height * 0.35;
      let current = outline[0]?.id ?? "";
      for (const item of outline) {
        const node = document.getElementById(item.id);
        if (!node) continue;
        if (node.getBoundingClientRect().top <= offset) current = item.id;
        else break;
      }
      setActiveHeading(current);
    };
    compute();
    scroller.addEventListener("scroll", compute, { passive: true });
    return () => scroller.removeEventListener("scroll", compute);
  }, [outline]);

  // Pages sharing a tag with the current one.
  useEffect(() => {
    if (!page) { setRelated([]); return; }
    const firstTag = (page.tags || "").split(",").map(tag => tag.trim()).filter(Boolean)[0];
    if (!firstTag) { setRelated([]); return; }
    let alive = true;
    (async () => {
      try {
        const res = await listWikiPages({ tag: firstTag, per_page: 6 });
        if (alive) setRelated(res.data.filter(item => item.id !== page.id).slice(0, 4));
      } catch {
        if (alive) setRelated([]);
      }
    })();
    return () => { alive = false; };
  }, [page?.id, page?.tags]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwner = page && currentUser && page.owner_id === currentUser.id;
  const isCollaborator =
    page && currentUser && page.collaborator_ids.includes(currentUser.id);
  const isAdmin = currentUser?.role === "admin";
  const canEdit = isAdmin || isOwner || isCollaborator;
  const canDelete = isAdmin || isOwner;

  const handleSave = async () => {
    if (!page) return;
    setSaving(true);
    try {
      const updated = await updateWikiPage(page.id, {
        title,
        content,
        summary,
        tags,
        is_public: isPublic,
        weight,
      });
      setPage(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!page || !canDelete) return;
    if (!confirm(t("wiki.confirm_delete", "Are you sure you want to delete this page?"))) return;
    await deleteWikiPage(page.id);
    navigate(returnTo);
  };

  const dirty = Boolean(page && editing && (
    title !== page.title ||
    content !== page.content ||
    summary !== (page.summary || "") ||
    tags !== page.tags ||
    isPublic !== page.is_public ||
    weight !== page.weight
  ));

  // Warn before a full page unload with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const handleCancel = () => {
    if (!page) return;
    if (dirty && !confirm(t("wiki.discard_changes", "放弃未保存的修改？"))) return;
    setTitle(page.title);
    setContent(page.content);
    setSummary(page.summary || "");
    setTags(page.tags);
    setIsPublic(page.is_public);
    setWeight(page.weight);
    setEditing(false);
  };

  // ⌘/Ctrl + S saves, Esc leaves edit mode (with a confirm when dirty).
  useEffect(() => {
    if (!editing) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving) void handleSave();
      } else if (event.key === "Escape") {
        event.preventDefault();
        handleCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const openCollabPanel = async () => {
    if (!page) return;
    const users: UserData[] = await api.get("/users").then((r) => r.data);
    setAllUsers(users.filter((u) => u.id !== currentUser?.id && u.id !== page.owner_id));
    setShowCollabPanel(true);
  };

  const handleAddCollaborator = async () => {
    if (!page || !addingUserId) return;
    await addCollaborator(page.id, addingUserId, "editor");
    setAddingUserId("");
    // Refresh collaborators
    const collabs = await listCollaborators(page.id);
    setCollaborators(collabs);
  };

  const handleRemoveCollaborator = async (userId: string) => {
    if (!page) return;
    await removeCollaborator(page.id, userId);
    const collabs = await listCollaborators(page.id);
    setCollaborators(collabs);
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      !collaborators.some((c) => c.user_id === u.id) &&
      (u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.display_name.toLowerCase().includes(userSearch.toLowerCase()))
  );

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
      e.target.value = "";
    }
  };

  if (loading) return (
    <div className="page-enter mx-auto max-w-4xl space-y-3">
      <Skeleton className="h-7 w-28" />
      <div className="panel p-5">
        <Skeleton className="h-5 w-64" />
        <div className="mt-5 space-y-2.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
    </div>
  );
  if (!page) {
    return (
      <EmptyState icon={BookOpen} title={t("wiki.not_found", "Page not found")} />
    );
  }

  const tagList = (page.tags || "").split(",").map(tag => tag.trim()).filter(Boolean);

  return (
    <div className="page-enter mx-auto max-w-6xl space-y-3">
      {/* Breadcrumb + actions (sticky while editing so Save stays reachable) */}
      <div className={`flex flex-wrap items-center gap-2 ${editing
        ? "sticky top-0 z-20 -mx-1 rounded-[8px] bg-[var(--bg)]/90 px-1 py-1.5 backdrop-blur"
        : ""}`}>
        <nav className="flex min-w-0 items-center gap-1 text-[11.5px] text-[var(--text-faint)]" aria-label="breadcrumb">
          <Link to={returnTo} className="transition-colors hover:text-[var(--primary)]">
            {t("wiki.title", "知识库")}
          </Link>
          <ChevronRight size={11} className="shrink-0 opacity-60" />
          <span className="truncate font-medium text-[var(--text-secondary)]">{editing ? title || page.title : page.title}</span>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          {!editing && (
            <button onClick={() => void handleCopyLink()} className="btn btn-ghost btn-sm" title={t("wiki.copy_link", "复制链接")}>
              {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              <span className="hidden sm:inline">{copied ? t("wiki.link_copied", "已复制") : t("wiki.copy_link", "复制链接")}</span>
            </button>
          )}
          {canEdit && !editing && (
            <>
              <button onClick={() => setEditing(true)} className="btn btn-outline btn-sm">
                <Edit3 size={14} />
                {t("common.edit", "Edit")}
              </button>
              {isOwner && (
                <button onClick={openCollabPanel} className="btn btn-ghost btn-sm" title={t("wiki.collaborators", "Collaborators")}>
                  <Users size={14} />
                  <span className="hidden sm:inline">{t("wiki.collaborators", "Collaborators")}</span>
                  {collaborators.length > 0 && <span className="ws-count">{collaborators.length}</span>}
                </button>
              )}
            </>
          )}
          {editing && (
            <>
              <button onClick={handleSave} disabled={saving || !dirty} className="btn btn-primary btn-sm">
                <Save size={14} />
                {saving ? t("common.saving", "Saving...") : t("common.save", "Save")}
              </button>
              <button onClick={handleCancel} className="btn btn-ghost btn-sm">
                <X size={14} />
                {t("common.cancel", "Cancel")}
              </button>
            </>
          )}
          {canDelete && !editing && (
            <button aria-label={t("wiki.delete_page", "Delete page")} onClick={handleDelete} className="btn btn-ghost btn-sm text-red-500 hover:bg-red-50">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Title panel */}
      <div className="panel p-4 sm:p-5">
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input text-[17px] font-semibold"
            placeholder={t("wiki.page_title", "Page title")}
          />
        ) : (
          <div className="flex flex-wrap items-start gap-2">
            <h1 className="text-[19px] font-semibold leading-snug tracking-[-.015em] text-[var(--text)]">{page.title}</h1>
            {page.is_public ? (
              <span className="chip chip-emerald mt-0.5 shrink-0">
                <Globe size={10} />
                {t("wiki.public", "Public")}
              </span>
            ) : (
              <span className="chip chip-gray mt-0.5 shrink-0">
                <Lock size={10} />
                {t("wiki.private", "Private")}
              </span>
            )}
            {page.weight > 0 && (
              <span className="chip chip-amber mt-0.5 shrink-0"><Star size={10} />{page.weight}</span>
            )}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[var(--primary-subtle)] text-[9px] font-bold text-[var(--primary)]">
              {(page.owner_display_name || page.owner_name || "?").charAt(0).toUpperCase()}
            </span>
            {page.owner_display_name || page.owner_name}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock size={11} className="opacity-70" />
            {t("wiki.updated_at", "更新时间")} {formatDateTime(page.updated_at, i18n?.language)}
          </span>
          {tagList.length > 0 && (
            <span className="flex flex-wrap items-center gap-1">
              {tagList.map(tag => (
                <Link
                  key={tag}
                  to={`/wiki?tag=${encodeURIComponent(tag)}`}
                  className="rounded-[4px] bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--primary-subtle)] hover:text-[var(--primary)]"
                >
                  {tag}
                </Link>
              ))}
            </span>
          )}
          {outline.length > 1 && (
            <button
              onClick={() => setTocOpen(open => !open)}
              className="ml-auto inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] xl:hidden"
            >
              <ListTree size={12} />{t("wiki.toc", "目录")} ({outline.length})
            </button>
          )}
        </div>
      </div>

      {showCollabPanel && (
        <div className="panel mt-3">
          <div className="panel-head">
            <h2 className="panel-title">
              <Users size={12} />{t("wiki.collaborators", "协作者")}
              {collaborators.length > 0 && <span className="ws-count">{collaborators.length}</span>}
            </h2>
            <button
              onClick={() => setShowCollabPanel(false)}
              className="rounded-[6px] p-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              title={t("common.close", "关闭")}
            >
              <X size={14} />
            </button>
          </div>
          <div className="px-4 py-3.5">
            {/* Current collaborators */}
            {collaborators.length > 0 && (
              <div className="mb-4 space-y-1.5">
                {collaborators.map((c) => (
                  <div key={c.user_id} className="flex items-center gap-3 rounded-[8px] bg-[var(--bg-muted)] p-2.5 transition-colors hover:bg-[var(--bg-hover)]">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[11px] font-bold text-[var(--primary)] ring-1 ring-[var(--primary)]/10">
                      {(c.display_name || c.username).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">
                        {c.display_name || c.username}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">@{c.username}</div>
                    </div>
                    <span className="text-[11px] text-[var(--primary)] bg-[var(--primary)]/8 rounded-full px-2 py-0.5 font-medium">
                      {t(`wiki.permission.${c.permission}`, c.permission === "editor" ? "可编辑" : "只读")}
                    </span>
                    {isOwner && (
                      <button
                        onClick={() => handleRemoveCollaborator(c.user_id)}
                        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add collaborator */}
            {isOwner && (
              <div className={collaborators.length > 0 ? "border-t border-[var(--border-light)] pt-4" : ""}>
                <div className="flex items-center gap-2 mb-2">
                  <UserPlus size={14} className="text-[var(--text-muted)]" />
                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                    {t("wiki.add_collaborator", "Add Collaborator")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder={t("wiki.search_user", "搜索用户…")}
                    className="input min-w-0 flex-1"
                  />
                  {/* .input 自带 width:100%，定宽放在外层，避免和工具类打架 */}
                  <div className="w-40 shrink-0">
                    <select
                      value={addingUserId}
                      onChange={(e) => setAddingUserId(e.target.value)}
                      className="input"
                    >
                      <option value="">{t("wiki.select_user", "选择用户")}</option>
                      {filteredUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name || u.username}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleAddCollaborator}
                    disabled={!addingUserId}
                    className="btn btn-primary btn-sm"
                  >
                    {t("common.add", "Add")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile outline */}
      {tocOpen && outline.length > 1 && !editing && (
        <div className="panel p-3 xl:hidden">
          <p className="panel-title mb-2"><ListTree size={12} />{t("wiki.toc", "目录")}</p>
          <ol className="space-y-0.5">
            {outline.map(item => (
              <li key={item.id} style={{ paddingLeft: `${(item.level - 1) * 12}px` }}>
                <button
                  onClick={() => {
                    document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    setTocOpen(false);
                  }}
                  className="w-full truncate rounded-[6px] px-2 py-1 text-left text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_212px]">
        {/* Content */}
        <div ref={contentRef} className="panel min-w-0 p-4 sm:p-6">
          {editing ? (
            <div className="space-y-4">
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
              <div>
                <label className="field-label">
                  {t("wiki.content", "Content")} (Markdown)
                </label>
                <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                  {/* Upload toolbar */}
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
                      className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--primary)] disabled:opacity-50"
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
                      className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--primary)] disabled:opacity-50"
                      title={t("wiki.upload_file", `Upload File (max {{mb}}MB)`, { mb: uploadLimitMb })}
                    >
                      <Paperclip size={15} />
                    </button>
                    {uploading && (
                      <span className="ml-1 text-[11px] text-[var(--text-muted)]">
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
                    <div className="prose prose-sm min-h-[400px] max-w-none bg-[var(--bg-card)] p-4 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                      {content ? (
                        <MarkdownContent>{content}</MarkdownContent>
                      ) : (
                        <p className="italic text-[var(--text-muted)]">{t("wiki.no_content_preview", "No content to preview")}</p>
                      )}
                    </div>
                  ) : (
                    <textarea
                      ref={textareaRef}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={18}
                      className="w-full resize-y border-0 bg-[var(--bg-card)] p-3 font-mono text-[13px] leading-relaxed outline-none"
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
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)]"
                    />
                    <span className="text-[13px] text-[var(--text-secondary)]">
                      {isPublic ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
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
              <p className="flex items-center gap-1.5 border-t border-[var(--border-light)] pt-3 text-[11px] text-[var(--text-faint)]">
                <Save size={11} />
                {dirty
                  ? t("wiki.unsaved_hint", "有未保存的修改 · ⌘/Ctrl + S 保存，Esc 取消")
                  : t("wiki.no_changes_hint", "没有未保存的修改")}
              </p>
            </div>
          ) : (
            <>
              {page.summary && (
                <div className="mb-5 border-b border-[var(--border-light)] pb-5">
                  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[.08em] text-[var(--text-faint)]">
                    {t("wiki.overview", "概要")}
                  </p>
                  <div className="prose prose-sm max-w-none text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
                    <MarkdownContent>{page.summary}</MarkdownContent>
                  </div>
                </div>
              )}
              <div className="prose prose-sm max-w-[74ch] text-[14px] leading-relaxed text-[var(--text-secondary)]">
                <MarkdownContent components={headingComponents}>{page.content || t("wiki.empty_content", "No content")}</MarkdownContent>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-light)] pt-3 text-[11px] text-[var(--text-faint)]">
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={11} />
                  {t("wiki.last_edited_by", "最后由 {{name}} 编辑于 {{date}}", {
                    name: page.owner_display_name || page.owner_name,
                    date: formatDateTime(page.updated_at, i18n?.language),
                  })}
                </span>
                {canEdit && (
                  <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline">
                    <Edit3 size={11} />{t("wiki.improve_page", "补充这一页")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Desktop outline */}
        {!editing && outline.length > 1 && (
          <aside className="hidden xl:block">
            <div className="sticky top-2 space-y-3">
              <div className="panel p-3">
                <p className="panel-title mb-2"><ListTree size={12} />{t("wiki.toc", "目录")}</p>
                <nav className="max-h-[calc(100vh-220px)] overflow-y-auto">
                  <ol className="space-y-0.5 border-l border-[var(--border-light)]">
                    {outline.map(item => (
                      <li key={item.id} style={{ paddingLeft: `${(item.level - 1) * 9}px` }}>
                        <button
                          onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                          className={`block w-full truncate border-l-2 py-1 pl-2 text-left text-[11.5px] transition-colors ${activeHeading === item.id
                            ? "border-[var(--primary)] font-medium text-[var(--primary)]"
                            : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                          style={{ marginLeft: "-1px" }}
                          title={item.text}
                        >
                          {item.text}
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Related pages */}
      {related.length > 0 && !editing && (
        <div className="panel overflow-hidden">
          <div className="panel-head">
            <h2 className="panel-title"><FileText size={12} />{t("wiki.related", "相关页面")}</h2>
            <Link to={`/wiki?tag=${encodeURIComponent(tagList[0] ?? "")}`} className="text-[11px] text-[var(--primary)] hover:underline">
              {t("wiki.more_with_tag", "更多同标签页面")}
            </Link>
          </div>
          <div className="divide-y divide-[var(--border-light)]">
            {related.map(item => (
              <Link
                key={item.id}
                to={`/wiki/${item.id}`}
                state={{ from: location.pathname + location.search }}
                className="group flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-[var(--bg-hover)]"
              >
                <BookOpen size={13} className="shrink-0 text-[var(--text-faint)] transition-colors group-hover:text-[var(--primary)]" />
                <span className="truncate text-[12.5px] text-[var(--text-secondary)] transition-colors group-hover:text-[var(--primary)]">{item.title}</span>
                <span className="ml-auto shrink-0 text-[10.5px] text-[var(--text-faint)]">{item.owner_display_name || item.owner_name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}