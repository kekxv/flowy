import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard, ListTodo, Flag, Tags, Shield, Bell, Globe, LogOut,
  Menu, X, Bot, BookOpen, Boxes, Link as LinkIcon, Search, Plus, PanelLeftClose,
  PanelLeftOpen, Bug, Lightbulb, User as UserIcon, ClipboardCheck,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import ThemePanel from "../theme/ThemePanel";
import RouteProgress from "./RouteProgress";
import PageFallback from "../ui/Skeleton";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };

function useNavGroups() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const work: NavItem[] = [
    { to: "/dashboard", label: t("dashboard.title"), icon: LayoutDashboard },
    { to: "/issues", label: t("issues.list_title", "问题与需求"), icon: ListTodo },
    { to: "/tests", label: t("tests.title", "测试管理"), icon: ClipboardCheck },
    { to: "/milestones", label: t("milestone.title"), icon: Flag },
  ];
  const knowledge: NavItem[] = [
    { to: "/wiki", label: t("wiki.title", "知识库"), icon: BookOpen },
    { to: "/software", label: t("software.title"), icon: Boxes },
    { to: "/temporary-issue-links", label: t("temporary_links.nav"), icon: LinkIcon },
  ];
  const manage: NavItem[] = [];
  if (user?.role === "admin") {
    manage.push({ to: "/labels", label: t("common.labels"), icon: Tags });
    manage.push({ to: "/admin", label: t("admin.title"), icon: Shield });
  }
  return [
    { key: "work", label: t("nav.group_work", "工作"), items: work },
    { key: "knowledge", label: t("nav.group_knowledge", "知识"), items: knowledge },
    ...(manage.length ? [{ key: "manage", label: t("nav.group_manage", "管理"), items: manage }] : []),
  ];
}

const linkCls = (isActive: boolean) => `ws-navlink${isActive ? " is-active" : ""}`;

function SidebarBody({ close, rail }: { close?: () => void; rail: boolean }) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const groups = useNavGroups();

  return (
    <>
      <Link to="/dashboard" onClick={close} className="ws-brand" title="Flowy">
        <span className="ws-brand-mark">F</span>
        <span className="ws-brand-text min-w-0">
          <span className="block text-[14px] font-semibold leading-tight tracking-tight text-[var(--text)]">Flowy</span>
          <span className="block text-[9px] font-medium tracking-[.12em] text-[var(--text-faint)]">
            {t("nav.workspace", "工作空间").toUpperCase()}
          </span>
        </span>
      </Link>

      <nav className="ws-nav">
        {groups.map(group => (
          <div key={group.key} className="ws-group">
            <p className="ws-group-label">{group.label}</p>
            <div className="space-y-[2px]">
              {group.items.map(item => (
                <NavLink key={item.to} to={item.to} onClick={close} title={rail ? item.label : undefined}
                  className={({ isActive }) => linkCls(isActive)}>
                  <item.icon size={16} strokeWidth={1.8} className="shrink-0" />
                  <span className="ws-label truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--border-light)] px-2.5 py-2 space-y-[2px]">
        <NavLink to="/settings/notifications" onClick={close} title={rail ? t("nav.notifications") : undefined}
          className={({ isActive }) => linkCls(isActive)}>
          <Bell size={16} strokeWidth={1.8} className="shrink-0" />
          <span className="ws-label truncate">{t("nav.notifications")}</span>
        </NavLink>
        {user?.role === "admin" && (
          <NavLink to="/settings/wechat-work-bot" onClick={close} title={rail ? t("wechat_work_bot.title") : undefined}
            className={({ isActive }) => linkCls(isActive)}>
            <Bot size={16} strokeWidth={1.8} className="shrink-0" />
            <span className="ws-label truncate">{t("wechat_work_bot.title", "企业微信机器人")}</span>
          </NavLink>
        )}
        <div className="ws-label">
          <ThemePanel />
        </div>
        <button
          onClick={() => i18n.changeLanguage(i18n.language === "zh" ? "en" : "zh")}
          title={i18n.language === "zh" ? "English" : "中文"}
          className="ws-navlink w-full">
          <Globe size={16} strokeWidth={1.8} className="shrink-0" />
          <span className="ws-label truncate">{i18n.language === "zh" ? "English" : "中文"}</span>
        </button>
      </div>

      {user && (
        <div className="border-t border-[var(--border-light)] p-2.5">
          <div className="group flex items-center gap-2.5 rounded-[9px] px-1.5 py-1.5 hover:bg-[var(--bg-hover)]">
            <Link to="/profile" onClick={close} className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full bg-[var(--primary-subtle)] text-[11px] font-semibold text-[var(--primary)] ring-1 ring-[var(--border)]">
                {(user.display_name || user.username).slice(0, 1).toUpperCase()}
              </span>
              <span className="ws-label min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--text)]">{user.display_name || user.username}</span>
                <span className="block truncate text-[10px] text-[var(--text-faint)]">{user.role === "admin" ? t("common.admin", "管理员") : t("roles.member")}</span>
              </span>
            </Link>
            <button onClick={() => logout()} title={t("common.sign_out")}
              className="ws-label rounded p-1 text-[var(--text-faint)] opacity-0 transition-all hover:text-red-500 group-hover:opacity-100">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function CreateMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="btn btn-primary btn-sm h-[34px] px-3">
        <Plus size={13} />
        <span className="hidden sm:inline">{t("nav.create", "新建")}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-[10px] border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-md)]">
            <Link to="/issues/new" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              <Bug size={14} className="text-amber-500" />{t("nav.new_issue", "新建问题")}
            </Link>
            <Link to="/issues/new?type=feature" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              <Lightbulb size={14} className="text-violet-500" />{t("nav.new_feature", "新建需求")}
            </Link>
            <Link to="/tests/new" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              <ClipboardCheck size={14} className="text-emerald-600" />{t("tests.new_request", "新建测试申请")}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--primary-subtle)] text-[11px] font-semibold text-[var(--primary)] ring-1 ring-[var(--border)]">
        {(user.display_name || user.username).slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-[10px] border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-md)]">
            <div className="border-b border-[var(--border-light)] px-3 py-2">
              <p className="truncate text-[12.5px] font-medium text-[var(--text)]">{user.display_name || user.username}</p>
              <p className="truncate text-[11px] text-[var(--text-faint)]">{user.email}</p>
            </div>
            <Link to="/profile" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              <UserIcon size={14} />{t("settings.profile", "个人资料")}
            </Link>
            <button onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              <LogOut size={14} />{t("common.sign_out")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const groups = useNavGroups();
  const [rail, setRail] = useState(() => localStorage.getItem("flowy.nav.rail") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { localStorage.setItem("flowy.nav.rail", rail ? "1" : "0"); }, [rail]);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const extras: NavItem[] = [
    { to: "/settings/notifications", label: t("nav.notifications", "通知"), icon: Bell },
    { to: "/settings/wechat-work-bot", label: t("nav.wechat_bot", "企业微信机器人"), icon: Bot },
    { to: "/profile", label: t("nav.profile", "个人中心"), icon: UserIcon },
  ];
  const section = [...groups.flatMap(g => g.items), ...extras]
    .filter(item => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/issues?q=${encodeURIComponent(q)}` : "/issues");
  };

  const bottomNav = [
    { to: "/dashboard", label: t("dashboard.title"), icon: LayoutDashboard },
    { to: "/issues", label: t("issues.title"), icon: ListTodo },
    { to: "/milestones", label: t("milestone.title"), icon: Flag },
    { to: "/wiki", label: t("wiki.title", "知识库"), icon: BookOpen },
    { to: "/profile", label: t("nav.profile", "我的"), icon: UserIcon },
  ];

  return (
    <div className="ws-shell">
      <RouteProgress />
      <aside className={`hidden lg:flex ws-sidebar${rail ? " is-rail" : ""}`}>
        <SidebarBody rail={rail} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="ws-topbar">
          <button onClick={() => setMobileOpen(true)} className="ws-icon-btn grid lg:hidden" aria-label={t("nav.menu", "菜单")}>
            <Menu size={18} />
          </button>

          <Link to="/dashboard" className="flex items-center gap-2 lg:hidden">
            <span className="ws-brand-mark">F</span>
          </Link>

          <div className="hidden min-w-0 items-center gap-1.5 text-[12px] text-[var(--text-faint)] md:flex">
            <span>{t("nav.workspace", "工作空间")}</span>
            <span className="opacity-60">/</span>
            <span className="truncate font-medium text-[var(--text-secondary)]">{section?.label || t("nav.workspace")}</span>
          </div>

          <form onSubmit={submitSearch} className="ws-search ml-auto flex max-md:hidden" role="search">
            <Search size={14} className="shrink-0" />
            <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)}
              placeholder={t("nav.search_placeholder", "搜索问题、知识库…")} aria-label={t("common.search")} />
            <span className="ws-kbd hidden lg:inline">⌘K</span>
          </form>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <Link to="/issues" className="ws-icon-btn grid md:hidden" title={t("common.search")}>
              <Search size={17} strokeWidth={1.8} />
            </Link>
            <CreateMenu />
            <NavLink to="/settings/notifications" className="ws-icon-btn grid max-sm:hidden" title={t("nav.notifications")}>
              <Bell size={17} strokeWidth={1.8} />
            </NavLink>
            <button onClick={() => setRail(v => !v)} title={rail ? t("nav.expand") : t("nav.collapse")}
              className="ws-icon-btn grid max-lg:hidden">
              {rail ? <PanelLeftOpen size={17} strokeWidth={1.8} /> : <PanelLeftClose size={17} strokeWidth={1.8} />}
            </button>
            <UserMenu />
          </div>
        </header>

        <main className="ws-main pb-16 lg:pb-0">
          <div className="page-wrap">
            <Suspense fallback={<PageFallback />}>{children ?? <Outlet />}</Suspense>
          </div>
        </main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[258px] flex-col bg-white shadow-[var(--shadow-lg)] animate-[slideInRight_.18s_ease-out]">
            <div className="flex h-12 items-center justify-end px-3">
              <button onClick={() => setMobileOpen(false)} className="ws-icon-btn grid"><X size={16} /></button>
            </div>
            <SidebarBody close={() => setMobileOpen(false)} rail={false} />
          </aside>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--border)] bg-white/95 backdrop-blur lg:hidden">
        {bottomNav.map(item => (
          <NavLink key={item.to} to={item.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors ${
                isActive ? "text-[var(--primary)]" : "text-[#9ca3af]"
              }`}>
            <item.icon size={18} strokeWidth={1.8} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
