import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Code2, Key, Trash2, CheckCircle2, XCircle, ExternalLink, RefreshCw, X } from "lucide-react";
import { listConnections, connectViaPat, deleteConnection, testConnection, type ConnectionData } from "../api/connections";
import { useAuthStore } from "../store/authStore";
import api from "../api/client";
import { ALL_ROLES } from "../constants";
import Loader from "../components/Loader";

export default function UserProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore(s=>s.user);
  const [conns, setConns] = useState<ConnectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [oauthConfig, setOauthConfig] = useState<Record<string,string>>({});
  const [showPatForm, setShowPatForm] = useState(false);
  const [patProvider, setPatProvider] = useState("github");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sub, setSub] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const oauthHandled = useRef(false);
  const [editForm, setEditForm] = useState({display_name: user?.display_name||"", nickname: user?.nickname||""});
  const [showEdit, setShowEdit] = useState(false);
  const [pwdForm, setPwdForm] = useState({old_password:"", new_password:""});
  const [showPwd, setShowPwd] = useState(false);

  const fetch = async () => {
    const [c, oc] = await Promise.all([
      listConnections(),
      api.get("/system/settings").catch(()=>({data:{}})),
    ]);
    setConns(c); setOauthConfig(oc.data); setLoading(false);
  };
  useEffect(()=>{fetch();},[]);

  // Check which providers have OAuth configured
  const hasOAuth = (p:string) => !!(oauthConfig[`${p}_client_id`]);

  const connectOAuth = async (p: string) => {
    setError(""); setOauthConnecting(true);
    try {
      const res = await api.post("/external/connections/oauth/init", {
        provider: p, instance_url: oauthConfig[`${p}_instance_url`] || undefined,
      });
      sessionStorage.setItem("oauth_state", res.data.state);
      setTimeout(() => { window.location.href = res.data.auth_url; }, 200);
    } catch(err:any) { setError(err?.response?.data?.detail||err?.message||"OAuth failed"); setOauthConnecting(false); }
  };

  // Handle OAuth callback redirect from backend
  useEffect(() => {
    if (oauthHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "ok") {
      oauthHandled.current = true;
      sessionStorage.removeItem("oauth_state");
      window.history.replaceState({}, "", "./#/profile");
      setSuccess(t("settings.connect_ok","Account connected successfully!"));
      fetch();
    } else if (params.get("oauth") === "error") {
      oauthHandled.current = true;
      setError(params.get("msg") || "OAuth failed");
      window.history.replaceState({}, "", "./#/profile");
    }
  }, []);

  const connectPAT = async (e:React.FormEvent) => { e.preventDefault(); setError(""); setSub(true);
    try { await connectViaPat({provider:patProvider,token,instance_url:instanceUrl||undefined}); setToken(""); setInstanceUrl(""); setShowPatForm(false); fetch(); }
    catch(err:any){ setError(err?.message||"Connection failed"); } finally { setSub(false); } };
  const remove = async (id:string) => { if(!confirm(t("common.confirm")+"?"))return; await deleteConnection(id); fetch(); };
  const test = async (id:string) => { const ok=await testConnection(id); alert(ok?t("settings.test_ok","OK"):t("settings.test_fail","Failed")); };

  if (loading) return <Loader />;

  const showProviderConnect = (p:string) => conns.every(c=>c.provider!==p);

  return (
    <div className="mx-auto max-w-2xl space-y-5 page-enter">
      {/* User info */}
      <div className="card rounded-xl p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)]/10 text-xl font-bold text-[var(--primary)]">
            {(user?.display_name||user?.username||"?").slice(0,2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-lg font-bold">{user?.display_name||user?.username}</h1>
            <p className="text-[13px] text-[var(--text-muted)]">@{user?.username} · {user?.email} · <span className="rounded bg-[var(--bg-muted)] px-1 py-0.5 text-[11px]">{user?.role}</span></p>
          </div>
        </div>
      </div>

      {/* Profile Edit */}
      <div className="card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-light)] px-5 py-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">个人信息</h2>
          <button onClick={()=>setShowEdit(!showEdit)} className="btn btn-outline btn-sm">{showEdit?"取消":"编辑"}</button>
        </div>
        {showEdit && (
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="text-[11px] font-medium text-[var(--text-secondary)]">显示名称</label>
              <input type="text" value={editForm.display_name} onChange={e=>setEditForm({...editForm, display_name: e.target.value})} className="input mt-1 text-[13px]" placeholder="可选" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-[var(--text-secondary)]">昵称</label>
              <input type="text" value={editForm.nickname} onChange={e=>setEditForm({...editForm, nickname: e.target.value})} className="input mt-1 text-[13px]" placeholder="用于 @查询" />
            </div>
            <button onClick={async()=>{try{await api.put("/auth/me", editForm); setSuccess("已保存"); fetch();}catch(e:any){setError(e?.response?.data?.detail||e?.message);}}} className="btn btn-primary btn-sm">保存</button>
          </div>
        )}
      </div>

      {/* Password Change */}
      <div className="card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-light)] px-5 py-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">修改密码</h2>
          <button onClick={()=>setShowPwd(!showPwd)} className="btn btn-outline btn-sm">{showPwd?"取消":"修改"}</button>
        </div>
        {showPwd && (
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="text-[11px] font-medium text-[var(--text-secondary)]">当前密码</label>
              <input type="password" value={pwdForm.old_password} onChange={e=>setPwdForm({...pwdForm, old_password: e.target.value})} className="input mt-1 text-[13px]" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-[var(--text-secondary)]">新密码</label>
              <input type="password" value={pwdForm.new_password} onChange={e=>setPwdForm({...pwdForm, new_password: e.target.value})} className="input mt-1 text-[13px]" />
            </div>
            <button onClick={async()=>{try{await api.put("/auth/me/password", pwdForm); setSuccess("密码已修改"); setPwdForm({old_password:"", new_password:""}); setShowPwd(false);}catch(e:any){setError(e?.response?.data?.detail||e?.message);}}} className="btn btn-primary btn-sm">确认修改</button>
          </div>
        )}
      </div>

      {/* Project Roles */}
      <ProjectRolesSection t={t} />

      {/* Success / Error messages */}
      {success && <div className="card rounded-xl px-5 py-3 text-[13px] text-emerald-700 bg-emerald-50 flex items-center gap-2"><CheckCircle2 size={16}/>{success}</div>}
      {error && <div className="card rounded-xl px-5 py-3 text-[13px] text-red-700 bg-red-50">{error}</div>}

      {/* Connected accounts */}
      <div className="card rounded-xl overflow-hidden">
        <div className="border-b border-[var(--border-light)] px-5 py-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("settings.integrations")}</h2>
        </div>

        {/* Existing connections */}
        {conns.map(c=>(
          <div key={c.id} className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-light)] last:border-0 group">
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.provider==="github"?"bg-[var(--text)]":"bg-orange-100"}`}>
                {c.provider==="github"?<Code2 size={15} className="text-white"/>:<Globe size={15} className="text-orange-600"/>}</div>
              <div>
                <div className="text-[13px] font-medium">{c.provider==="github"?"GitHub":"Gitea"}
                  {c.instance_url&&<span className="ml-1.5 text-[10px] text-[var(--text-muted)] font-mono">{c.instance_url}</span>}</div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {c.remote_username}
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${c.is_active?"bg-emerald-50 text-emerald-600":"bg-red-50 text-red-500"}`}>
                    {c.is_active?<><CheckCircle2 size={8} className="inline mr-0.5"/>{t("common.active","Active")}</>:<><XCircle size={8} className="inline mr-0.5"/>{t("common.inactive","Inactive")}</>}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={()=>connectOAuth(c.provider)} className="rounded-lg px-2 py-1 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" title={t("settings.reauth","Re-authorize")}><RefreshCw size={11} className="mr-0.5 inline"/>{t("settings.reauth","Re-auth")}</button>
              <button onClick={()=>test(c.id)} className="rounded-lg px-2 py-1 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">{t("common.test")}</button>
              <button onClick={()=>remove(c.id)} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500"><Trash2 size={13}/></button>
            </div>
          </div>
        ))}

        {/* Connect options */}
        {!showPatForm && (
          <div className="px-5 py-3 space-y-1">
            {hasOAuth("github") && showProviderConnect("github") && (
              <button onClick={()=>connectOAuth("github")} disabled={oauthConnecting}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]">
                <Code2 size={16} className="text-[var(--text-muted)]"/>
                <div><div className="text-[13px] font-medium">{t("settings.connect_github","Connect GitHub")}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{t("settings.oauth_quick","Quick OAuth connect")}</div></div>
                <span className="ml-auto text-[var(--primary)] text-xs">{oauthConnecting?<span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent inline-block"/>:"+"}</span>
              </button>
            )}
            {hasOAuth("gitea") && showProviderConnect("gitea") && (
              <button onClick={()=>connectOAuth("gitea")} disabled={oauthConnecting}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]">
                <Globe size={16} className="text-[var(--text-muted)]"/>
                <div><div className="text-[13px] font-medium">{t("settings.connect_gitea","Connect Gitea")}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{t("settings.oauth_quick","Quick OAuth connect")}</div></div>
                <span className="ml-auto text-[var(--primary)] text-xs">{oauthConnecting?<span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent inline-block"/>:"+"}</span>
              </button>
            )}
            {conns.length===0 && !hasOAuth("github") && !hasOAuth("gitea") && (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--bg)] px-3 py-3 text-[12px] text-[var(--text-muted)]">
                <ExternalLink size={14}/>{t("settings.connect_hint","Connect GitHub or Gitea to link external issues.")}
              </div>
            )}
            {/* PAT fallback */}
            <button onClick={()=>{setPatProvider(hasOAuth("github")?"github":"gitea");setShowPatForm(true);}}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]">
              <Key size={14} className="text-[var(--text-muted)]"/>
              <div className="text-[12px] text-[var(--text-muted)]">{t("settings.connect_pat","Connect via Personal Access Token")}</div>
            </button>
          </div>
        )}

        {showPatForm && (
          <div className="px-5 py-4 border-t border-[var(--border-light)] animate-[fadeInUp_.15s_ease-out]">
            <div className="flex items-center gap-2 mb-3">
              <button onClick={()=>setPatProvider("github")} className={`rounded-lg px-3 py-1 text-[11px] font-medium transition-colors ${patProvider==="github"?"bg-[var(--text)] text-white":"bg-[var(--bg-muted)] text-[var(--text-secondary)]"}`}>GitHub</button>
              <button onClick={()=>setPatProvider("gitea")} className={`rounded-lg px-3 py-1 text-[11px] font-medium transition-colors ${patProvider==="gitea"?"bg-orange-500 text-white":"bg-[var(--bg-muted)] text-[var(--text-secondary)]"}`}>Gitea</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 mb-3">
              {patProvider==="gitea" && (
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("settings.instance_url","Instance URL")}</label>
                  <input value={instanceUrl} onChange={e=>setInstanceUrl(e.target.value)} placeholder="https://gitea.example.com" className="input text-xs"/>
                </div>
              )}
            </div>

            <form onSubmit={connectPAT} className="flex gap-2">
              <div className="relative flex-1">
                <Key size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
                <input type="password" required value={token} onChange={e=>setToken(e.target.value)} placeholder="PAT" className="input pl-8 text-xs"/>
              </div>
              <button type="submit" disabled={sub} className="btn btn-primary btn-sm">{t("settings.connect")}</button>
              <button type="button" onClick={()=>{setShowPatForm(false);setError("");}} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
            </form>
            {error && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-600">{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectRolesSection({ t }: { t: any }) {
  const [roles, setRoles] = useState<string[]>([]);
  const [edit, setEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/auth/me/project-roles").then(r => { setRoles(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const toggle = (r: string) => setRoles(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const save = async () => { setSaving(true); await api.put("/auth/me/project-roles", { roles }); setSaving(false); setEdit(false); };

  if (loading || roles.length === 0) return null;

  return (
    <>
      <div className="card rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("roles.title","Project Roles")}</h2>
          <button onClick={() => setEdit(true)} className="text-[11px] text-[var(--primary)] hover:underline font-medium">{t("common.edit")}</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {roles.map(r => <span key={r} className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>)}
        </div>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setEdit(false)}>
          <div className="card w-80 rounded-xl overflow-hidden shadow-[var(--shadow-lg)] animate-[fadeInUp_.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-light)]">
              <h3 className="text-sm font-semibold">{t("roles.title","Project Roles")}</h3>
              <button onClick={() => setEdit(false)} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={16}/></button>
            </div>
            <div className="px-5 py-3 space-y-1 max-h-64 overflow-y-auto">
              {ALL_ROLES.map(r => (
                <label key={r}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                    roles.includes(r) ? "bg-[var(--primary-light)]" : "hover:bg-[var(--bg-hover)]"
                  }`}>
                  <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} className="rounded accent-[var(--primary)]"/>
                  <span className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>
                </label>
              ))}
            </div>
            <div className="border-t border-[var(--border-light)] px-5 py-3">
              <button onClick={save} disabled={saving} className="btn btn-primary btn-sm w-full">{t("common.save")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
