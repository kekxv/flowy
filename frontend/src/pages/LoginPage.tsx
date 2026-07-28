import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, ArrowRight } from "lucide-react";
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      {/* Language toggle */}
      <button
        onClick={() => i18n.changeLanguage(i18n.language === "zh" ? "en" : "zh")}
        className="absolute right-5 top-5 flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors"
      >
        <Globe size={13} />
        {i18n.language === "zh" ? "EN" : "中文"}
      </button>

      <div className="w-full max-w-[340px] animate-[fadeInUp_.25s_ease-out]">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">F</div>
          <span className="text-lg font-semibold tracking-tight">Flowy</span>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-[var(--border)] bg-white p-6">
          <h1 className="mb-1 text-[17px] font-semibold">
            {mode === "login" ? t("auth.sign_in_title") : t("auth.sign_up_title")}
          </h1>
          <p className="mb-5 text-[13px] text-[var(--text-muted)]">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </p>

          {error && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-[13px] text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handle} className="space-y-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">
                {t("auth.username_or_email")}
              </label>
              <input
                required value={username} onChange={e => setUsername(e.target.value)}
                className="input" placeholder="admin" autoComplete="username"
              />
            </div>

            {mode === "register" && registrationOpen && (
              <>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">
                    {t("auth.email")}
                  </label>
                  <input
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    className="input" placeholder="you@example.com" autoComplete="email"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">
                    {t("auth.display_name")}
                  </label>
                  <input
                    value={displayName} onChange={e => setDisplayName(e.target.value)}
                    className="input" placeholder={t("auth.display_name")}
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-[12px] font-medium text-[var(--text-secondary)]">
                {t("auth.password")}
              </label>
              <input
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                minLength={6} className="input" placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>

            <button
              type="submit" disabled={isLoading}
              className="btn btn-primary w-full justify-center py-2 disabled:opacity-50 group"
            >
              {isLoading ? (
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <>
                  {mode === "login" ? t("auth.sign_in") : t("auth.create_account")}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 border-t border-[var(--border-light)] pt-4 text-center text-[13px] text-[var(--text-muted)]">
            {mode === "login" ? (
              registrationOpen ? (
                <>
                  {t("auth.no_account")}{" "}
                  <button onClick={() => { clearError(); setMode("register"); }} className="font-medium text-[var(--primary)] hover:underline">
                    {t("auth.sign_up")}
                  </button>
                </>
              ) : (
                <span>{t("auth.no_account")} 请联系管理员创建账号</span>
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
        </div>
      </div>
    </div>
  );
}
