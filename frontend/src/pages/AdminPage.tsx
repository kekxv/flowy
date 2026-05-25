import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, Layers, AlertCircle, CheckCircle2, Link2, Shield, ShieldOff, UserCog, Crown, Globe, Code2, Settings2, Lock, Briefcase, X } from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";

interface UserItem { id: string; username: string; email: string; display_name: string; role: string; is_active: boolean; created_at: string; }
interface Stats { users: number; issues: number; open_issues: number; closed_issues: number; connections: number; }

export default function AdminPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s=>s.user);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [stats, setStats] = useState<Stats|null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthConfig, setOauthConfig] = useState<Record<string,string>>({});

  const fetch = async () => {
    const [u, s, oc] = await Promise.all([
      api.get("/users"), api.get("/admin/stats"),
      api.get("/system/settings").catch(()=>({data:{}})),
    ]);
    setUsers(u.data); setStats(s.data); setOauthConfig(oc.data); setLoading(false);
  };
  useEffect(()=>{fetch();},[]);

  const saveOAuthConfig = async (e:React.FormEvent) => { e.preventDefault();
    await api.put("/system/settings", oauthConfig); };

  const [roleEditUser, setRoleEditUser] = useState<string|null>(null);
  const [roleEditRoles, setRoleEditRoles] = useState<string[]>([]);
  const ALL_ROLES = ["project_lead","backend_dev","frontend_dev","tester","ui_designer","devops","clerk","member"];

  const toggleRole = async (u:UserItem) => { await api.put(`/users/${u.id}`,{role:u.role==="admin"?"member":"admin"}); fetch(); };
  const toggleActive = async (u:UserItem) => { await api.put(`/users/${u.id}`,{is_active:!u.is_active}); fetch(); };
  const openRoleEdit = async (uid: string) => {
    try { const r = await api.get(`/users/${uid}/project-roles`); setRoleEditRoles(r.data); } catch { setRoleEditRoles([]); }
    setRoleEditUser(uid);
  };
  const toggleEditRole = (r: string) => setRoleEditRoles(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const saveRoles = async () => {
    if (!roleEditUser) return;
    await api.put(`/users/${roleEditUser}/project-roles`, { roles: roleEditRoles });
    setRoleEditUser(null);
  };

  if (loading) return <div className="flex justify-center pt-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--primary)] border-t-transparent"/></div>;
  if (user?.role !== "admin") return (
    <div className="flex flex-col items-center justify-center pt-24 text-[var(--text-muted)]">
      <Lock size={40} className="mb-3 opacity-30"/>
      <p className="text-sm font-medium">Access denied</p>
      <p className="text-xs mt-1">Admin only</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.title")}</h1>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{t("admin.system_stats")}</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            {k:"users",v:stats.users,icon:Users,color:"text-indigo-600 bg-indigo-50",label:t("admin.users")},
            {k:"issues",v:stats.issues,icon:Layers,color:"text-[var(--primary)] bg-[var(--primary-light)]",label:t("dashboard.total_issues")},
            {k:"open_issues",v:stats.open_issues,icon:AlertCircle,color:"text-amber-600 bg-amber-50",label:t("dashboard.open_issues")},
            {k:"closed_issues",v:stats.closed_issues,icon:CheckCircle2,color:"text-emerald-600 bg-emerald-50",label:t("dashboard.closed_issues")},
            {k:"connections",v:stats.connections,icon:Link2,color:"text-purple-600 bg-purple-50",label:t("admin.connections","Connections")},
          ].map(s=>(
            <div key={s.k} className="card rounded-xl p-4 flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.color}`}><s.icon size={17}/></div>
              <div>
                <div className="text-lg font-bold">{s.v}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* OAuth Configuration */}
      <div className="card rounded-xl overflow-hidden">
        <div className="border-b border-[var(--border-light)] px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <Settings2 size={14}/>OAuth {t("settings.config","Configuration")}
          </h2>
        </div>
        <form onSubmit={saveOAuthConfig} className="px-5 py-4 space-y-4">
          {/* Frontend URL */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("admin.frontend_url","Frontend URL")}</label>
            <input value={oauthConfig["frontend_url"]||""} onChange={e=>setOauthConfig({...oauthConfig,frontend_url:e.target.value})}
              className="input text-xs" placeholder="http://localhost:5173"/>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">{t("admin.frontend_url_hint","Used for notification links. Default: http://localhost:5173")}</p>
          </div>

          {/* Callback hint */}
          <div className="rounded-lg bg-[var(--primary-light)] px-3 py-2.5 text-[11px] text-[var(--primary)]">
            <strong>{t("admin.oauth_callback","Callback / Redirect URI")}:</strong>
            <code className="ml-2 rounded bg-white/60 px-1.5 py-0.5 font-mono text-[10px] select-all">{(oauthConfig["frontend_url"] || window.location.origin) + "/api/v1/external/connections/oauth/callback"}</code>
          </div>

          {/* GitHub */}
          <div>
            <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              <Code2 size={13}/>GitHub</h3>
            <p className="text-[10px] text-[var(--text-muted)] mb-2">
              {t("admin.oauth_github_guide","Register OAuth App at GitHub → Settings → Developer settings → OAuth Apps. Use the callback URL above.")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div><label className="text-[10px] text-[var(--text-muted)]">Client ID</label>
                <input value={oauthConfig["github_client_id"]||""} onChange={e=>setOauthConfig({...oauthConfig,github_client_id:e.target.value})}
                  className="input text-xs mt-0.5" placeholder="Iv1.xxx"/></div>
              <div><label className="text-[10px] text-[var(--text-muted)]">Client Secret</label>
                <input type="password" value={oauthConfig["github_client_secret"]||""} onChange={e=>setOauthConfig({...oauthConfig,github_client_secret:e.target.value})}
                  className="input text-xs mt-0.5" placeholder="···"/></div>
            </div>
          </div>

          {/* Gitea */}
          <div>
            <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              <Globe size={13}/>Gitea</h3>
            <p className="text-[10px] text-[var(--text-muted)] mb-2">
              {t("admin.oauth_gitea_guide","Create OAuth2 application at Gitea → Settings → Applications. Use the callback URL above.")}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div><label className="text-[10px] text-[var(--text-muted)]">{t("settings.instance_url","Instance URL")}</label>
                <input value={oauthConfig["gitea_instance_url"]||""} onChange={e=>setOauthConfig({...oauthConfig,gitea_instance_url:e.target.value})}
                  className="input text-xs mt-0.5" placeholder="https://gitea.example.com"/></div>
              <div><label className="text-[10px] text-[var(--text-muted)]">Client ID</label>
                <input value={oauthConfig["gitea_client_id"]||""} onChange={e=>setOauthConfig({...oauthConfig,gitea_client_id:e.target.value})}
                  className="input text-xs mt-0.5" placeholder="···"/></div>
              <div><label className="text-[10px] text-[var(--text-muted)]">Client Secret</label>
                <input type="password" value={oauthConfig["gitea_client_secret"]||""} onChange={e=>setOauthConfig({...oauthConfig,gitea_client_secret:e.target.value})}
                  className="input text-xs mt-0.5" placeholder="···"/></div>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-sm">{t("common.save")}</button>
        </form>
      </div>

      {/* Users table */}
      <div className="card rounded-xl overflow-hidden">
        <div className="border-b border-[var(--border-light)] px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <UserCog size={14}/>{t("admin.users")}
            <span className="rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-bold">{users.length}</span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-light)] text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-5 py-2.5 font-medium">{t("auth.username")}</th>
                <th className="px-5 py-2.5 font-medium hidden sm:table-cell">{t("auth.email")}</th>
                <th className="px-5 py-2.5 font-medium">{t("roles.role")}</th>
                <th className="px-5 py-2.5 font-medium">{t("common.status")}</th>
                <th className="px-5 py-2.5 font-medium w-1">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-light)]">
              {users.map(u=>(
                <tr key={u.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[10px] font-semibold text-[var(--primary)]">
                        {(u.display_name||u.username).slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium">{u.display_name||u.username}</div>
                        <div className="text-[11px] text-[var(--text-muted)] sm:hidden">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-[var(--text-muted)] hidden sm:table-cell">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${u.role==="admin"?"bg-violet-50 text-violet-700":"bg-[var(--bg-muted)] text-[var(--text-secondary)]"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${u.is_active?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-600"}`}>
                      {u.is_active?t("admin.active","Active"):t("admin.inactive","Inactive")}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={()=>openRoleEdit(u.id)} title={t("roles.title","Project Roles")}
                        className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--primary)] transition-colors">
                        <Briefcase size={14}/></button>
                      <button onClick={()=>toggleRole(u)} title={t("admin.toggle_role")} disabled={u.id === user?.id}
                        className={`rounded-lg p-1.5 transition-colors ${
                          u.id === user?.id ? "opacity-20 cursor-not-allowed" :
                          u.role==="admin"?"text-violet-500 hover:bg-violet-50":"text-[var(--text-muted)] hover:bg-violet-50 hover:text-violet-600"
                        }`}>
                        <Crown size={14}/></button>
                      <button onClick={()=>toggleActive(u)} title={u.is_active?t("admin.deactivate"):t("admin.activate")} disabled={u.id === user?.id}
                        className={`rounded-lg p-1.5 transition-colors ${
                          u.id === user?.id ? "opacity-20 cursor-not-allowed" :
                          u.is_active?"text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500":"text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600"
                        }`}>
                        {u.is_active?<ShieldOff size={14}/>:<Shield size={14}/>}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Project role edit — bottom sheet */}
      {roleEditUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setRoleEditUser(null)}>
          <div className="card w-80 rounded-xl overflow-hidden shadow-[var(--shadow-lg)] animate-[fadeInUp_.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-light)]">
              <h3 className="text-sm font-semibold">{t("roles.title","Project Roles")}</h3>
              <button onClick={() => setRoleEditUser(null)} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={16}/></button>
            </div>
            <div className="px-5 py-3 space-y-1 max-h-64 overflow-y-auto">
              {ALL_ROLES.map(r => (
                <label key={r}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                    roleEditRoles.includes(r) ? "bg-[var(--primary-light)]" : "hover:bg-[var(--bg-hover)]"
                  }`}>
                  <input type="checkbox" checked={roleEditRoles.includes(r)} onChange={() => toggleEditRole(r)} className="rounded accent-[var(--primary)]"/>
                  <span className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>
                </label>
              ))}
            </div>
            <div className="border-t border-[var(--border-light)] px-5 py-3">
              <button onClick={saveRoles} className="btn btn-primary btn-sm w-full">{t("common.save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
