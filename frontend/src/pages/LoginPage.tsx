import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, ArrowRight, Sparkles } from "lucide-react";
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
    getAuthStatus().then(s => setRegistrationOpen(!s.has_users)).catch(() => setRegistrationOpen(false));
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f0f2f8]">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-1/3 -right-1/4 h-[700px] w-[700px] rounded-full opacity-40 blur-[120px]"
          style={{
            background: "linear-gradient(135deg, #4f6ef7, #8b5cf6, #ec4899)",
            animation: "gradientShift 12s ease-in-out infinite",
            backgroundSize: "200% 200%",
          }}
        />
        <div
          className="absolute -bottom-1/3 -left-1/4 h-[600px] w-[600px] rounded-full opacity-30 blur-[100px]"
          style={{
            background: "linear-gradient(135deg, #06b6d4, #4f6ef7, #8b5cf6)",
            animation: "gradientShift 15s ease-in-out infinite reverse",
            backgroundSize: "200% 200%",
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full opacity-15 blur-[80px]"
          style={{
            background: "linear-gradient(135deg, #f59e0b, #ef4444)",
            animation: "gradientShift 10s ease-in-out infinite",
            backgroundSize: "200% 200%",
          }}
        />
        {/* Dot grid overlay */}
        <div
          className="absolute inset-0 opacity-[.3]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(79,110,247,.15) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {/* Language toggle */}
      <button
        onClick={() => i18n.changeLanguage(i18n.language === "zh" ? "en" : "zh")}
        className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-xl border border-white/60 bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] backdrop-blur-sm hover:bg-white/90 transition-all shadow-sm"
      >
        <Globe size={14} />
        {i18n.language === "zh" ? "EN" : "中文"}
      </button>

      {/* Login card */}
      <div
        className="relative w-full max-w-[380px] mx-4 rounded-2xl bg-white/80 backdrop-blur-xl p-8 shadow-[0_20px_60px_rgba(0,0,0,.08),0_1px_3px_rgba(0,0,0,.04)] border border-white/80 animate-[scaleIn_.4s_cubic-bezier(.16,1,.3,1)]"
      >
        {/* Logo */}
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f6ef7] to-[#8b5cf6] text-xl font-bold text-white shadow-[0_6px_20px_rgba(79,110,247,.35)]"
            style={{ animation: "float 4s ease-in-out infinite" }}
          >
            F
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">
            {mode === "login" ? t("auth.sign_in_title") : t("auth.sign_up_title")}
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">
            {mode === "login" ? t("auth.welcome_back", "Welcome back to Flowy") : t("auth.create_subtitle", "Create your account to get started")}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-2.5 text-[13px] text-red-600 animate-[fadeInUp_.2s_ease-out]">
            <span className="text-red-400 text-base">!</span>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handle} className="space-y-4">
          <div>
            <label className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              {t("auth.username_or_email")}
            </label>
            <input
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="input mt-1.5 h-10"
              placeholder="admin"
              autoComplete="username"
            />
          </div>

          {mode === "register" && registrationOpen && (
            <>
              <div>
                <label className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  {t("auth.email")}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input mt-1.5 h-10"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  {t("auth.display_name")}
                </label>
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="input mt-1.5 h-10"
                  placeholder={t("auth.display_name")}
                />
              </div>
            </>
          )}

          <div>
            <label className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              {t("auth.password")}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={6}
              className="input mt-1.5 h-10"
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary w-full justify-center h-10.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {t("common.loading")}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                {mode === "login" ? t("auth.sign_in") : t("auth.create_account")}
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-5 pt-5 border-t border-[var(--border-light)] text-center">
          {mode === "login" ? (
            registrationOpen ? (
              <p className="text-[13px] text-[var(--text-muted)]">
                {t("auth.no_account")}{" "}
                <button
                  onClick={() => { clearError(); setMode("register"); }}
                  className="font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
                >
                  {t("auth.sign_up")}
                </button>
              </p>
            ) : (
              <p className="text-[13px] text-[var(--text-muted)]">
                {t("auth.no_account")}{" "}
                <span className="flex items-center justify-center gap-1 mt-1 text-[12px] text-[var(--text-muted)]">
                  <Sparkles size={12} className="text-amber-400" />
                  请联系管理员创建账号
                </span>
              </p>
            )
          ) : (
            <p className="text-[13px] text-[var(--text-muted)]">
              {t("auth.has_account")}{" "}
              <button
                onClick={() => { clearError(); setMode("login"); }}
                className="font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
              >
                {t("auth.sign_in")}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
