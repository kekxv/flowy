import CollectionLinkGenerator from "../components/collections/CollectionLinkGenerator"
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Search, X, UserPlus, Flag, Filter, ChevronDown, ChevronUp, ChevronRight, Check,
  ArrowUpDown, Inbox, AlertTriangle, Tag, ExternalLink,
} from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { listIssues, type IssueData } from "../api/issues";
import { ALL_ROLES, STAT, PRIS } from "../constants";
import { ListSkeleton } from "../components/ui/Skeleton";
import MarkdownContent from "../components/MarkdownContent";
import { timeAgo } from "../utils/time";

type ViewKey = "all" | "mine" | "unclaimed" | "reported" | "overdue" | "archived";

const VIEWS: Array<{ key: ViewKey; params: Record<string, string> }> = [
  { key: "all", params: {} },
  { key: "mine", params: { assignee: "me" } },
  { key: "unclaimed", params: { unassigned: "1" } },
  { key: "reported", params: { reporter: "me" } },
  { key: "overdue", params: { overdue: "1" } },
  { key: "archived", params: { status: "closed,resolved,cancelled,rejected" } },
];

const GROUP_ORDER: Array<{ key: string; statuses: string[] }> = [
  { key: "open", statuses: ["open"] },
  { key: "in_progress", statuses: ["in_progress"] },
  { key: "review", statuses: ["proposed", "accepted"] },
  { key: "resolved", statuses: ["resolved"] },
  { key: "done", statuses: ["closed", "cancelled", "rejected"] },
];
const GROUP_LABEL: Record<string, string> = {
  open: "dashboard.group_open", in_progress: "dashboard.group_in_progress",
  review: "issues.group_review", resolved: "issues.status.resolved", done: "issues.group_done",
};

function FilterPill({ label, value, values, onChange }: {
  label: string; value: string;
  values: Array<{ key: string; label: string; cls?: string }>;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = value !== "all" && value !== "";
  const currentLabel = values.find(v => v.key === value)?.label || label;
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className={`chip${active ? " is-on" : ""}`}>
        {active ? <>{label}: {currentLabel}</> : label}
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-72 min-w-[150px] overflow-y-auto rounded-[10px] border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-md)] animate-[fadeInUp_.12s_ease-out]">
            <button onClick={() => { onChange("all"); setOpen(false); }}
              className={`flex w-full items-center px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--bg-hover)] ${!active ? "font-semibold text-[var(--primary)]" : "text-[var(--text-secondary)]"}`}>
              {t("common.all")}
            </button>
            {values.map(v => (
              <button key={v.key} onClick={() => { onChange(v.key); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--bg-hover)] ${value === v.key ? "font-semibold text-[var(--primary)]" : "text-[var(--text-secondary)]"}`}>
                {v.cls && <span className={v.cls + " rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium"}>{v.label}</span>}
                {!v.cls && v.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
export default function IssueListPage() {
  const { t, i18n } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const location = useLocation();
  const user = useAuthStore(s => s.user);

  const updateQuery = (changes: Record<string, string>) => setSp(previous => {
    const next = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    return next;
  });

  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const setPage = (value: number | ((p: number) => number)) =>
    updateQuery({ page: String(typeof value === "function" ? value(page) : value) });
  const status = sp.get("status") || "all";
  const priority = sp.get("priority") || "all";
  const q = sp.get("q") || "";
  const issueType = sp.get("issue_type") || "all";
  const labelId = sp.get("label_id") || "";
  const assignee = sp.get("assignee") || "";
  const reporter = sp.get("reporter") || "";
  const unassigned = sp.get("unassigned") === "1";
  const overdue = sp.get("overdue") === "1";
  const sort = sp.get("sort") || "status_priority";
  const singleStatus = STAT.includes(status as any) ? status : "all";

  const [issues, setIssues] = useState<IssueData[]>([]);
  const [total, setTotal] = useState(0);
  const [searchQ, setSearchQ] = useState(q);
  useEffect(() => setSearchQ(q), [q]);
  const [milestones, setMilestones] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [labels, setLabels] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [activeTimerIds, setActiveTimerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<{ issue: IssueData; type: "status" | "priority" } | null>(null);
  const [labelPopup, setLabelPopup] = useState<IssueData | null>(null);
  const [msPopup, setMsPopup] = useState<{ issue: IssueData } | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimMode, setClaimMode] = useState<"single" | "bulk">("single");
  const [claimRoles, setClaimRoles] = useState<string[]>([]);
  const [myRoles, setMyRoles] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkField, setBulkField] = useState<"status" | "priority" | null>(null);
  const [preview, setPreview] = useState<IssueData | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sortOpen, setSortOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };
  const permissionError = (err: any) =>
    showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error", "Failed"));

  const fetch = () => {
    setLoading(true);
    const p: Record<string, string> = { page: String(page), per_page: "20" };
    if (status !== "all") p.status = status;
    if (priority !== "all") p.priority = priority;
    if (q) p.q = q;
    if (labelId) p.label_id = labelId;
    if (issueType !== "all") p.issue_type = issueType;
    if (assignee === "me" && user) p.assignee_id = user.id;
    if (reporter === "me" && user) p.reporter_id = user.id;
    if (unassigned) p.unassigned = "true";
    if (overdue) p.overdue = "true";
    if (sort !== "status_priority") p.sort = sort;
    listIssues(p).then(r => {
      setIssues(r.data); setTotal(r.meta.total); setLoading(false);
      setSelected(new Set());
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    api.get("/labels").then(r => setLabels(r.data)).catch(() => {});
    api.get("/milestones").then(r => setMilestones(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    const poll = () => api.get("/dashboard").then(r => {
      const ids = new Set<string>((r.data.active_timers || []).map((x: any) => x.issue_id as string));
      setActiveTimerIds(ids);
    }).catch(() => {});
    poll();
    const i = setInterval(poll, 15000);
    return () => clearInterval(i);
  }, []);
  useEffect(fetch, [page, status, priority, q, labelId, issueType, assignee, reporter, unassigned, overdue, sort, user, reloadKey]);

  const activeView: ViewKey | "custom" = useMemo(() => {
    if (priority !== "all" || issueType !== "all" || labelId) return "custom";
    const current: Record<string, string> = {};
    for (const key of ["status", "assignee", "reporter", "unassigned", "overdue"]) {
      const value = sp.get(key);
      if (value) current[key] = value;
    }
    const hit = VIEWS.find(v => {
      const a = Object.keys(v.params), b = Object.keys(current);
      return a.length === b.length && a.every(k => v.params[k] === current[k]);
    });
    return hit ? hit.key : "custom";
  }, [sp, priority, issueType, labelId]);

  const applyView = (key: ViewKey) => {
    const preset = VIEWS.find(v => v.key === key)!;
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    for (const [k, v] of Object.entries(preset.params)) next.set(k, v);
    setSp(next);
  };

  const changeFilter = (key: string, value: string, extra: Record<string, string> = {}) =>
    updateQuery({ [key]: value === "all" ? "" : value, page: "", ...extra });

  const clearFilters = () => setSp(prev => {
    const next = new URLSearchParams(prev);
    ["status", "priority", "label_id", "issue_type", "assignee", "reporter", "unassigned", "overdue", "page"].forEach(k => next.delete(k));
    return next;
  });

  const hasFilters = status !== "all" || priority !== "all" || labelId || issueType !== "all" || assignee || reporter || unassigned || overdue;

  const doPopup = async (id: string, field: string, value: string) => {
    try { await api.put(`/issues/${id}`, { [field]: value }); fetch(); }
    catch (err) { permissionError(err); }
  };
  const openClaim = async (issueId: string, mode: "single" | "bulk" = "single") => {
    setClaimId(issueId); setClaimMode(mode); setClaimRoles([]);
    try { const r = await api.get("/auth/me/project-roles"); setMyRoles(r.data); } catch { setMyRoles([...ALL_ROLES]); }
  };
  const toggleClaimRole = (r: string) => setClaimRoles(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const doClaim = async () => {
    if (!user || claimRoles.length === 0) return;
    if (claimMode === "bulk") return bulkAssign();
    if (!claimId) return;
    try {
      const r = await api.get(`/issues/${claimId}`);
      const current = (r.data.assignees || []).map((a: any) => ({ user_id: a.id, role: a.role }));
      for (const role of claimRoles) {
        if (!current.some((a: any) => a.user_id === user.id && a.role === role)) current.push({ user_id: user.id, role });
      }
      await api.put(`/issues/${claimId}`, { assignees: current });
      setClaimId(null); setClaimRoles([]); fetch();
    } catch (err) { permissionError(err); }
  };
  const toggleMilestone = async (issueId: string, mid: string) => {
    try {
      const r = await api.get(`/issues/${issueId}`);
      const current: string[] = r.data.milestone_ids || [];
      const next = current.includes(mid) ? current.filter((x: string) => x !== mid) : [...current, mid];
      await api.put(`/issues/${issueId}`, { milestone_ids: next });
      setMsPopup(null); fetch();
    } catch (err) { permissionError(err); }
  };
  const doLabel = async (issueId: string, lid: string) => {
    try {
      const r = await api.get(`/issues/${issueId}`);
      const ids = (r.data.labels || []).map((l: any) => l.id);
      const next = ids.includes(lid) ? ids.filter((x: string) => x !== lid) : [...ids, lid];
      await api.put(`/issues/${issueId}`, { label_ids: next });
      setLabelPopup(null); fetch();
    } catch (err) { permissionError(err); }
  };

  // ── bulk ──
  const toggleSelected = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = issues.length > 0 && issues.every(i => selected.has(i.id));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(issues.map(i => i.id)));
  const bulkApply = async (field: string, value: string) => {
    let ok = 0, fail = 0;
    for (const id of selected) {
      try { await api.put(`/issues/${id}`, { [field]: value }); ok++; } catch { fail++; }
    }
    setBulkField(null); setSelected(new Set()); fetch();
    showToast(fail ? t("bulk.partial", { ok, fail }) : t("bulk.updated", { count: ok }));
  };
  const bulkAssign = async () => {
    if (!user || claimRoles.length === 0) return;
    let ok = 0, fail = 0;
    for (const id of selected) {
      try {
        const r = await api.get(`/issues/${id}`);
        const current = (r.data.assignees || []).map((a: any) => ({ user_id: a.id, role: a.role }));
        for (const role of claimRoles) {
          if (!current.some((a: any) => a.user_id === user.id && a.role === role)) current.push({ user_id: user.id, role });
        }
        await api.put(`/issues/${id}`, { assignees: current }); ok++;
      } catch { fail++; }
    }
    setClaimId(null); setClaimRoles([]); setSelected(new Set()); fetch();
    showToast(fail ? t("bulk.partial", { ok, fail }) : t("bulk.updated", { count: ok }));
  };

  // ── grouping ──
  const grouped = useMemo(() => {
    if (sort !== "status_priority") return [{ key: "all", label: "", items: issues }];
    return GROUP_ORDER.map(g => ({
      key: g.key,
      label: t(GROUP_LABEL[g.key] as string, g.key),
      items: issues.filter(i => g.statuses.includes(i.status)),
    })).filter(g => g.items.length > 0);
  }, [issues, sort, t]);

  // ── preview drawer keyboard nav ──
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPreview(null); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const idx = issues.findIndex(i => i.id === preview.id);
      const next = issues[idx + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) setPreview(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, issues]);

  const openPreview = (e: React.MouseEvent, issue: IssueData) => {
    if ((e.target as HTMLElement).closest("a,button,input,label,select")) return;
    setPreview(issue);
  };
  const previewIndex = preview ? issues.findIndex(i => i.id === preview.id) : -1;
  const perPage = 20;

  return (
    <div className="page-enter">
      {toast && (
        <div className="fixed left-1/2 top-4 z-[70] -translate-x-1/2 rounded-[8px] border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600 shadow-sm">{toast}</div>
      )}

      <div className="page-head">
        <div>
          <h1>{t("issues.list_title", "问题与需求")}</h1>
          <p className="page-sub">
            {t("issues.results", "{{count}} 个结果", { count: total })}
            <span className="mx-1.5 text-[var(--border)]">·</span>
            {t("issues.preview_hint", "点击行预览")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setReloadKey(k => k + 1)} className="btn btn-outline btn-sm">
            <ArrowUpDown size={12} />{t("common.refresh", "刷新")}
          </button>
          <Link to="/issues/new" className="btn btn-primary btn-sm">{t("issues.new_issue")}</Link>
        </div>
      </div>

      <CollectionLinkGenerator kind="issue" />

      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        {/* Saved views rail */}
        <aside className="hidden lg:block">
          <div className="panel sticky top-4 overflow-hidden">
            <div className="panel-head"><h2>{t("views.title", "我的视图")}</h2></div>
            <div className="viewrail">
              {VIEWS.map(v => (
                <button key={v.key} onClick={() => applyView(v.key)}
                  className={`viewitem${activeView === v.key ? " is-active" : ""}${v.key === "overdue" ? " is-alert" : ""}`}>
                  {v.key === "unclaimed" ? <Inbox size={13} /> : v.key === "overdue" ? <AlertTriangle size={13} /> : <Filter size={13} />}
                  {t(`views.${v.key}`)}
                </button>
              ))}
              {activeView === "custom" && (
                <div className="viewitem is-active"><Filter size={13} />{t("views.custom", "自定义筛选")}</div>
              )}
            </div>
            <div className="border-t border-[var(--border-light)] p-2">
              <p className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{t("views.labels", "标签")}</p>
              <div className="max-h-56 overflow-y-auto">
                {labels.length === 0 && <p className="px-2 py-1.5 text-[11.5px] text-[var(--text-faint)]">{t("common.no_data")}</p>}
                {labels.map(l => (
                  <button key={l.id} onClick={() => changeFilter("label_id", labelId === l.id ? "" : l.id)}
                    className={`viewitem${labelId === l.id ? " is-active" : ""}`}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                    <span className="truncate">{l.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="min-w-0 space-y-3">
          {/* Toolbar */}
          <div className="panel">
            <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
              <div className="relative w-full sm:w-auto sm:min-w-[160px] sm:flex-1">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") updateQuery({ q: searchQ, page: "" }); }}
                  placeholder={t("issues.search_placeholder", "搜索标题、编号或评论…")}
                  aria-label={t("common.search")}
                  className="h-8 w-full rounded-[8px] border border-transparent bg-[var(--bg)] py-1.5 pl-8 pr-7 text-[12.5px] outline-none transition-colors focus:border-[var(--primary)] focus:bg-white"
                />
                {searchQ && (
                  <button onClick={() => { setSearchQ(""); updateQuery({ q: "", page: "" }); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-faint)] transition-colors hover:text-[var(--text-muted)]">
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="flex w-full items-center gap-1.5 overflow-x-auto pb-0.5 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0">
                <FilterPill label={t("issues.type_label", "类型")} value={issueType}
                  onChange={v => changeFilter("issue_type", v)}
                  values={[{ key: "bug", label: t("issues.type.bug") }, { key: "feature", label: t("issues.type.feature") }]} />
                <FilterPill label={t("common.status")} value={singleStatus}
                  onChange={v => changeFilter("status", v)}
                  values={STAT.map(s => ({ key: s, label: t(`issues.status.${s}`), cls: `status-${s}` }))} />
                <FilterPill label={t("common.priority")} value={priority}
                  onChange={v => changeFilter("priority", v)}
                  values={PRIS.map(p => ({ key: p, label: t(`issues.priority.${p}`), cls: `priority-${p}` }))} />
                <button onClick={() => updateQuery({ overdue: overdue ? "" : "1", page: "" })}
                  className={`chip${overdue ? " is-on" : ""}`}>
                  <AlertTriangle size={11} />{t("views.overdue", "已逾期")}
                </button>
                <button onClick={() => updateQuery({ unassigned: unassigned ? "" : "1", page: "" })}
                  className={`chip${unassigned ? " is-on" : ""}`}>
                  <Inbox size={11} />{t("views.unclaimed", "待认领")}
                </button>
              </div>

              <div className="relative ml-auto shrink-0">
                <button onClick={() => setSortOpen(v => !v)} className="chip">
                  <ArrowUpDown size={11} />
                  {sort === "status_priority" ? t("issues.sort_status", "状态优先")
                    : sort === "-updated_at" ? t("issues.sort_updated", "最近更新")
                    : t("issues.sort_created", "最新创建")}
                  <ChevronDown size={11} />
                </button>
                {sortOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                    <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-[10px] border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-md)]">
                      {([
                        ["status_priority", t("issues.sort_status", "状态优先")],
                        ["-updated_at", t("issues.sort_updated", "最近更新")],
                        ["-created_at", t("issues.sort_created", "最新创建")],
                      ] as const).map(([key, label]) => (
                        <button key={key} onClick={() => { updateQuery({ sort: key === "status_priority" ? "" : key, page: "" }); setSortOpen(false); }}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--bg-hover)] ${sort === key ? "font-semibold text-[var(--primary)]" : "text-[var(--text-secondary)]"}`}>
                          {sort === key && <Check size={12} />}{label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            {hasFilters && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border-light)] px-2.5 py-1.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{t("issues.filters", "筛选")}</span>
                {issueType !== "all" && (
                  <button className="chip is-on" onClick={() => changeFilter("issue_type", "all")}>
                    {t(`issues.type.${issueType}`)}<X size={11} className="chip-x" />
                  </button>
                )}
                {status !== "all" && (
                  <button className="chip is-on" onClick={() => changeFilter("status", "all")}>
                    {singleStatus === "all" && status.includes(",") ? t("views.archived") : t(`issues.status.${status}`)}
                    <X size={11} className="chip-x" />
                  </button>
                )}
                {priority !== "all" && (
                  <button className="chip is-on" onClick={() => changeFilter("priority", "all")}>
                    {t(`issues.priority.${priority}`)}<X size={11} className="chip-x" />
                  </button>
                )}
                {labelId && (
                  <button className="chip is-on" onClick={() => changeFilter("label_id", "")}>
                    {labels.find(l => l.id === labelId)?.name || t("common.label")}<X size={11} className="chip-x" />
                  </button>
                )}
                {assignee === "me" && (
                  <button className="chip is-on" onClick={() => updateQuery({ assignee: "" })}>
                    {t("views.mine")}<X size={11} className="chip-x" />
                  </button>
                )}
                {reporter === "me" && (
                  <button className="chip is-on" onClick={() => updateQuery({ reporter: "" })}>
                    {t("views.reported")}<X size={11} className="chip-x" />
                  </button>
                )}
                {unassigned && (
                  <button className="chip is-on" onClick={() => updateQuery({ unassigned: "" })}>
                    {t("views.unclaimed")}<X size={11} className="chip-x" />
                  </button>
                )}
                {overdue && (
                  <button className="chip is-on" onClick={() => updateQuery({ overdue: "" })}>
                    {t("views.overdue")}<X size={11} className="chip-x" />
                  </button>
                )}
                <button onClick={clearFilters} className="ml-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)]">
                  {t("issues.clear_filters", "清空筛选")}
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          {loading ? <ListSkeleton rows={8} /> : issues.length === 0 ? (
            <div className="panel flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
              <Filter size={26} className="mb-2 opacity-20" strokeWidth={1.5} />
              <p className="text-[13px]">{t("issues.no_results", "没有符合条件的问题")}</p>
              <p className="mt-1 text-[11.5px] text-[var(--text-faint)]">{t("issues.empty_hint", "试试换个视图或清空筛选条件")}</p>
              {hasFilters && <button onClick={clearFilters} className="btn btn-outline btn-sm mt-3">{t("issues.clear_filters", "清空筛选")}</button>}
            </div>
          ) : (
            <div className="wtable">
              <div className="wtable-head">
                <button onClick={toggleSelectAll} aria-label={t("issues.select_all", "全选当前页")}
                  className={`wcbx${allSelected ? " is-on" : ""}`}>
                  {allSelected && <Check size={11} strokeWidth={3} />}
                </button>
                <span />
                <span>{t("issues.table_title", "标题")}</span>
                <span>{t("issues.col_status", "状态")}</span>
                <span className="col-pr">{t("issues.col_priority", "优先级")}</span>
                <span className="col-asg">{t("issues.col_assignee", "指派人")}</span>
                <span className="col-ms">{t("issues.col_milestone", "里程碑")}</span>
                <span className="col-time is-right">{t("issues.table_updated", "更新")}</span>
              </div>

              {grouped.map(group => {
                const isCollapsed = collapsed.has(group.key);
                return (
                  <div key={group.key}>
                    {group.label && (
                      <div className="wtable-group">
                        <button onClick={() => setCollapsed(prev => {
                          const next = new Set(prev);
                          if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                          return next;
                        })} className="group-toggle flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)]">
                          <ChevronRight size={11} className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
                          <span className="font-semibold">{group.label}</span>
                          <span className="group-count">{group.items.length}</span>
                        </button>
                      </div>
                    )}
                    {!isCollapsed && group.items.map(issue => {
                      const isFeature = issue.issue_type === "feature";
                      const assignees = issue.assignees || [];
                      const milestoneIds = issue.milestone_ids || [];
                      const msName = milestoneIds.map(mid => milestones.find(m => m.id === mid)?.name).filter(Boolean)[0];
                      const isSelected = selected.has(issue.id);
                      return (
                        <div key={issue.id}
                          onClick={e => openPreview(e, issue)}
                          className={`wtable-row${isSelected ? " is-selected" : ""}`}>
                          <button onClick={() => toggleSelected(issue.id)}
                            aria-label={t("bulk.selected", "选择")} aria-pressed={isSelected}
                            className={`wcbx${isSelected ? " is-on" : ""}`}>
                            {isSelected && <Check size={11} strokeWidth={3} />}
                          </button>
                          <span className={`wtype ${isFeature ? "is-feature" : "is-bug"}`}>{isFeature ? "需" : "问"}</span>

                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <Link to={`/issues/${issue.id}`} state={{ from: location.pathname + location.search }}
                                className="truncate text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]">
                                {issue.title}
                              </Link>
                              {activeTimerIds.has(issue.id) && (
                                <span className="shrink-0 rounded-[4px] bg-red-50 px-1.5 text-[10px] font-medium text-red-600">计时中</span>
                              )}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[var(--text-faint)]">
                              <span className="mono">#{issue.id.slice(0, 8)}</span>
                              {issue.labels?.slice(0, 2).map(l => (
                                <span key={l.id} className="hidden items-center gap-1 rounded-full px-1.5 text-[10px] font-medium sm:inline-flex"
                                  style={{ backgroundColor: l.color + "14", color: l.color }}>
                                  <span className="h-1 w-1 rounded-full" style={{ backgroundColor: l.color }} />{l.name}
                                </span>
                              ))}
                              <span className="sm:hidden">{(issue.reporter?.display_name || issue.reporter?.username || "")}</span>
                            </span>
                          </span>

                          <button onClick={() => setPopup({ issue, type: "status" })}
                            className={`status-${issue.status} justify-self-start text-[11px]`}>
                            {t(`issues.status.${issue.status}`)}
                          </button>
                          <span className="col-pr">
                            <button onClick={() => setPopup({ issue, type: "priority" })}
                              className={`priority-${issue.priority} rounded-[4px] px-1.5 py-0.5 text-[10.5px] font-medium`}>
                              {t(`issues.priority.${issue.priority}`)}
                            </button>
                          </span>
                          <span className="col-asg flex items-center">
                            {assignees.length === 0
                              ? <span className="text-[11px] text-[var(--text-faint)]">{t("issues.no_assignee", "未指派")}</span>
                              : (
                                <span className="flex items-center -space-x-1">
                                  {assignees.slice(0, 3).map(a => (
                                    <span key={a.id} title={a.display_name || a.username}
                                      className="grid h-[20px] w-[20px] place-items-center rounded-full bg-[var(--primary-subtle)] text-[9px] font-semibold text-[var(--primary)] ring-2 ring-white">
                                      {(a.display_name || a.username || "?").slice(0, 1).toUpperCase()}
                                    </span>
                                  ))}
                                  {assignees.length > 3 && <span className="pl-2 text-[10px] text-[var(--text-faint)]">+{assignees.length - 3}</span>}
                                </span>
                              )}
                          </span>
                          <span className="col-ms truncate text-[11px] text-[var(--text-muted)]">
                            {msName ? <span className="flex items-center gap-1 text-violet-600"><Flag size={10} />{msName}</span> : <span className="text-[var(--text-faint)]">—</span>}
                          </span>
                          <span className="col-time text-right text-[11px] tabular-nums text-[var(--text-faint)]">
                            {timeAgo(issue.updated_at || issue.created_at, i18n?.language)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] tabular-nums text-[var(--text-muted)]">
                {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} / {total}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="btn btn-outline btn-sm disabled:opacity-30">Prev</button>
                <span className="px-1 text-[11.5px] tabular-nums text-[var(--text-muted)]">{page} / {Math.ceil(total / perPage)}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / perPage)}
                  className="btn btn-outline btn-sm disabled:opacity-30">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{t("bulk.selected", { count: selected.size })}</span>
          <span className="bulk-sep" />
          <button className="bulk-btn" onClick={() => setBulkField("status")}>{t("bulk.status")}</button>
          <button className="bulk-btn" onClick={() => setBulkField("priority")}>{t("bulk.priority")}</button>
          <button className="bulk-btn" onClick={() => openClaim("", "bulk")}><UserPlus size={11} />{t("bulk.assign_to_me")}</button>
          <span className="bulk-sep" />
          <button className="bulk-btn" onClick={() => setSelected(new Set())}>{t("bulk.clear")}</button>
        </div>
      )}

      {/* Preview drawer */}
      {preview && (
        <>
          <div className="drawer-scrim" onClick={() => setPreview(null)} />
          <aside className="drawer-panel" role="dialog" aria-label={preview.title}>
            <div className="drawer-head">
              <span className={`wtype ${preview.issue_type === "feature" ? "is-feature" : "is-bug"}`}>
                {preview.issue_type === "feature" ? "需" : "问"}
              </span>
              <span className="mono text-[11px] text-[var(--text-faint)]">#{preview.id.slice(0, 8)}</span>
              <span className="ml-auto flex items-center gap-1">
                <button disabled={previewIndex <= 0}
                  onClick={() => { const prev = issues[previewIndex - 1]; if (prev) setPreview(prev); }}
                  className="ws-icon-btn grid h-7 w-7 disabled:opacity-30" title={t("detail.switch_hint")}>
                  <ChevronUp size={14} />
                </button>
                <button disabled={previewIndex < 0 || previewIndex >= issues.length - 1}
                  onClick={() => { const next = issues[previewIndex + 1]; if (next) setPreview(next); }}
                  className="ws-icon-btn grid h-7 w-7 disabled:opacity-30" title={t("detail.switch_hint")}>
                  <ChevronDown size={14} />
                </button>
                <button onClick={() => setPreview(null)} className="ws-icon-btn grid h-7 w-7"><X size={15} /></button>
              </span>
            </div>
            <div className="drawer-body">
              <h2 className="text-[16px] font-semibold leading-snug text-[var(--text)]">{preview.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button onClick={() => setPopup({ issue: preview, type: "status" })}
                  className={`status-${preview.status} text-[11px]`}>{t(`issues.status.${preview.status}`)}</button>
                <button onClick={() => setPopup({ issue: preview, type: "priority" })}
                  className={`priority-${preview.priority} rounded-[4px] px-1.5 py-0.5 text-[10.5px] font-medium`}>
                  {t(`issues.priority.${preview.priority}`)}
                </button>
                {(preview.milestone_ids || []).map(mid => {
                  const m = milestones.find(x => x.id === mid);
                  return m ? <span key={mid} className="flex items-center gap-1 rounded-[4px] bg-violet-50 px-1.5 text-[10.5px] text-violet-600"><Flag size={9} />{m.name}</span> : null;
                })}
              </div>

              <div className="mt-3 rounded-[10px] border border-[var(--border-light)] bg-[var(--bg)] p-3">
                {preview.description
                  ? <MarkdownContent className="prose prose-sm max-h-56 overflow-y-auto">{preview.description}</MarkdownContent>
                  : <p className="text-[12px] text-[var(--text-faint)]">{t("detail.empty_description", "暂无描述")}</p>}
              </div>

              <div className="mt-3 panel overflow-hidden">
                <div className="attr-row">
                  <span className="attr-key">{t("common.assignee")}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    {(preview.assignees || []).length === 0
                      ? <span className="text-[11.5px] text-[var(--text-faint)]">{t("issues.no_assignee", "未指派")}</span>
                      : preview.assignees.map(a => (
                        <span key={a.id} className="rounded-[5px] bg-[var(--bg-muted)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                          {a.display_name || a.username}
                        </span>
                      ))}
                    <button onClick={() => openClaim(preview.id)}
                      className="ml-1 rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium text-[var(--primary)] hover:bg-[var(--primary-subtle)]">
                      + {t("issues.claim", "认领")}
                    </button>
                  </span>
                </div>
                <div className="attr-row">
                  <span className="attr-key">{t("common.labels")}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    {(preview.labels || []).length === 0 && <span className="text-[11.5px] text-[var(--text-faint)]">{t("common.none")}</span>}
                    {preview.labels?.map(l => (
                      <span key={l.id} className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium"
                        style={{ backgroundColor: l.color + "14", color: l.color }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: l.color }} />{l.name}
                      </span>
                    ))}
                    <button onClick={() => setLabelPopup(preview)} className="text-[var(--text-faint)] hover:text-[var(--primary)]"><Tag size={12} /></button>
                  </span>
                </div>
                <div className="attr-row">
                  <span className="attr-key">{t("detail.reporter", "报告人")}</span>
                  <span className="text-[11.5px] text-[var(--text-secondary)]">
                    {preview.reporter?.display_name || preview.reporter?.username} · {timeAgo(preview.created_at, i18n?.language)}
                  </span>
                </div>
                <div className="attr-row">
                  <span className="attr-key">{t("issues.table_updated", "更新")}</span>
                  <span className="text-[11.5px] text-[var(--text-secondary)]">{timeAgo(preview.updated_at || preview.created_at, i18n?.language)}</span>
                </div>
              </div>
            </div>
            <div className="drawer-foot">
              <button onClick={() => setMsPopup({ issue: preview })} className="btn btn-outline btn-sm">
                <Flag size={12} />{t("issues.col_milestone", "里程碑")}
              </button>
              <Link to={`/issues/${preview.id}`} state={{ from: location.pathname + location.search }}
                className="btn btn-primary btn-sm ml-auto">
                <ExternalLink size={12} />{t("detail.open_full", "打开完整页")}
              </Link>
            </div>
          </aside>
        </>
      )}

      {/* Claim role modal */}
      {claimId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/25" onClick={() => { setClaimId(null); setClaimRoles([]); }}>
          <div className="card w-72 rounded-[12px] p-4 animate-[scaleIn_.15s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">{t("roles.title")}</h3>
              <button onClick={() => { setClaimId(null); setClaimRoles([]); }} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={14} /></button>
            </div>
            {claimMode === "bulk" && <p className="mb-2 text-[11px] text-[var(--text-muted)]">{t("bulk.selected", { count: selected.size })}</p>}
            <div className="mb-3 space-y-0.5">
              {myRoles.map(r => (
                <label key={r} className={`flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] transition-colors ${claimRoles.includes(r) ? "bg-[var(--primary-subtle)] font-medium text-[var(--primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"}`}>
                  <input type="checkbox" checked={claimRoles.includes(r)} onChange={() => toggleClaimRole(r)} className="rounded accent-[var(--primary)]" />
                  <span className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>
                </label>
              ))}
            </div>
            <button onClick={doClaim} disabled={claimRoles.length === 0} className="btn btn-primary btn-sm w-full">{t("common.confirm")}</button>
          </div>
        </div>
      )}

      {/* Status / priority popup (single + bulk) */}
      {(popup || bulkField) && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/25 sm:items-center"
          onClick={() => { setPopup(null); setBulkField(null); }}>
          <div className="w-full max-w-xs rounded-t-2xl bg-white p-4 shadow-[var(--shadow-md)] animate-[fadeInUp_.15s_ease-out] sm:rounded-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">
                {(popup?.type ?? bulkField) === "status" ? t("common.status") : t("common.priority")}
                {bulkField && <span className="ml-1.5 font-normal text-[var(--text-muted)]">· {t("bulk.selected", { count: selected.size })}</span>}
              </h3>
              <button onClick={() => { setPopup(null); setBulkField(null); }} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={14} /></button>
            </div>
            <div className="space-y-0.5">
              {((popup?.type ?? bulkField) === "status" ? STAT : PRIS).map(v => {
                const current = popup ? (popup.type === "status" ? popup.issue.status : popup.issue.priority) : null;
                return (
                  <button key={v}
                    onClick={async () => {
                      if (bulkField) await bulkApply(bulkField, v);
                      else if (popup) { await doPopup(popup.issue.id, popup.type, v); setPopup(null); }
                    }}
                    className={`flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-[13px] font-medium transition-all hover:bg-[var(--bg-hover)] ${
                      v === current ? "bg-[var(--primary-subtle)] text-[var(--primary)]" : "text-[var(--text-secondary)]"
                    }`}>
                    <span className={(popup?.type ?? bulkField) === "status" ? `status-${v}` : `priority-${v} rounded-[4px] px-2 py-0.5 text-[11px]`}>
                      {(popup?.type ?? bulkField) === "status" ? t(`issues.status.${v}`) : t(`issues.priority.${v}`)}
                    </span>
                    {v === current && <span className="ml-auto text-[11px] font-semibold text-[var(--primary)]">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Label popup */}
      {labelPopup && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/25 sm:items-center" onClick={() => setLabelPopup(null)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-[var(--shadow-md)] animate-[fadeInUp_.15s_ease-out] sm:rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">{t("common.labels")}</h3>
              <button onClick={() => setLabelPopup(null)} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={14} /></button>
            </div>
            <div className="flex max-h-60 flex-wrap gap-1.5 overflow-y-auto">
              {labels.map(l => {
                const active = (labelPopup.labels || []).some(il => il.id === l.id);
                return (
                  <button key={l.id} onClick={() => doLabel(labelPopup.id, l.id)}
                    className={`shrink-0 rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-all active:scale-95 ${active ? "ring-2 ring-offset-1" : "border border-[var(--border)] hover:border-[#d1d5db]"}`}
                    style={active ? { backgroundColor: l.color + "18", color: l.color } : { color: "var(--text-secondary)" }}>
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Milestone popup */}
      {msPopup && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/25 sm:items-center" onClick={() => setMsPopup(null)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-[var(--shadow-md)] animate-[fadeInUp_.15s_ease-out] sm:rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[13px] font-semibold"><Flag size={14} className="text-violet-500" />{t("issues.col_milestone", "里程碑")}</h3>
              <button onClick={() => setMsPopup(null)} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={14} /></button>
            </div>
            <p className="mb-3 truncate text-[11px] text-[var(--text-muted)]">#{msPopup.issue.id.slice(0, 8)} {msPopup.issue.title}</p>
            {milestones.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-[var(--text-muted)]">{t("milestone.no_milestones")}</p>
            ) : (
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {milestones.map(m => {
                  const linked = (msPopup.issue.milestone_ids || []).includes(m.id);
                  return (
                    <button key={m.id} onClick={() => toggleMilestone(msPopup.issue.id, m.id)}
                      className={`flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-[13px] transition-all hover:bg-[var(--bg-hover)] ${linked ? "bg-violet-50" : ""}`}>
                      <span className="flex items-center gap-2">
                        <span className="text-[10px]">{m.status === "open" ? "🟢" : m.status === "published" ? "🔵" : "⚫"}</span>
                        <span className={linked ? "font-medium text-violet-700" : "text-[var(--text-secondary)]"}>{m.name}</span>
                      </span>
                      {linked && <span className="text-[11px] font-medium text-violet-500">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
