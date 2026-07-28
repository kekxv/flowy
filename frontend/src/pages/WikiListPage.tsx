import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Plus, BookOpen, Search, Lock, X } from "lucide-react";
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

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: t("wiki.tab_all", "All") },
    { key: "mine", label: t("wiki.tab_mine", "My Wiki") },
    { key: "collab", label: t("wiki.tab_collab", "Collaborations") },
    { key: "public", label: t("wiki.tab_public", "Public") },
  ];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return t("wiki.just_now", "Just now");
    if (diff < 3600000) return `${Math.floor(diff / 60000)}${t("wiki.min_ago", "m ago")}`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}${t("wiki.hour_ago", "h ago")}`;
    return d.toLocaleDateString();
  };

  const getPreview = (content: string, maxLen = 120) => {
    if (!content) return t("wiki.empty_content", "No content");
    const plain = content.replace(/[#*>[\]()!|-]/g, "").trim();
    return plain.length > maxLen ? plain.slice(0, maxLen) + "..." : plain;
  };

  if (loading && pages.length === 0) return <Loader />;

  return (
    <div className="mx-auto max-w-4xl space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{t("wiki.title", "Knowledge Base")}</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            {total > 0 ? total : pages.length} {t("wiki.pages_count", "pages")}
          </p>
        </div>
        <button onClick={() => navigate("/wiki/new")} className="btn btn-primary">
          <Plus size={15} />
          {t("wiki.new_page", "New Page")}
        </button>
      </div>

      {/* Search + Tabs */}
      <div className="card rounded-xl p-4 space-y-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
            placeholder={t("wiki.search_placeholder", "Search wiki…")}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2.5 pl-9 pr-9 text-[13px] text-[var(--text)] outline-none transition-all focus:border-[var(--primary)] focus:bg-[var(--bg-card)] focus:shadow-[0_0_0_3px_rgba(37,99,235,.08)]"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Page List — Notion-style borderless */}
      {pages.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 rounded-[8px] text-[var(--text-muted)]">
          <BookOpen size={28} className="mb-2 opacity-20" strokeWidth={1.5} />
          <p className="text-[13px]">{t("wiki.no_pages", "No wiki pages found")}</p>
          {activeTab === "all" && !search && (
            <button onClick={() => navigate("/wiki/new")} className="btn btn-outline btn-sm mt-4">
              <Plus size={14} />{t("wiki.create_first", "Create your first page")}
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-light)]">
          {pages.map((page) => (
            <div
              key={page.id}
              onClick={() => navigate(`/wiki/${page.id}`)}
              className="flex items-start gap-3 px-3 py-3 cursor-pointer transition-colors hover:bg-[#f9fafb] group"
            >
              <BookOpen size={16} strokeWidth={1.8} className="mt-0.5 text-[var(--text-faint)] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[14px] font-semibold truncate text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">
                    {page.title}
                  </h3>
                  {!page.is_public && (
                    <Lock size={11} className="text-[var(--text-faint)] shrink-0" />
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)] line-clamp-1">
                  {getPreview(page.content)}
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--text-faint)]">
                  <span>{page.owner_display_name || page.owner_name}</span>
                  <span>·</span>
                  <span>{formatDate(page.updated_at)}</span>
                  {page.weight > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-amber-500">★ {page.weight}</span>
                    </>
                  )}
                  {page.tags && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        {page.tags.split(",").filter(t => t.trim()).slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-[4px] bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                            {tag.trim()}
                          </span>
                        ))}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-[var(--text-muted)]">
            {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-outline btn-sm disabled:opacity-30">
              Prev
            </button>
            <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / PER_PAGE)} className="btn btn-outline btn-sm disabled:opacity-30">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
