import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Plus, BookOpen, Search, Lock, X, Clock, User } from "lucide-react";
import { listWikiPages, type WikiPageData } from "../api/wiki";
import Loader from "../components/Loader";

type Tab = "all" | "mine" | "collab" | "public";

export default function WikiListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [pages, setPages] = useState<WikiPageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PER_PAGE = 20;
  const didMount = useRef(false);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listWikiPages({ q: search || undefined, tab: activeTab, page, per_page: PER_PAGE });
      setPages(res.data);
      setTotal(res.meta.total);
    } finally {
      setLoading(false);
    }
  }, [search, activeTab, page]);

  useEffect(() => {
    if (didMount.current) fetchPages();
    else { didMount.current = true; fetchPages(); }
  }, [fetchPages]);

  const tabs: { key: Tab; label: string; icon?: string }[] = [
    { key: "all", label: t("wiki.tab_all", "全部") },
    { key: "mine", label: t("wiki.tab_mine", "我的") },
    { key: "collab", label: t("wiki.tab_collab", "协作") },
    { key: "public", label: t("wiki.tab_public", "公开") },
  ];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return d.toLocaleDateString("zh-CN");
  };

  const getPreview = (content: string, maxLen = 140) => {
    if (!content) return "暂无内容";
    const plain = content.replace(/[#*>[\]()!|-]/g, "").trim();
    return plain.length > maxLen ? plain.slice(0, maxLen) + "…" : plain;
  };

  if (loading && pages.length === 0) return <Loader />;

  const count = total > 0 ? total : pages.length;

  return (
    <div className="mx-auto max-w-3xl page-enter">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-[var(--text)]">{t("wiki.title", "知识库")}</h1>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            {count} {t("wiki.pages_count", "个页面")}
          </p>
        </div>
        <button
          onClick={() => navigate("/wiki/new")}
          className="btn btn-primary text-[13px]"
        >
          <Plus size={14} strokeWidth={2.5} />
          {t("wiki.new_page", "新建页面")}
        </button>
      </div>

      {/* Search + Tabs bar — compact inline */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} strokeWidth={1.8} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
            placeholder={t("wiki.search_placeholder", "搜索知识库…")}
            className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--bg)] py-[9px] pl-9 pr-9 text-[13px] text-[var(--text)] outline-none transition-all placeholder:text-[var(--text-faint)] hover:border-[#d1d5db] focus:border-[var(--primary)] focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,.08)]"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-muted)] transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs — minimal pill row */}
      <div className="mb-5 flex items-center gap-0.5 border-b border-[var(--border-light)] pb-2.5">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
            className={`rounded-[6px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {search && (
          <span className="ml-2 text-[12px] text-[var(--text-faint)]">
            搜索: "{search}"
            <button onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }} className="ml-1 text-[var(--text-muted)] hover:text-red-500">×</button>
          </span>
        )}
      </div>

      {/* Page List */}
      {pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-[var(--text-muted)]">
          <BookOpen size={36} className="mb-3 opacity-15" strokeWidth={1.5} />
          <p className="text-[14px] font-medium text-[var(--text-secondary)]">{t("wiki.no_pages", "没有页面")}</p>
          <p className="mt-1 text-[12px]">
            {search ? "换个关键词试试" : "点击下方按钮创建你的第一篇知识库"}
          </p>
          {activeTab === "all" && !search && (
            <button onClick={() => navigate("/wiki/new")} className="btn btn-outline btn-sm mt-5">
              <Plus size={14} />{t("wiki.create_first", "创建页面")}
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-light)]">
          {pages.map(page => {
            const preview = getPreview(page.content);
            const hasPreview = preview !== "暂无内容";
            return (
              <div
                key={page.id}
                onClick={() => navigate(`/wiki/${page.id}`)}
                className="group flex items-start gap-3.5 px-1 py-4 cursor-pointer transition-colors hover:bg-[#f8fafc] rounded-[6px]"
              >
                <BookOpen size={18} strokeWidth={1.8} className="mt-0.5 text-[var(--text-faint)] shrink-0 group-hover:text-[var(--primary)] transition-colors" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-semibold truncate text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">
                      {page.title}
                    </h3>
                    {!page.is_public && (
                      <Lock size={12} className="text-[var(--text-faint)] shrink-0" strokeWidth={1.8} />
                    )}
                  </div>
                  {hasPreview && (
                    <p className="mt-1 text-[13px] text-[var(--text-muted)] line-clamp-1 leading-relaxed">
                      {preview}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[12px] text-[var(--text-faint)]">
                    <span className="flex items-center gap-1">
                      <User size={11} strokeWidth={1.8} />
                      {page.owner_display_name || page.owner_name}
                    </span>
                    <span className="text-[var(--border)]">·</span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} strokeWidth={1.8} />
                      {formatDate(page.updated_at)}
                    </span>
                    {page.weight > 0 && (
                      <>
                        <span className="text-[var(--border)]">·</span>
                        <span className="font-medium text-amber-500">★ {page.weight}</span>
                      </>
                    )}
                    {page.tags && (
                      <>
                        <span className="text-[var(--border)]">·</span>
                        <span className="flex items-center gap-1">
                          {page.tags.split(",").filter(t => t.trim()).slice(0, 3).map(tag => (
                            <span key={tag} className="rounded-[4px] bg-[var(--bg-muted)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                              {tag.trim()}
                            </span>
                          ))}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > PER_PAGE && (
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-[var(--border-light)]">
          <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
            {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} / {total}
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-outline btn-sm disabled:opacity-30">
              上一页
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / PER_PAGE)} className="btn btn-outline btn-sm disabled:opacity-30">
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
