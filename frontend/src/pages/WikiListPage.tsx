import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Plus, BookOpen, Search, Globe, Lock, Clock, X } from "lucide-react";
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
          <h1 className="text-2xl font-bold tracking-tight text-gradient">{t("wiki.title", "Knowledge Base")}</h1>
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2.5 pl-9 pr-9 text-[13px] text-[var(--text)] outline-none transition-all focus:border-[var(--primary)] focus:bg-[var(--bg-card)] focus:shadow-[0_0_0_3px_rgba(79,110,247,.08)]"
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
                  ? "bg-gradient-to-r from-[#4f6ef7] to-[#8b5cf6] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Page List */}
      {pages.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 rounded-xl text-[var(--text-muted)]">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-muted)]">
            <BookOpen size={32} className="text-[var(--text-muted)]/50" />
          </div>
          <p className="text-[15px] font-medium text-[var(--text-secondary)]">{t("wiki.no_pages", "No wiki pages found")}</p>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            {search ? "Try a different search term" : "Start by creating your first page"}
          </p>
          {activeTab === "all" && !search && (
            <button onClick={() => navigate("/wiki/new")} className="btn btn-primary btn-sm mt-5">
              <Plus size={14} />
              {t("wiki.create_first", "Create your first page")}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {pages.map((page) => (
            <div
              key={page.id}
              onClick={() => navigate(`/wiki/${page.id}`)}
              className="card rounded-xl p-4 cursor-pointer hover-lift group"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4f6ef7]/10 to-[#8b5cf6]/10 text-[var(--primary)] ring-1 ring-[var(--primary)]/10">
                  <BookOpen size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-semibold truncate group-hover:text-[var(--primary)] transition-colors">
                      {page.title}
                    </h3>
                    {page.is_public ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 border border-emerald-200/50 shrink-0">
                        <Globe size={9} />
                        {t("wiki.public", "Public")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)] border shrink-0">
                        <Lock size={9} />
                        {t("wiki.private", "Private")}
                      </span>
                    )}
                    {page.weight > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 border border-amber-200/50">
                        ★ {page.weight}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[12px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                    {getPreview(page.content)}
                  </p>
                  <div className="mt-2.5 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-[#4f6ef7]/12 to-[#8b5cf6]/12 text-[8px] font-bold text-[var(--primary)]">
                        {(page.owner_display_name || page.owner_name).charAt(0).toUpperCase()}
                      </span>
                      {page.owner_display_name || page.owner_name}
                    </span>
                    <span className="text-[var(--border)]">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={10} className="text-[var(--text-muted)]/60" />
                      {formatDate(page.updated_at)}
                    </span>
                    {page.tags && (
                      <>
                        <span className="text-[var(--border)]">·</span>
                        <span className="flex items-center gap-1 flex-wrap">
                          {page.tags.split(",").filter(t => t.trim()).slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-gradient-to-r from-[#4f6ef7]/6 to-[#8b5cf6]/6 px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)]"
                            >
                              {tag.trim()}
                            </span>
                          ))}
                        </span>
                      </>
                    )}
                  </div>
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
