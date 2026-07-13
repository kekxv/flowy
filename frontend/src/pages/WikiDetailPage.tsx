import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  Edit3,
  Trash2,
  Globe,
  Lock,
  Save,
  X,
  UserPlus,
  Users,
  Clock,
  User,
  Image,
  Paperclip,
  Eye,
} from "lucide-react";
import {
  getWikiPage,
  updateWikiPage,
  deleteWikiPage,
  listCollaborators,
  addCollaborator,
  removeCollaborator,
  uploadWikiFile,
  type WikiPageData,
  type WikiCollaboratorData,
} from "../api/wiki";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import Loader from "../components/Loader";

interface UserData {
  id: string;
  username: string;
  display_name: string;
}

export default function WikiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);

  const [page, setPage] = useState<WikiPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
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

  // Collaborator state
  const [collaborators, setCollaborators] = useState<WikiCollaboratorData[]>([]);
  const [showCollabPanel, setShowCollabPanel] = useState(false);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [addingUserId, setAddingUserId] = useState("");

  const fetchPage = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getWikiPage(id);
      setPage(data);
      setTitle(data.title);
      setContent(data.content);
      setTags(data.tags);
      setIsPublic(data.is_public);
      setWeight(data.weight);
      const collabs = await listCollaborators(id);
      setCollaborators(collabs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage();
  }, [id]);

  const isOwner = page && currentUser && page.owner_id === currentUser.id;
  const isCollaborator =
    page && currentUser && page.collaborator_ids.includes(currentUser.id);
  const canEdit = isOwner || isCollaborator;

  const handleSave = async () => {
    if (!page) return;
    setSaving(true);
    try {
      const updated = await updateWikiPage(page.id, {
        title,
        content,
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
    if (!page || !isOwner) return;
    if (!confirm(t("wiki.confirm_delete", "Are you sure you want to delete this page?"))) return;
    await deleteWikiPage(page.id);
    navigate("/wiki");
  };

  const handleCancel = () => {
    if (!page) return;
    setTitle(page.title);
    setContent(page.content);
    setTags(page.tags);
    setIsPublic(page.is_public);
    setWeight(page.weight);
    setEditing(false);
  };

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
      e.target.value = "";
    }
  };

  if (loading) return <Loader />;
  if (!page) {
    return (
      <div className="flex flex-col items-center justify-center pt-24 text-[var(--text-muted)]">
        <p className="text-sm">{t("wiki.not_found", "Page not found")}</p>
      </div>
    );
  }

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
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input text-lg font-bold"
              placeholder={t("wiki.page_title", "Page title")}
            />
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight truncate">{page.title}</h1>
              {page.is_public ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-600 border border-green-200">
                  <Globe size={10} />
                  {t("wiki.public", "Public")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] border">
                  <Lock size={10} />
                  {t("wiki.private", "Private")}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <>
              <button onClick={() => setEditing(true)} className="btn btn-outline btn-sm">
                <Edit3 size={14} />
                {t("common.edit", "Edit")}
              </button>
              {isOwner && (
                <button onClick={openCollabPanel} className="btn btn-outline btn-sm">
                  <Users size={14} />
                  {t("wiki.collaborators", "Collaborators")}
                </button>
              )}
            </>
          )}
          {editing && (
            <>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
                <Save size={14} />
                {saving ? t("common.saving", "Saving...") : t("common.save", "Save")}
              </button>
              <button onClick={handleCancel} className="btn btn-ghost btn-sm">
                <X size={14} />
                {t("common.cancel", "Cancel")}
              </button>
            </>
          )}
          {isOwner && !editing && (
            <button onClick={handleDelete} className="btn btn-ghost btn-sm text-red-500 hover:bg-red-50">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-4 text-[12px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1">
          <User size={12} />
          {page.owner_display_name || page.owner_name}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={12} />
          {new Date(page.updated_at).toLocaleString()}
        </span>
        {page.tags && (
          <span className="flex items-center gap-1 flex-wrap">
            {page.tags.split(",").map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--primary)]/8 px-2 py-0.5 text-[11px] text-[var(--primary)]"
              >
                {tag.trim()}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="card rounded-xl p-5">
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">
                {t("wiki.content", "Content")} (Markdown)
              </label>
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                {/* Upload toolbar */}
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
                  <div className="prose prose-sm max-w-none min-h-[400px] p-4 text-[14px] leading-relaxed text-[var(--text-secondary)] bg-[var(--bg-card)]">
                    {content ? (
                      <ReactMarkdown>{content}</ReactMarkdown>
                    ) : (
                      <p className="text-[var(--text-muted)] italic">{t("wiki.no_content_preview", "No content to preview")}</p>
                    )}
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={18}
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
        ) : (
          <div className="prose prose-sm max-w-none text-[14px] leading-relaxed text-[var(--text-secondary)]">
            <ReactMarkdown>{page.content || t("wiki.empty_content", "No content")}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Collaborator Panel */}
      {showCollabPanel && (
        <div className="card rounded-xl p-5 animate-[fadeInUp_.15s_ease-out]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">
              {t("wiki.collaborators", "Collaborators")} ({collaborators.length})
            </h3>
            <button onClick={() => setShowCollabPanel(false)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
              <X size={16} />
            </button>
          </div>

          {/* Current collaborators */}
          {collaborators.length > 0 && (
            <div className="mb-4 space-y-2">
              {collaborators.map((c) => (
                <div key={c.user_id} className="flex items-center gap-3 rounded-lg bg-[var(--bg)] p-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[11px] font-semibold text-[var(--primary)]">
                    {(c.display_name || c.username).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">
                      {c.display_name || c.username}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">@{c.username}</div>
                  </div>
                  <span className="text-[11px] text-[var(--primary)] bg-[var(--primary)]/8 rounded-full px-2 py-0.5">
                    {c.permission}
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
            <div className="border-t border-[var(--border-light)] pt-4">
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
                  placeholder={t("wiki.search_user", "Search user...")}
                  className="input flex-1"
                />
                <select
                  value={addingUserId}
                  onChange={(e) => setAddingUserId(e.target.value)}
                  className="input w-40"
                >
                  <option value="">{t("wiki.select_user", "Select user")}</option>
                  {filteredUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name || u.username}
                    </option>
                  ))}
                </select>
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
      )}
    </div>
  );
}
