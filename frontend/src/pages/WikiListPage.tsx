import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Plus, BookOpen, Search, Lock, X, Clock, User, ChevronRight, List, LayoutGrid, Star, Tag } from "lucide-react";
import { listWikiPages, listWikiTags, type WikiPageData, type WikiTagCount, type WikiSort } from "../api/wiki";
import PageHeader from "../components/ui/PageHeader";
import Segmented from "../components/ui/Segmented";
import EmptyState from "../components/ui/EmptyState";
import { ListSkeleton, CardsSkeleton } from "../components/ui/Skeleton";

type Tab = "all" | "mine" | "collab" | "public";
type View = "list" | "grid";

const PER_PAGE = 20;

/** Strip Markdown down to readable text for list previews. */
function toPlainText(markdown: string | null | undefined): string {
  if (!markdown) return "";
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_>~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTags(raw: string): string[] {
  return (raw || "").split(",").map(tag => tag.trim()).filter(Boolean);
}

export default function WikiListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [sp, setSp] = useSearchParams();
  // Filter tweaks replace the history entry: typing in search should not
  // leave a trail of entries behind the back button.
  const updateQuery = (changes: Record<string, string>) => setSp(previous => {
    const next = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    return next;
  }, { replace: true });

  const search = sp.get("q") || "";
  const tabParam = sp.get("tab");
  const activeTab: Tab = tabParam === "mine" || tabParam === "collab" || tabParam === "public" ? tabParam : "all";
  const activeTag = sp.get("tag") || "";
  const viewParam = sp.get("view");
  const view: View = viewParam === "grid" ? "grid" : "list";
  const sortParam = sp.get("sort");
  const sort: WikiSort = sortParam === "weight" || sortParam === "title" ? sortParam : "updated";
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const setPage = (value: number) => updateQuery({ page: String(value) });

  const [pages, setPages] = useState<WikiPageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<WikiTagCount[]>([]);
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);

  const origin = location.pathname + location.search;

  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listWikiPages({
        q: search || undefined,
        tab: activeTab,
        tag: activeTag || undefined,
        sort,
        page,
        per_page: PER_PAGE,
      });
      setPages(res.data);
      setTotal(res.meta.total);
    } catch {
      setPages([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, activeTab, activeTag, sort, page]);

  useEffect(() => { void fetchPages(); }, [fetchPages]);

  // Tag facets: refreshed with the tab so the chips always match the result set.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listWikiTags({ tab: activeTab });
        if (alive) setTags(data);
      } catch {
        if (alive) setTags([]);
      }
    })();
    return () => { alive = false; };
  }, [activeTab]);

  // Debounced live search (Enter still applies immediately).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim() !== search) updateQuery({ q: value.trim(), page: "" });
    }, 350);
  };
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: t("wiki.tab_all", "全部") },
    { key: "mine", label: t("wiki.tab_mine", "我的") },
    { key: "collab", label: t("wiki.tab_collab", "协作") },
    { key: "public", label: t("wiki.tab_public", "公开") },
  ];

  const formatRelative = useCallback((dateStr: string) => {
    const time = new Date(dateStr).getTime();
    if (Number.isNaN(time)) return "";
    const diff = Date.now() - time;
    if (diff < 60_000) return t("wiki.just_now", "刚刚");
    if (diff < 3_600_000) return t("wiki.minutes_ago", { n: Math.floor(diff / 60_000), defaultValue: "{{n}} 分钟前" });
    if (diff < 86_400_000) return t("wiki.hours_ago", { n: Math.floor(diff / 3_600_000), defaultValue: "{{n}} 小时前" });
    if (diff < 7 * 86_400_000) return t("wiki.days_ago", { n: Math.floor(diff / 86_400_000), defaultValue: "{{n}} 天前" });
    return new Date(dateStr).toLocaleDateString(i18n?.language === "en" ? "en-US" : "zh-CN");
  }, [t, i18n?.language]);

  const count = total > 0 ? total : pages.length;
  const newPage = () => navigate("/wiki/new", { state: { from: origin } });
  const openPage = (id: string) => navigate(`/wiki/${id}`, { state: { from: origin } });
  const filtered = Boolean(search || activeTag);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const sortOptions: { value: WikiSort; label: string }[] = [
    { value: "updated", label: t("wiki.sort_updated", "最近更新") },
    { value: "weight", label: t("wiki.sort_weight", "置顶优先") },
    { value: "title", label: t("wiki.sort_title", "标题排序") },
  ];

  const ownerInitial = (pageItem: WikiPageData) =>
    (pageItem.owner_display_name || pageItem.owner_name || "?").slice(0, 1).toUpperCase();

  const emptyState = useMemo(() => (
    <div className="panel">
      <EmptyState
        icon={BookOpen}
        title={filtered ? t("wiki.no_match", "没有匹配的页面") : t("wiki.no_pages", "还没有页面")}
        hint={filtered
          ? t("wiki.no_match_hint", "换个关键词或清空筛选条件试试")
          : t("wiki.empty_hint", "创建第一篇知识库页面，把结论沉淀下来。")}
        action={filtered ? (
          <button onClick={() => updateQuery({ q: "", tag: "", page: "" })} className="btn btn-outline btn-sm">
            <X size={13} />{t("wiki.clear_filters", "清空筛选")}
          </button>
        ) : (
          <button onClick={newPage} className="btn btn-outline btn-sm">
            <Plus size={14} />{t("wiki.create_first", "创建页面")}
          </button>
        )}
      />
    </div>
  ), [filtered, t]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page-enter mx-auto max-w-5xl">
      <PageHeader
        icon={BookOpen}
        title={t("wiki.title", "知识库")}
        subtitle={t("wiki.pages_count_label", { n: count, defaultValue: "{{n}} 个页面" })}
        actions={
          <button onClick={newPage} className="btn btn-primary btn-sm">
            <Plus size={14} strokeWidth={2} />
            {t("wiki.new_page", "新建页面")}
          </button>
        }
      />

      {/* Toolbar */}
      <div className="panel mb-2.5 p-2.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={14} strokeWidth={1.8} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              type="text"
              value={searchInput}
              onChange={e => onSearchChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { if (debounceRef.current) clearTimeout(debounceRef.current); updateQuery({ q: searchInput.trim(), page: "" }); } }}
              placeholder={t("wiki.search_placeholder", "搜索标题、标签或概要…")}
              className="h-8 w-full rounded-[7px] border border-transparent bg-[var(--bg-muted)] pl-9 pr-9 text-[12.5px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--text-faint)] focus:border-[var(--primary)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,.08)]"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(""); updateQuery({ q: "", page: "" }); }}
                aria-label={t("common.clear", "清空")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-muted)]">
                <X size={13} />
              </button>
            )}
          </div>
          <Segmented
            ariaLabel={t("wiki.tabs", "分类")}
            value={activeTab}
            onChange={key => updateQuery({ tab: key === "all" ? "" : key, page: "" })}
            items={tabs.map(item => ({ key: item.key, label: item.label }))}
          />
          <div className="flex items-center gap-1.5">
            <select
              value={sort}
              onChange={e => updateQuery({ sort: e.target.value === "updated" ? "" : e.target.value, page: "" })}
              aria-label={t("wiki.sort", "排序")}
              className="h-8 rounded-[7px] border border-[var(--border)] bg-white px-2 text-[12px] text-[var(--text-secondary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)]"
            >
              {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <Segmented
              size="sm"
              ariaLabel={t("wiki.view", "视图")}
              value={view}
              onChange={next => updateQuery({ view: next === "list" ? "" : next })}
              items={[
                { key: "list", label: <List size={13} />, title: t("wiki.view_list", "列表") },
                { key: "grid", label: <LayoutGrid size={13} />, title: t("wiki.view_grid", "卡片") },
              ]}
            />
          </div>
        </div>

        {tags.length > 0 && (
          <div className="mt-2 flex flex-nowrap items-center gap-1.5 overflow-x-auto border-t border-[var(--border-light)] pt-2 sm:flex-wrap sm:overflow-visible">
            <span className="inline-flex shrink-0 items-center gap-1 pr-0.5 text-[11px] text-[var(--text-faint)]"><Tag size={11} />{t("wiki.tags", "标签")}</span>
            <button
              onClick={() => updateQuery({ tag: "", page: "" })}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] transition-colors ${activeTag ? "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" : "bg-[var(--primary-subtle)] font-medium text-[var(--primary)]"}`}
            >
              {t("common.all", "全部")}
            </button>
            {tags.slice(0, 14).map(item => (
              <button
                key={item.tag}
                onClick={() => updateQuery({ tag: activeTag === item.tag ? "" : item.tag, page: "" })}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] transition-colors ${activeTag === item.tag ? "bg-[var(--primary-subtle)] font-medium text-[var(--primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"}`}
              >
                {item.tag}<span className="ml-1 tabular-nums opacity-50">{item.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        view === "grid" ? <CardsSkeleton cards={6} /> : <ListSkeleton rows={5} />
      ) : pages.length === 0 ? emptyState : view === "grid" ? (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {pages.map(pageItem => {
            const preview = toPlainText(pageItem.summary || pageItem.content);
            const pageTags = parseTags(pageItem.tags).slice(0, 2);
            return (
              <article
                key={pageItem.id}
                onClick={() => openPage(pageItem.id)}
                className="panel group flex cursor-pointer flex-col p-3.5 transition-all hover:-translate-y-px hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-[var(--bg-muted)] text-[var(--text-faint)] transition-colors group-hover:bg-[var(--primary-subtle)] group-hover:text-[var(--primary)]">
                    <BookOpen size={13} strokeWidth={1.8} />
                  </span>
                  <h3 className="line-clamp-2 flex-1 text-[13px] font-semibold leading-snug text-[var(--text)] transition-colors group-hover:text-[var(--primary)]">
                    {pageItem.title}
                  </h3>
                  {!pageItem.is_public && <Lock size={11} className="mt-0.5 shrink-0 text-[var(--text-faint)]" strokeWidth={1.8} />}
                </div>
                <p className="mt-2 line-clamp-3 min-h-[3.4em] text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                  {preview || t("wiki.empty_content", "暂无内容")}
                </p>
                {pageTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {pageTags.map(tag => (
                      <span key={tag} className="rounded-[4px] bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{tag}</span>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center gap-1.5 border-t border-[var(--border-light)] pt-2 text-[10.5px] text-[var(--text-faint)]">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--primary-subtle)] text-[8px] font-bold text-[var(--primary)]">
                    {ownerInitial(pageItem)}
                  </span>
                  <span className="truncate">{pageItem.owner_display_name || pageItem.owner_name}</span>
                  <span className="opacity-50">·</span>
                  <span className="shrink-0">{formatRelative(pageItem.updated_at)}</span>
                  {pageItem.weight > 0 && (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-amber-500"><Star size={9} fill="currentColor" />{pageItem.weight}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="divide-y divide-[var(--border-light)]">
            {pages.map(pageItem => {
              const preview = toPlainText(pageItem.summary || pageItem.content);
              const pageTags = parseTags(pageItem.tags).slice(0, 3);
              return (
                <div
                  key={pageItem.id}
                  onClick={() => openPage(pageItem.id)}
                  className="group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-[var(--bg-muted)] text-[var(--text-faint)] transition-colors group-hover:bg-[var(--primary-subtle)] group-hover:text-[var(--primary)]">
                    <BookOpen size={14} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[13px] font-semibold text-[var(--text)] transition-colors group-hover:text-[var(--primary)]">
                        {pageItem.title}
                      </h3>
                      {!pageItem.is_public && <Lock size={11} className="shrink-0 text-[var(--text-faint)]" strokeWidth={1.8} />}
                      {pageItem.weight > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-medium text-amber-500">
                          <Star size={9} fill="currentColor" />{pageItem.weight}
                        </span>
                      )}
                    </div>
                    {preview && (
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--text-muted)]">{preview}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-faint)]">
                      <span className="inline-flex items-center gap-1"><User size={10.5} strokeWidth={1.8} />{pageItem.owner_display_name || pageItem.owner_name}</span>
                      <span className="opacity-50">·</span>
                      <span className="inline-flex items-center gap-1"><Clock size={10.5} strokeWidth={1.8} />{formatRelative(pageItem.updated_at)}</span>
                      {pageTags.map(tag => (
                        <span key={tag} className="rounded-[4px] bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight size={15} strokeWidth={1.8} className="mt-1 shrink-0 text-[var(--text-faint)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {total > PER_PAGE && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11.5px] tabular-nums text-[var(--text-muted)]">
            {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} / {total}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="btn btn-outline btn-sm disabled:opacity-30">
              {t("common.prev", "上一页")}
            </button>
            <span className="px-1.5 text-[11.5px] tabular-nums text-[var(--text-muted)]">{page} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="btn btn-outline btn-sm disabled:opacity-30">
              {t("common.next", "下一页")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
