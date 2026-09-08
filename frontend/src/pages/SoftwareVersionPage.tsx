import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, Package, Link2, FileArchive, GitBranch, Clock, History,
  Trash2, Box, Server, Smartphone, Cpu, Download, X,
  PlusCircle, Loader2, Pencil, ChevronDown, ChevronUp,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import Loader from "../components/Loader";
import MarkdownContent from "../components/MarkdownContent";
import remarkBreaks from "remark-breaks";
import { timeAgo } from "../utils/time";
import {
  listComponents, getStats, createComponent, deleteComponent,
  createVersion, getComponent, deleteVersion, uploadArtifact,
  updateVersion, artifactUrl,
  type ComponentData, type SoftwareStats, type VersionData,
  type DependencyInput,
} from "../api/software";

type Category = "frontend" | "backend" | "mobile" | "engine" | "other";

const CATEGORY_META: Record<Category, { color: string; soft: string; icon: typeof Box }> = {
  frontend: { color: "#2563eb", soft: "#eff6ff", icon: Box },
  backend: { color: "#059669", soft: "#ecfdf5", icon: Server },
  mobile: { color: "#7c3aed", soft: "#f5f3ff", icon: Smartphone },
  engine: { color: "#d97706", soft: "#fffbeb", icon: Cpu },
  other: { color: "#6b7280", soft: "#f3f4f6", icon: Package },
};

const CATEGORY_ORDER: Category[] = ["frontend", "backend", "mobile", "engine", "other"];

function formatSize(mb: number): string {
  if (!mb || mb <= 0) return "";
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

function categoryOf(c: ComponentData): Category {
  return (["frontend", "backend", "mobile", "engine", "other"].includes(c.category)
    ? c.category
    : "other") as Category;
}

function BadgeIcon({ c, size = 40 }: { c: ComponentData; size?: number }) {
  const meta = CATEGORY_META[categoryOf(c)];
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-[var(--border)]"
      style={{ width: size, height: size, background: meta.soft, color: meta.color }}
    >
      <span className="text-[13px] font-bold tracking-tight">
        {c.icon_key || c.name.slice(0, 3).toUpperCase()}
      </span>
    </div>
  );
}

function Toaster({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-[12px] text-red-600 shadow-sm">
      {msg}
    </div>
  );
}

// ─── Dep editor for publish modal ─────────────────────────
function DepEditor({
  deps, onChange, components,
}: {
  deps: DependencyInput[];
  onChange: (deps: DependencyInput[]) => void;
  components: ComponentData[];
}) {
  const { t } = useTranslation();
  const update = (i: number, patch: Partial<DependencyInput>) => {
    const next = deps.slice();
    const cur: DependencyInput = { kind: "external", name: "", constraint: "", target_component_id: null, ...next[i], ...patch };
    // Auto-fill name from target component for internal deps
    if (patch.target_component_id !== undefined || cur.kind === "internal") {
      const comp = components.find((c) => c.id === cur.target_component_id);
      if (comp) cur.name = comp.name;
    }
    next[i] = cur;
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {deps.map((d, i) => (
        <div key={i} className="grid grid-cols-[90px_1fr_130px_1fr_28px] items-center gap-1.5">
          <select
            value={d.kind}
            onChange={(e) => update(i, { kind: e.target.value })}
            className="select h-[34px] text-[12px]"
          >
            <option value="internal">内部</option>
            <option value="external">外部</option>
            <option value="runtime">运行时</option>
          </select>
          {d.kind === "internal" ? (
            <select
              value={d.target_component_id || ""}
              onChange={(e) =>
                update(i, { target_component_id: e.target.value || null })
              }
              className="select h-[34px] text-[12px]"
            >
              <option value="">选择软件</option>
              {components.filter((c) => c.id !== undefined).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.identifier}）
                </option>
              ))}
            </select>
          ) : (
            <input
              value={d.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="如 Node.js"
              className="input h-[34px] text-[12px]"
            />
          )}
          <input
            value={d.constraint}
            onChange={(e) => update(i, { constraint: e.target.value })}
            placeholder="如 >= 18.x"
            className="input h-[34px] text-[12px]"
          />
          <button
            type="button"
            onClick={() => onChange(deps.filter((_, j) => j !== i))}
            className="flex h-[34px] w-[28px] items-center justify-center rounded-md text-[var(--text-faint)] hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...deps, { kind: "external", name: "", constraint: "", target_component_id: null }])}
        className="flex items-center gap-1 text-[12px] font-medium text-[var(--primary)] hover:underline"
      >
        <PlusCircle size={12} /> {t("software.add_dependency")}
      </button>
    </div>
  );
}

// ─── Release note (Markdown summary with expand) ──────────
function NoteSummary({ note, label }: { note: string; label?: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (!note) return null;
  const isLong = note.length > 100 || note.includes("\n");
  return (
    <div>
      {label && <div className="mt-1.5 text-[11px] font-medium text-[var(--text-secondary)]">{label}</div>}
      <div className={`prose prose-sm max-w-none text-[12px] text-[var(--text-muted)] ${expanded ? "" : "line-clamp-2"}`}>
        <MarkdownContent remarkPlugins={[remarkBreaks]}>{note}</MarkdownContent>
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--primary)] hover:underline"
        >
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {expanded ? t("common.collapse") : t("software.view_detail")}
        </button>
      )}
    </div>
  );
}

// ─── Publish modal ─────────────────────────────────────────
// Unified version form modal — supports both create (publish) and edit
function VersionFormModal({
  component, components, editing, onClose, onSaved,
}: {
  component: ComponentData | null;
  components: ComponentData[];
  editing: VersionData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!editing;
  const [target, setTarget] = useState<string>(editing?.component_id || component?.id || "");
  const [version, setVersion] = useState(editing?.version || "");
  const [note, setNote] = useState(editing?.note || "");
  const [artifactType, setArtifactType] = useState<"file" | "url" | "none">(editing?.artifact_type || "url");
  const [downloadUrl, setDownloadUrl] = useState(editing?.download_url || "");
  const [fileName, setFileName] = useState(editing?.file_name || "");
  const [file, setFile] = useState<File | null>(null);
  const [deps, setDeps] = useState<DependencyInput[]>(
    editing?.dependencies.map((d) => ({
      kind: d.kind, name: d.name, target_component_id: d.target_component_id, constraint: d.constraint,
    })) || []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIdent, setNewIdent] = useState("");
  const [newCat, setNewCat] = useState<Category>("frontend");

  const createNewComponent = async () => {
    const res = await createComponent({
      name: newName, identifier: newIdent, category: newCat,
      icon_key: newName.slice(0, 3).toUpperCase(), description: "",
    });
    onSaved(); // refresh parent list so new component appears
    setTarget(res.id);
    setShowNew(false);
    setNewName(""); setNewIdent("");
  };

  const submit = async () => {
    setError("");
    if (!target) { setError(t("software.select_component")); return; }
    if (!version.trim()) { setError(t("software.version_required")); return; }
    setSaving(true);
    const payload = {
      version: version.trim(),
      note,
      artifact_type: artifactType,
      download_url: artifactType === "url" ? downloadUrl : "",
      file_name: artifactType === "file" ? fileName : "",
      dependencies: deps.filter((d) => d.kind === "internal" ? d.target_component_id : (d.name || d.constraint)),
    };
    try {
      let saved: VersionData;
      if (isEdit && editing) {
        saved = await updateVersion(editing.id, payload);
      } else {
        saved = await createVersion(target, payload);
      }
      if (artifactType === "file" && file) {
        await uploadArtifact(saved.id, file);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || t("software.publish_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[640px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-lg animate-[fadeInUp_.15s_ease-out]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--text)]">{t(isEdit ? "software.edit_title" : "software.publish_title")}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[#f3f4f6]"><X size={16} /></button>
        </div>

        {/* Component selector (create with no preset component only) */}
        {!component && !isEdit && (
          <div className="mb-3">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("software.component")}</label>
            <div className="flex gap-2">
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="select flex-1 text-[13px]">
                <option value="">{t("software.select_component")}</option>
                {components.map((c) => <option key={c.id} value={c.id}>{c.name}（{c.identifier}）</option>)}
              </select>
              <button type="button" onClick={() => setShowNew(!showNew)} className="btn btn-outline btn-sm">{t("software.new_component")}</button>
            </div>
            {showNew && (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-dashed border-[var(--border)] p-3">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="组件名称" className="input h-[34px] text-[12px]" />
                <input value={newIdent} onChange={(e) => setNewIdent(e.target.value)} placeholder="标识，如 flowy-web" className="input h-[34px] text-[12px]" />
                <select value={newCat} onChange={(e) => setNewCat(e.target.value as Category)} className="select h-[34px] text-[12px]">
                  {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{t(`software.category.${c}`)}</option>)}
                </select>
                <button type="button" onClick={createNewComponent} className="btn btn-primary btn-sm">{t("software.create")}</button>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("software.version")}</label>
              <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="如 3.2.0" className="input" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("software.artifact_type")}</label>
              <div className="flex gap-1.5">
                {(["url", "file", "none"] as const).map((at) => (
                  <button key={at} type="button" onClick={() => setArtifactType(at)}
                    className={`flex-1 rounded-md border px-2 py-[7px] text-[12px] font-medium transition-colors ${artifactType === at ? "border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[#f9fafb]"}`}>
                    {t(`software.artifact.${at}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {artifactType === "url" && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("software.download_url")}</label>
              <input value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} placeholder="https://..." className="input" />
            </div>
          )}
          {artifactType === "file" && (
            <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--text-muted)]">
                <FileArchive size={15} />
                {file ? file.name : t("software.choose_file")}
                <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f) setFileName(f.name); }} />
              </label>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("software.note")}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t("software.note_placeholder")} className="input resize-none" />
            <p className="mt-1 text-[10px] text-[var(--text-faint)]">{t("software.note_md_hint")}</p>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("software.dependencies")}</label>
            <DepEditor deps={deps} onChange={setDeps} components={components} />
          </div>
        </div>

        {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
          <button onClick={submit} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? <Loader2 size={14} className="animate-spin" /> : isEdit ? <Pencil size={14} /> : <Plus size={14} />}
            {isEdit ? t("common.save") : t("software.publish")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── History modal ─────────────────────────────────────────
function HistoryModal({ component, onClose, onChanged, onEdit }: {
  component: ComponentData;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (v: VersionData) => void;
}) {
  const { t } = useTranslation();
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const [versions, setVersions] = useState<VersionData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const c = await getComponent(component.id);
    setVersions(c.versions || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    await deleteVersion(id);
    onChanged();
    load();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[620px] max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-lg animate-[fadeInUp_.15s_ease-out]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text)]">{component.name} · {t("software.history")}</h2>
            <p className="text-[11px] text-[var(--text-muted)]">{component.identifier}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[#f3f4f6]"><X size={16} /></button>
        </div>

        {loading ? <div className="py-10 text-center text-[var(--text-muted)]"><Loader2 size={18} className="mx-auto animate-spin" /></div>
          : versions.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-[var(--text-muted)]">{t("software.no_versions")}</div>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="mono rounded-md bg-[var(--primary-subtle)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--primary)]">v{v.version}</span>
                      {v.artifact_type === "url" && <Link2 size={12} className="text-[var(--text-faint)]" />}
                      {v.artifact_type === "file" && <FileArchive size={12} className="text-[var(--text-faint)]" />}
                    </div>
                    <div className="flex items-center gap-1">
                      {v.artifact_type === "file" && v.stored_filename && (
                        <a href={artifactUrl(v.stored_filename)} className="btn btn-outline btn-xs">
                          <Download size={11} /> {t("software.download")}
                        </a>
                      )}
                      {isAdmin && (
                        <>
                          <button onClick={() => onEdit(v)} title={t("common.edit")} className="rounded p-1 text-[var(--text-faint)] hover:text-[var(--primary)]"><Pencil size={13} /></button>
                          <button onClick={() => remove(v.id)} className="rounded p-1 text-[var(--text-faint)] hover:text-red-500"><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  </div>
                  {v.note && (
                    <div className="prose prose-sm max-w-none mt-1.5 text-[12px] text-[var(--text-muted)]">
                      <MarkdownContent remarkPlugins={[remarkBreaks]}>{v.note}</MarkdownContent>
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-faint)]">
                    <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(v.published_at || v.created_at)}</span>
                    <span>{v.dependencies.length} {t("software.deps_short")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────
export default function SoftwareVersionPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const [stats, setStats] = useState<SoftwareStats | null>(null);
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>("all");
  const [sort, setSort] = useState<"updated" | "name">("updated");
  const [publishFor, setPublishFor] = useState<ComponentData | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [historyFor, setHistoryFor] = useState<ComponentData | null>(null);
  const [editFor, setEditFor] = useState<VersionData | null>(null);
  const [editComponent, setEditComponent] = useState<ComponentData | null>(null);
  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  const load = async () => {
    try {
      const [s, cs] = await Promise.all([getStats(), listComponents({ sort })]);
      setStats(s); setComponents(cs);
    } catch (err: any) {
      showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error", "Failed"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [sort]);

  const categories = useMemo(() => {
    const present = new Set(components.map((c) => categoryOf(c)));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [components]);

  const shown = useMemo(() => {
    const base = tab === "all" ? components : components.filter((c) => categoryOf(c) === tab);
    return base;
  }, [components, tab]);

  const statCards = [
    { label: t("software.stat.components"), value: stats?.component_count ?? 0, icon: Box, color: "#f59e0b" },
    { label: t("software.stat.versions"), value: stats?.version_count ?? 0, icon: History, color: "#2563eb" },
    { label: t("software.stat.artifacts"), value: stats?.artifact_count ?? 0, icon: Package, color: "#059669" },
    { label: t("software.stat.dependencies"), value: stats?.dependency_count ?? 0, icon: GitBranch, color: "#7c3aed" },
  ];

  if (loading) return <Loader />;

  return (
    <div className="space-y-5 page-enter">
      <Toaster msg={toast} />

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
        <span>{t("software.breadcrumb_1")}</span>
        <span className="text-[var(--text-faint)]">/</span>
        <span className="text-[var(--text-muted)]">{t("software.breadcrumb_2")}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text)]">{t("software.title")}</h1>
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{t("software.subtitle")}</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setPublishFor(null); setShowPublish(true); }} className="btn btn-primary btn-sm">
            <Plus size={14} /> {t("software.publish")}
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((s) => (
          <div key={s.label} className="card rounded-xl p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md" style={{ background: `${s.color}18`, color: s.color }}>
                <s.icon size={13} />
              </span>
              <span>{s.label}</span>
            </div>
            <div className="text-[26px] font-semibold leading-none tabular-nums text-[var(--text)]">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs + sort */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => setTab("all")}
            className={`rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${tab === "all" ? "bg-[#f3f4f6] text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
            {t("software.tab_all")} ({components.length})
          </button>
          {categories.map((c) => (
            <button key={c} onClick={() => setTab(c)}
              className={`rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${tab === c ? "bg-[#f3f4f6] text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
              {t(`software.category.${c}`)} ({components.filter((x) => categoryOf(x) === c).length})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <span>{t("software.sort")}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as "updated" | "name")} className="select h-[30px] text-[12px]">
            <option value="updated">{t("software.sort_updated")}</option>
            <option value="name">{t("software.sort_name")}</option>
          </select>
        </div>
      </div>

      {/* Cards */}
      {shown.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
          <Package size={26} className="mb-2 opacity-20" strokeWidth={1.5} />
          <p className="text-[13px]">{t("software.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((c) => {
            const lv = c.latest_version;
            const internal = lv?.dependencies.filter((d) => d.kind === "internal") ?? [];
            const external = lv?.dependencies.filter((d) => d.kind !== "internal") ?? [];
            return (
              <div key={c.id} className="card rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  {/* Left */}
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="mt-0.5 shrink-0"><BadgeIcon c={c} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-semibold text-[var(--text)]">{c.name}</h3>
                        <span className="mono text-[11px] text-[var(--text-faint)]">{c.identifier}</span>
                      </div>
                      {c.description && <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{c.description}</p>}

                      {/* Version row */}
                      {lv ? (
                        <div className="mt-2.5">
                          <div className="flex items-center gap-2">
                            <span className="mono rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">v{lv.version}</span>
                            {lv.note && (
                              <span className="text-[11px] font-medium text-[var(--text-secondary)]">{t("software.latest_note")}</span>
                            )}
                          </div>
                          {lv.note && <NoteSummary note={lv.note} />}
                        </div>
                      ) : (
                        <div className="mt-2.5 text-[12px] text-[var(--text-faint)]">{t("software.no_version")}</div>
                      )}

                      {/* Artifact */}
                      {lv?.artifact_type === "file" && lv.stored_filename && (
                        <a href={artifactUrl(lv.stored_filename)} className="mt-2 flex w-fit items-center gap-1.5 text-[12px] text-[var(--primary)] hover:underline">
                          <span className="flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"><FileArchive size={12} /></span>
                          {t("software.file_prefix")} {lv.file_name} {formatSize(lv.file_size) && `(${formatSize(lv.file_size)})`}
                        </a>
                      )}
                      {lv?.artifact_type === "url" && lv.download_url && (
                        <a href={lv.download_url} target="_blank" rel="noreferrer" className="mt-2 flex w-fit items-center gap-1.5 text-[12px] text-[var(--primary)] hover:underline">
                          <span className="flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700"><Link2 size={12} /></span>
                          {t("software.url_prefix")} {lv.download_url}
                        </a>
                      )}

                      {/* Dependencies */}
                      {(internal.length > 0 || external.length > 0) && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                          <span className="font-medium text-[var(--text-secondary)]">{t("software.env_deps")}</span>
                          {internal.length > 0 && (
                            <span className="flex flex-wrap items-center gap-1">
                              <span>{t("software.internal_deps")}</span>
                              {internal.map((d) => (
                                <span key={d.id} className="rounded-md bg-[var(--primary-subtle)] px-1.5 py-0.5 font-medium text-[var(--primary)]">
                                  {d.name}{d.constraint && <span className="text-[var(--primary)]/70"> {d.constraint}</span>}
                                </span>
                              ))}
                            </span>
                          )}
                          {external.length > 0 && (
                            <span className="flex flex-wrap items-center gap-1">
                              <span>{t("software.external_deps")}</span>
                              {external.map((d) => (
                                <span key={d.id} className="rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[var(--text-secondary)]">
                                  {d.name}{d.constraint && <span className="text-[var(--text-faint)]"> {d.constraint}</span>}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right actions */}
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex items-center gap-1.5">
                      {isAdmin && (
                        <button onClick={() => { setPublishFor(c); setShowPublish(true); }} className="btn btn-outline btn-sm">
                          {t("software.publish")}
                        </button>
                      )}
                      <button onClick={() => setHistoryFor(c)} className="btn btn-ghost btn-sm">
                        {t("software.history")} ({c.version_count})
                      </button>
                      {isAdmin && (
                        <button onClick={async () => { if (confirm(t("software.confirm_delete_component"))) { await deleteComponent(c.id); showToast(t("software.deleted")); load(); } }}
                          className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-red-50 hover:text-red-500" title={t("common.delete")}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-[11px] text-[var(--text-faint)]">
                      <Clock size={11} /> {timeAgo(c.updated_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showPublish && (
        <VersionFormModal component={publishFor} components={components} editing={null} onClose={() => { setShowPublish(false); setPublishFor(null); }} onSaved={load} />
      )}
      {editFor && (
        <VersionFormModal component={editComponent} components={components} editing={editFor} onClose={() => { setEditFor(null); setEditComponent(null); }} onSaved={load} />
      )}
      {historyFor && (
        <HistoryModal
          component={historyFor}
          onClose={() => setHistoryFor(null)}
          onChanged={load}
          onEdit={(v) => { setHistoryFor(null); setEditFor(v); setEditComponent(historyFor); }}
        />
      )}
    </div>
  );
}
