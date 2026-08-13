import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, ListTodo, Flag, Tags, Shield, Settings, Bell, Globe, LogOut, Menu, X, Bot, BookOpen } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import ThemePanel from "../theme/ThemePanel";

function useNavItems() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const items = [
    { to: "/dashboard", label: t("dashboard.title"), icon: LayoutDashboard },
    { to: "/issues", label: t("issues.title"), icon: ListTodo },
    { to: "/milestones", label: t("milestone.title"), icon: Flag },
    { to: "/wiki", label: t("wiki.title", "Knowledge Base"), icon: BookOpen },
  ];
  if (user?.role === "admin") {
    items.push({ to: "/labels", label: t("common.labels"), icon: Tags });
    items.push({ to: "/admin", label: t("admin.title"), icon: Shield });
  }
  return items;
}

const linkCls = (isActive: boolean) =>
  `relative flex items-center gap-2.5 rounded-[6px] px-2.5 py-[6px] text-[13px] font-medium transition-colors ${
    isActive
      ? "bg-[#f3f4f6] text-[#374151]"
      : "text-[#6b7280] hover:bg-[#f9fafb] hover:text-[#374151]"
  }`;

function Sidebar({ close }: { close?: () => void }) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const navItems = useNavItems();

  return (
    <div className="flex h-full flex-col bg-[var(--bg-sidebar)]">
      {/* Logo */}
      <NavLink to="/dashboard" onClick={close}
        className="flex h-[48px] items-center gap-2 border-b border-[var(--border)] px-3 transition-colors hover:bg-[#f9fafb]">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] bg-[var(--primary)] text-[12px] font-bold text-white">F</div>
        <span className="text-[13px] font-semibold tracking-tight text-[var(--text)]">Flowy</span>
      </NavLink>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2.5">
        <div className="space-y-[2px]">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={close}
              className={({ isActive }) => linkCls(isActive)}>
              {({ isActive }) => (<>
                {isActive && <span className="absolute left-[-8px] top-1/2 -translate-y-1/2 h-[14px] w-[3px] rounded-r-full bg-[var(--primary)]" />}
                <item.icon size={16} strokeWidth={1.8} />
                <span className="truncate">{item.label}</span>
              </>)}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-[var(--border)] px-2 py-2 space-y-[2px]">
        <ThemePanel />
        <NavLink to="/profile" onClick={close}
          className={({ isActive }) => linkCls(isActive)}>
          <Settings size={16} strokeWidth={1.8} />{t("settings.profile","Profile")}
        </NavLink>
        <NavLink to="/settings/notifications" onClick={close}
          className={({ isActive }) => linkCls(isActive)}>
          <Bell size={16} strokeWidth={1.8} />{t("settings.notifications")}
        </NavLink>
        {user?.role === "admin" && (
          <NavLink to="/settings/wechat-work-bot" onClick={close}
            className={({ isActive }) => linkCls(isActive)}>
            <Bot size={16} strokeWidth={1.8} />{t("wechat_work_bot.title", "企业微信机器人")}
          </NavLink>
        )}
        <button onClick={() => i18n.changeLanguage(i18n.language === "zh" ? "en" : "zh")}
          className={`flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-[6px] text-[13px] font-medium text-[#6b7280] hover:bg-[#f9fafb] hover:text-[#374151] transition-colors`}>
          <Globe size={16} strokeWidth={1.8} />{i18n.language === "zh" ? "English" : "中文"}
        </button>
      </div>

      {/* User */}
      {user && (
        <div className="border-t border-[var(--border)] px-2 py-2">
          <NavLink to="/profile" onClick={close}
            className="flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[#f9fafb] group">
            <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#f3f4f6] text-[11px] font-semibold text-[#6b7280] ring-1 ring-[var(--border)]">
              {(user.display_name || user.username).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-[var(--text)]">{user.display_name || user.username}</div>
            </div>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); logout(); }}
              className="rounded p-1 text-[#9ca3af] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100" title={t("common.sign_out")}>
              <LogOut size={14} />
            </button>
          </NavLink>
        </div>
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navItems = useNavItems();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[var(--bg)]">
      {/* Desktop sidebar */}
      <aside className="hidden w-[220px] flex-col border-r border-[var(--border)] lg:flex">
        <Sidebar />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-[48px] items-center gap-2.5 border-b border-[var(--border)] bg-white px-3 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-[#6b7280] hover:bg-[#f3f4f6] transition-colors">
          <Menu size={18} />
        </button>
        <NavLink to="/dashboard" className="flex items-center gap-2">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] bg-[var(--primary)] text-[12px] font-bold text-white">F</div>
          <span className="text-[13px] font-semibold tracking-tight">Flowy</span>
        </NavLink>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/20" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[250px] bg-white animate-[slideInRight_.18s_ease-out]">
            <div className="flex h-[48px] items-center justify-between border-b border-[var(--border)] px-3">
              <span className="text-[13px] font-semibold">Flowy</span>
              <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-[#6b7280] hover:bg-[#f3f4f6]"><X size={16} /></button>
            </div>
            <Sidebar close={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-[var(--border)] bg-white py-1 lg:hidden">
        {navItems.slice(0, 4).map((item) => (
          <NavLink key={item.to} to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium transition-colors ${
                isActive ? "text-[var(--primary)]" : "text-[#9ca3af]"
              }`}>
            <item.icon size={18} strokeWidth={1.8} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 overflow-auto px-4 pb-20 pt-14 sm:px-6 sm:pb-6 sm:pt-5 lg:px-8 lg:pb-8 lg:pt-6">{children}</main>
    </div>
  );
}
