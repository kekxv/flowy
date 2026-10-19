import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, ArrowRight, LayoutDashboard, Timer, Milestone, Check } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { getAuthStatus } from "../api/auth";

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<"login"|"register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const { login, register, error, isLoading, clearError, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    getAuthStatus().then(s => setRegistrationOpen(!s.has_users || s.registration_enabled)).catch(() => setRegistrationOpen(false));
  }, []);

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "login") await login(username, password);
      else await register(username, email, password, displayName || undefined);
      navigate("/dashboard", { replace: true });
    } catch {}
  };

  const features = [
    { icon: LayoutDashboard, title: t("auth.hero_dashboard", "工作台一眼看清待办"), desc: t("auth.hero_dashboard_desc", "逾期、进行中、待认领分组呈现") },
    { icon: Timer, title: t("auth.hero_timer", "问题与工时联动"), desc: t("auth.hero_timer_desc", "评论、附件、计时都在同一处") },
    { icon: Milestone, title: t("auth.hero_milestone", "里程碑与知识库"), desc: t("auth.hero_milestone_desc", "版本、里程碑、Wiki 统一归档") },
  ];

  return (
    <div className="login-page">
      <div className="login-blob login-blob-a" />
      <div className="login-blob login-blob-b" />

      <div className="login-shell">
        <aside className="login-aside">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-white/15 text-[15px] font-bold text-white ring-1 ring-white/25">F</span>
            <span className="text-[16px] font-semibold tracking-tight text-white">Flowy</span>
          </div>

          <div className="mt-auto">
            <h2 className="text-[23px] font-semibold leading-snug tracking-[-.02em] text-white">
              {t("auth.hero_title", "把问题与需求，安排得明明白白")}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/70">
              {t("auth.hero_sub", "面向研发团队的轻量协作空间：登记、认领、流转、复盘。")}
            </p>

            <ul className="mt-7 space-y-3.5">
              {features.map(f => (
                <li key={f.title} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-white/12 text-white/90 ring-1 ring-white/15">
                    <f.icon size={14} strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-white">{f.title}</span>
                    <span className="block text-[11.5px] text-white/55">{f.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-auto flex items-center gap-1.5 text-[11px] text-white/45">
            <Check size={11} />{t("auth.hero_footer", "自托管 · 数据留在自己的服务器")}
          </div>
        </aside>

        <main className="login-panel">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 lg:hidden">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--primary)] text-[13px] font-bold text-white">F</span>
              <span className="text-[15px] font-semibold tracking-tight">Flowy</span>
            </div>
            <button
              onClick={() => i18n.changeLanguage(i18n.language === "zh" ? "en" : "zh")}
              className="ml-auto flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-muted)]"
            >
              <Globe size={13} />
              {i18n.language === "zh" ? "EN" : "中文"}
            </button>
          </div>

          <div className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-[-.02em] text-[var(--text)]">
              {mode === "login" ? t("auth.sign_in_title") : t("auth.sign_up_title")}
            </h1>
            <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
              {mode === "login" ? t("auth.sign_in_sub", "欢迎回来，继续处理你的问题") : t("auth.sign_up_sub", "创建一个账号开始协作")}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-[8px] border border-red-100 bg-red-50 px-3 py-2 text-[12.5px] text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handle} className="space-y-3.5">
            <label className="field">
              <span className="field-label">{t("auth.username_or_email")}</span>
              <input
                required value={username} onChange={e => setUsername(e.target.value)}
                className="input h-9" placeholder="admin" autoComplete="username"
              />
            </label>

            {mode === "register" && registrationOpen && (
              <>
                <label className="field">
                  <span className="field-label">{t("auth.email")}</span>
                  <input
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    className="input h-9" placeholder="you@example.com" autoComplete="email"
                  />
                </label>
                <label className="field">
                  <span className="field-label">{t("auth.display_name")}</span>
                  <input
                    value={displayName} onChange={e => setDisplayName(e.target.value)}
                    className="input h-9" placeholder={t("auth.display_name")}
                  />
                </label>
              </>
            )}

            <label className="field">
              <span className="field-label">{t("auth.password")}</span>
              <input
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                minLength={6} className="input h-9" placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>

            <button
              type="submit" disabled={isLoading}
              className="btn btn-primary group h-9 w-full justify-center disabled:opacity-50"
            >
              {isLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  {mode === "login" ? t("auth.sign_in") : t("auth.create_account")}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 border-t border-[var(--border-light)] pt-4 text-center text-[12.5px] text-[var(--text-muted)]">
            {mode === "login" ? (
              registrationOpen ? (
                <>
                  {t("auth.no_account")}{" "}
                  <button onClick={() => { clearError(); setMode("register"); }} className="font-medium text-[var(--primary)] hover:underline">
                    {t("auth.sign_up")}
                  </button>
                </>
              ) : (
                <span>{t("auth.no_account")} {t("auth.contact_admin", "请联系管理员创建账号")}</span>
              )
            ) : (
              <>
                {t("auth.has_account")}{" "}
                <button onClick={() => { clearError(); setMode("login"); }} className="font-medium text-[var(--primary)] hover:underline">
                  {t("auth.sign_in")}
                </button>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
