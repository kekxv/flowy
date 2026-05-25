import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { useAuthStore } from "../store/authStore";

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<"login"|"register">("login");
  const [username, setUsername] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState("");
  const { login, register, error, isLoading, clearError, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  useEffect(()=>{if(isAuthenticated)navigate("/dashboard",{replace:true});},[isAuthenticated,navigate]);

  const handle = async (e:React.FormEvent)=>{e.preventDefault();
    try{if(mode==="login")await login(username,password);else await register(username,email,password,displayName||undefined);navigate("/dashboard",{replace:true});}catch{}};

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-[var(--primary)]/5 blur-3xl"/>
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-violet-500/5 blur-3xl"/>
      </div>
      <button onClick={()=>i18n.changeLanguage(i18n.language==="zh"?"en":"zh")}
        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-all"><Globe size={14}/>{i18n.language==="zh"?"EN":"中文"}</button>

      <div className="glass relative w-full max-w-sm rounded-[var(--radius-lg)] p-8 shadow-[var(--shadow-lg)]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)] text-lg font-bold text-white shadow-[0_4px_16px_rgba(79,110,247,.35)]">F</div>
          <h1 className="text-xl font-bold tracking-tight">{mode==="login"?t("auth.sign_in_title"):t("auth.sign_up_title")}</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">{mode==="login"?"Welcome back":"Create your account"}</p>
        </div>

        {error && <div className="mb-4 rounded-[var(--radius-sm)] bg-red-50 px-4 py-2.5 text-[13px] text-red-600">{error}</div>}

        <form onSubmit={handle} className="space-y-3.5">
          <div><label className="text-[13px] font-medium text-[var(--text-secondary)]">{t("auth.username_or_email")}</label>
            <input required value={username} onChange={e=>setUsername(e.target.value)} className="input mt-1" placeholder="admin"/></div>
          {mode==="register"&&<>
            <div><label className="text-[13px] font-medium text-[var(--text-secondary)]">{t("auth.email")}</label>
              <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="input mt-1" placeholder="you@example.com"/></div>
            <div><label className="text-[13px] font-medium text-[var(--text-secondary)]">{t("auth.display_name")}</label>
              <input value={displayName} onChange={e=>setDisplayName(e.target.value)} className="input mt-1" placeholder={t("auth.display_name")}/></div>
          </>}
          <div><label className="text-[13px] font-medium text-[var(--text-secondary)]">{t("auth.password")}</label>
            <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} minLength={6} className="input mt-1" placeholder="••••••"/></div>
          <button type="submit" disabled={isLoading} className="btn btn-primary w-full justify-center py-2.5">
            {isLoading?t("common.loading"):mode==="login"?t("auth.sign_in"):t("auth.create_account")}</button>
        </form>
        <p className="mt-4 text-center text-[13px] text-[var(--text-muted)]">
          {mode==="login"?<>{t("auth.no_account")} <button onClick={()=>{clearError();setMode("register");}} className="font-medium text-[var(--primary)] hover:underline">{t("auth.sign_up")}</button></>
          :<>{t("auth.has_account")} <button onClick={()=>{clearError();setMode("login");}} className="font-medium text-[var(--primary)] hover:underline">{t("auth.sign_in")}</button></>}
        </p>
      </div>
    </div>
  );
}
