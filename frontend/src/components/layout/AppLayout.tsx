import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, ListTodo, Flag, Tags, Shield, Settings, Bell, Globe, LogOut, Menu, X, ChevronRight } from "lucide-react";
import { useAuthStore } from "../../store/authStore";

function useNavItems() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const items = [
    { to: "/dashboard", label: t("dashboard.title"), icon: LayoutDashboard },
    { to: "/issues", label: t("issues.title"), icon: ListTodo },
    { to: "/milestones", label: t("milestone.title"), icon: Flag },
    { to: "/labels", label: t("common.labels"), icon: Tags },
  ];
  if (user?.role === "admin") {
    items.push({ to: "/admin", label: t("admin.title"), icon: Shield });
  }
  return items;
}

function Sidebar({ close }: { close?: () => void }) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuthStore();
  const navItems = useNavItems();

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-14 items-center gap-2.5 border-b border-[var(--border-light)] px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--primary)] text-sm font-bold text-white shadow-[0_2px_8px_rgba(79,110,247,.3)]">
          F
        </div>
        <span className="font-semibold tracking-tight text-[var(--text)]">Flowy</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} onClick={close}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                isActive
                  ? "bg-[var(--primary)]/8 text-[var(--primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              }`}>
            {({ isActive }: { isActive: boolean }) => (<>
              <item.icon size={17} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight size={14} className="text-[var(--primary)]/60" />}
            </>)}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[var(--border-light)] px-2 py-2 space-y-0.5">
        <NavLink to="/profile" onClick={close} className={({ isActive }) =>
          `flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
            isActive ? "bg-[var(--primary)]/8 text-[var(--primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          }`}><Settings size={17} />{t("settings.profile","Profile")}</NavLink>
        <NavLink to="/settings/notifications" onClick={close} className={({ isActive }) =>
          `flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
            isActive ? "bg-[var(--primary)]/8 text-[var(--primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
          }`}><Bell size={17} />{t("settings.notifications")}</NavLink>
        <button onClick={() => i18n.changeLanguage(i18n.language === "zh" ? "en" : "zh")}
          className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all duration-150">
          <Globe size={17} />{i18n.language === "zh" ? "English" : "中文"}
        </button>
      </div>

      {user && (
        <div className="flex items-center gap-2.5 border-t border-[var(--border-light)] p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--primary)]/10 text-xs font-semibold text-[var(--primary)]">
            {(user.display_name || user.username).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-[var(--text)]">{user.display_name || user.username}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{user.role}</div>
          </div>
          <button onClick={logout} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500 transition-all duration-150" title={t("common.sign_out")}>
            <LogOut size={14} />
          </button>
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
      <aside className="hidden w-56 flex-col border-r border-[var(--border-light)] lg:flex">
        <Sidebar />
      </aside>

      {/* Mobile top bar */}
      <div className="glass fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 px-4 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-[10px] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all">
          <Menu size={20} />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--primary)] text-sm font-bold text-white shadow-[0_2px_8px_rgba(79,110,247,.3)]">F</div>
        <span className="font-semibold tracking-tight text-[var(--text)]">Flowy</span>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 animate-[fadeInUp_.2s_ease-out]">
            <div className="flex h-14 items-center justify-between border-b border-[var(--border-light)] bg-[#fafbfc] px-4">
              <span className="font-semibold tracking-tight">Flowy</span>
              <button onClick={() => setOpen(false)} className="rounded-[10px] p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={18} /></button>
            </div>
            <Sidebar close={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 flex items-center justify-around py-1.5 lg:hidden">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-medium transition-all duration-150 ${
              isActive ? "text-[var(--primary)]" : "text-[var(--text-muted)]"
            }`}>
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 overflow-auto p-4 pb-24 pt-16 sm:p-6 sm:pb-20 sm:pt-16 lg:p-8 lg:pb-8 lg:pt-8">{children}</main>
    </div>
  );
}
