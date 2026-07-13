import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Plus, BookOpen, Search, Globe, Lock, Clock, User } from "lucide-react";
import { listWikiPages, type WikiPageData } from "../api/wiki";
import Loader from "../components/Loader";

type Tab = "all" | "mine" | "collab" | "public";

export default function WikiListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [pages, setPages] = useState<WikiPageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("all");

  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listWikiPages({ q: search || undefined, tab: activeTab });
      setPages(data);
    } finally {
      setLoading(false);
    }
  }, [search, activeTab]);

  useEffect(() => {
    const timer = setTimeout(fetchPages, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchPages, search]);

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
          <h1 className="text-2xl font-bold tracking-tight">{t("wiki.title", "Knowledge Base")}</h1>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            {pages.length} {t("wiki.pages_count", "pages")}
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
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("wiki.search_placeholder", "Search wiki...")}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-2 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none transition-all focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_rgba(79,110,247,.12)]"
          />
        </div>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-[var(--primary)]/10 text-[var(--primary)]"
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
        <div className="card flex flex-col items-center justify-center py-16 rounded-xl text-[var(--text-muted)]">
          <BookOpen size={40} className="opacity-30" />
          <p className="mt-3 text-sm">{t("wiki.no_pages", "No wiki pages found")}</p>
          {activeTab === "all" && (
            <button onClick={() => navigate("/wiki/new")} className="btn btn-outline btn-sm mt-4">
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
              className="card rounded-xl p-4 cursor-pointer hover:border-[var(--primary)]/30 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/8 text-[var(--primary)]">
                  <BookOpen size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold truncate group-hover:text-[var(--primary)] transition-colors">
                      {page.title}
                    </h3>
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
                  <p className="mt-1 text-[12px] text-[var(--text-secondary)] line-clamp-2">
                    {getPreview(page.content)}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <User size={11} />
                      {page.owner_display_name || page.owner_name}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      {formatDate(page.updated_at)}
                    </span>
                    {page.weight > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-200">
                        ★ {page.weight}
                      </span>
                    )}
                    {page.tags && (
                      <span className="flex items-center gap-1 flex-wrap">
                        {page.tags.split(",").slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-[var(--primary)]/8 px-1.5 py-0.5 text-[10px] text-[var(--primary)]"
                          >
                            {tag.trim()}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
