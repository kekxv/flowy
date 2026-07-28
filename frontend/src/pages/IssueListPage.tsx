import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, X, UserPlus, Flag, Filter, ChevronDown } from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { listIssues, type IssueData } from "../api/issues";
import { ALL_ROLES, STAT, PRIS } from "../constants";
import Loader from "../components/Loader";
import { timeAgo } from "../utils/time";

function FilterPill({ label, value, values, onChange, filterOpen, setFilterOpen }: {
  label: string; value: string;
  values: Array<{ key: string; label: string; cls?: string }>;
  onChange: (v: string) => void;
  filterOpen: string | null; setFilterOpen: (v: string | null) => void;
}) {
  const active = value !== "all";
  const currentLabel = values.find(v => v.key === value)?.label || "All";
  return (
    <div className="relative">
      <button onClick={() => setFilterOpen(filterOpen === label ? null : label)}
        className={`flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
          active ? "border-[var(--primary)]/30 bg-[var(--primary-subtle)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[#d1d5db] hover:text-[var(--text-secondary)]"
        }`}>
        {label}: <span className="font-semibold">{currentLabel}</span>
        <ChevronDown size={12} className={`transition-transform ${filterOpen === label ? "rotate-180" : ""}`} />
      </button>
      {filterOpen === label && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(null)} />
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[140px] rounded-[8px] border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-md)] animate-[fadeInUp_.12s_ease-out]">
            <button onClick={() => { onChange("all"); setFilterOpen(null); }}
              className={`flex w-full items-center px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[#f9fafb] ${!active ? "font-semibold text-[var(--primary)]" : "text-[var(--text-secondary)]"}`}>
              All
            </button>
            {values.map(v => (
              <button key={v.key} onClick={() => { onChange(v.key); setFilterOpen(null); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[#f9fafb] ${value === v.key ? "font-semibold text-[var(--primary)]" : "text-[var(--text-secondary)]"}`}>
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
  const { t } = useTranslation();
  const [sp] = useSearchParams(); const user = useAuthStore(s => s.user);
  const [issues, setIssues] = useState<IssueData[]>([]); const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1); const [status, setStatus] = useState(sp.get("status") || "all");
  const [priority, setPriority] = useState(sp.get("priority") || "all");
  const [q, setQ] = useState(sp.get("q") || ""); const [searchQ, setSearchQ] = useState(sp.get("q") || "");
  const [issueType, setIssueType] = useState(sp.get("issue_type") || "all");
  const [milestones, setMilestones] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [labelId, setLabelId] = useState(sp.get("label_id") || "");
  const [activeTimerIds, setActiveTimerIds] = useState<Set<string>>(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState<string | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimRoles, setClaimRoles] = useState<string[]>([]);
  const [myRoles, setMyRoles] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const doPopup = async (id: string, field: string, value: string) => {
    try { await api.put(`/issues/${id}`, { [field]: value }); fetch(); }
    catch (err: any) { showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error", "Failed")); }
  };
  const openClaim = async (issueId: string) => {
    setClaimId(issueId); setClaimRoles([]);
    try { const r = await api.get("/auth/me/project-roles"); setMyRoles(r.data); } catch { setMyRoles([...ALL_ROLES]); }
  };
  const toggleClaimRole = (r: string) => setClaimRoles(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const doClaim = async () => {
    if (!user || !claimId || claimRoles.length === 0) return;
    try {
      const r = await api.get(`/issues/${claimId}`);
      const current = (r.data.assignees || []).map((a: any) => ({ user_id: a.id, role: a.role }));
      for (const role of claimRoles) {
        if (!current.some((a: any) => a.user_id === user.id && a.role === role)) current.push({ user_id: user.id, role });
      }
      await api.put(`/issues/${claimId}`, { assignees: current });
      setClaimId(null); setClaimRoles([]); fetch();
    } catch (err: any) { showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error", "Failed")); }
  };

  const fetch = () => {
    setLoading(true); const p: Record<string, string> = { page: String(page), per_page: "20" };
    if (status !== "all") p.status = status; if (priority !== "all") p.priority = priority; if (q) p.q = q; if (labelId) p.label_id = labelId;
    if (issueType !== "all") p.issue_type = issueType;
    if (sp.get("reporter") === "me" && user) p.reporter_id = user.id;
    listIssues(p).then(r => { setIssues(r.data); setTotal(r.meta.total); setLoading(false); });
  };
  useEffect(() => { api.get("/milestones").then(r => setMilestones(r.data)); }, []);
  useEffect(() => { const poll = () => api.get("/dashboard").then(r => { const ids = new Set<string>((r.data.active_timers || []).map((t: any) => t.issue_id as string)); setActiveTimerIds(ids); }); poll(); const i = setInterval(poll, 15000); return () => clearInterval(i); }, []);
  useEffect(fetch, [page, status, priority, q, labelId, issueType]);

  const hasFilters = status !== "all" || priority !== "all" || labelId || issueType !== "all";

  return (
    <div className="mx-auto max-w-5xl space-y-4 page-enter">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-[8px] bg-red-50 border border-red-100 px-3 py-2 text-[12px] text-red-600 shadow-sm">{toast}</div>}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">{t("issues.title")}</h1>
          {total > 0 && <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{total} issues</p>}
        </div>
        <Link to="/issues/new" className="btn btn-primary btn-sm">
          <svg width="13" height="13" viewBox="0 0 15 15" fill="none"><path d="M7.5 3v9M3 7.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          {t("issues.new_issue")}
        </Link>
      </div>

      {/* Filter bar */}
      <div className="card rounded-[8px] px-3 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setQ(searchQ); setPage(1); } }}
              placeholder={t("common.search") + "…"}
              className="w-full rounded-[6px] border border-transparent bg-transparent py-1.5 pl-7 pr-7 text-[13px] outline-none transition-colors hover:bg-[#f9fafb] focus:border-[var(--border)] focus:bg-white"
            />
            {searchQ && (
              <button onClick={() => { setSearchQ(""); setQ(""); setPage(1); }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-muted)] transition-colors">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterPill label="Type" value={issueType} onChange={v => { setIssueType(v); setPage(1); }} filterOpen={filterOpen} setFilterOpen={setFilterOpen}
              values={[{ key: "bug", label: "Bug" }, { key: "feature", label: "Feature" }]} />
            <FilterPill label={t("common.status")} value={status} onChange={v => { setStatus(v); setPage(1); }} filterOpen={filterOpen} setFilterOpen={setFilterOpen}
              values={STAT.map(s => ({ key: s, label: t(`issues.status.${s}`), cls: `status-${s}` }))} />
            <FilterPill label={t("common.priority")} value={priority} onChange={v => { setPriority(v); setPage(1); }} filterOpen={filterOpen} setFilterOpen={setFilterOpen}
              values={PRIS.map(p => ({ key: p, label: t(`issues.priority.${p}`), cls: `priority-${p}` }))} />
          </div>

          {hasFilters && (
            <button onClick={() => { setStatus("all"); setPriority("all"); setLabelId(""); setIssueType("all"); setPage(1); }}
              className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">
              <X size={12} />Clear
            </button>
          )}
        </div>
      </div>

      {/* Issue list */}
      {loading ? <Loader />
        : issues.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16 rounded-[8px] text-[var(--text-muted)]">
            <Filter size={28} className="mb-2 opacity-20" strokeWidth={1.5} />
            <p className="text-[13px]">{t("issues.no_issues")}</p>
          </div>
        ) : (
          <div className="card overflow-hidden rounded-[8px]">
            <div className="divide-y divide-[var(--border-light)]">
              {issues.map((issue) => (
                <div key={issue.id} className="group transition-colors hover:bg-[#f9fafb]">
                  <Link to={`/issues/${issue.id}`} className="flex items-center gap-2.5 px-3.5 py-2.5" style={{ minHeight: 46 }}>
                    {/* Status */}
                    <span className={`status-${issue.status} text-[11px] shrink-0 hidden sm:inline-flex`}>{t(`issues.status.${issue.status}`)}</span>

                    {/* Type + ID */}
                    <div className="flex items-center gap-1.5 shrink-0 w-[90px]">
                      <span className={`rounded-[4px] px-1 py-0.5 text-[9px] font-semibold uppercase ${(issue as any).issue_type === "feature" ? "bg-violet-50 text-violet-600" : "bg-amber-50 text-amber-600"}`}>
                        {t(`issues.type.${(issue as any).issue_type || "bug"}`)}
                      </span>
                      <span className="mono text-[11px] text-[var(--text-faint)]">#{issue.id.slice(0, 6)}</span>
                    </div>

                    {/* Title + meta */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {activeTimerIds.has(issue.id) && <span className="flex h-1.5 w-1.5 shrink-0"><span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative h-1.5 w-1.5 rounded-full bg-red-500" /></span>}
                        <span className="truncate text-[13px] font-medium text-[var(--text)]">{issue.title}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span className="text-[var(--text-faint)]">{issue.reporter?.display_name || issue.reporter?.username}</span>
                        <span className="text-[var(--text-faint)]">·</span>
                        <span className="text-[var(--text-faint)]">{timeAgo(issue.created_at)}</span>
                        {issue.labels?.slice(0, 2).map((l: any) => (
                          <span key={l.id} className="rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: l.color + "0a", color: l.color, borderColor: l.color + "20" }}>{l.name}</span>
                        ))}
                        {(issue as any).milestone_ids?.length > 0 && (issue as any).milestone_ids.map((mid: string) => {
                          const m = milestones.find(x => x.id === mid);
                          return m ? <span key={mid} className="flex items-center gap-0.5 rounded-[4px] bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"><Flag size={8} />{m.name}</span> : null;
                        })}
                      </div>
                    </div>

                    {/* Priority */}
                    <button onClick={e => { e.stopPropagation(); e.preventDefault(); doPopup(issue.id, "priority", PRIS[(PRIS.indexOf(issue.priority as any) + 1) % PRIS.length] as string); }}
                      className={`priority-${issue.priority} rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-transform hover:scale-105 shrink-0 hidden sm:inline-flex`}>
                      {t(`issues.priority.${issue.priority}`)}
                    </button>

                    {/* Assignees */}
                    <div className="flex items-center shrink-0 hidden md:flex">
                      {(issue as any).assignees?.slice(0, 2).map((a: any) => (
                        <span key={`${a.id}-${a.role}`} className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f3f4f6] text-[10px] font-semibold text-[#6b7280] ring-2 ring-white -ml-1 first:ml-0" title={`${a.display_name || a.username} (${a.role})`}>
                          {(a.display_name || a.username).slice(0, 1).toUpperCase()}
                        </span>
                      ))}
                      {(issue as any).assignees?.length > 2 && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f3f4f6] text-[9px] font-semibold text-[#6b7280] ring-2 ring-white -ml-1">+{(issue as any).assignees.length - 2}</span>
                      )}
                    </div>

                    {/* Claim button */}
                    <button onClick={e => { e.stopPropagation(); e.preventDefault(); openClaim(issue.id); }}
                      className="shrink-0 rounded p-1 text-[var(--text-faint)] hover:bg-[var(--primary-subtle)] hover:text-[var(--primary)] transition-all opacity-0 group-hover:opacity-100 hidden sm:flex">
                      <UserPlus size={13} />
                    </button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-[var(--text-muted)] tabular-nums">{(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-outline btn-sm disabled:opacity-30">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 20)} className="btn btn-outline btn-sm disabled:opacity-30">Next</button>
          </div>
        </div>
      )}

      {/* Claim role modal */}
      {claimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => { setClaimId(null); setClaimRoles([]); }}>
          <div className="card w-72 rounded-[8px] p-4 animate-[scaleIn_.15s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">{t("roles.title")}</h3>
              <button onClick={() => { setClaimId(null); setClaimRoles([]); }} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={14} /></button>
            </div>
            <div className="space-y-0.5 mb-3">
              {myRoles.map(r => (
                <label key={r} className={`flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] cursor-pointer transition-colors ${claimRoles.includes(r) ? "bg-[var(--primary-subtle)] text-[var(--primary)] font-medium" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"}`}>
                  <input type="checkbox" checked={claimRoles.includes(r)} onChange={() => toggleClaimRole(r)} className="rounded accent-[var(--primary)]" />
                  <span className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>
                </label>
              ))}
            </div>
            <button onClick={doClaim} disabled={claimRoles.length === 0} className="btn btn-primary btn-sm w-full">{t("common.confirm")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
