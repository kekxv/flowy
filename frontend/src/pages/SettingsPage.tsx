import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, CheckCircle2, XCircle, ExternalLink, Globe, Key, Code2, Link2 } from "lucide-react";
import { listConnections, connectViaPat, deleteConnection, testConnection, type ConnectionData } from "../api/connections";
import api from "../api/client";

export default function SettingsPage() {
  const { t } = useTranslation();
  const [conns, setConns] = useState<ConnectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState("github");
  const [token, setToken] = useState("");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [error, setError] = useState("");
  const [sub, setSub] = useState(false);
  const [authMode, setAuthMode] = useState<"oauth"|"pat">("oauth");
  const [oauthConnecting, setOauthConnecting] = useState(false);

  const fetch = async () => { setConns(await listConnections()); setLoading(false); };
  useEffect(()=>{fetch();},[]);

  const connectOAuth = async () => {
    setError(""); setOauthConnecting(true);
    try {
      const res = await api.post("/external/connections/oauth/init", {
        provider, instance_url: instanceUrl||undefined,
        redirect_uri: window.location.origin + "/settings",
      });
      sessionStorage.setItem("oauth_state", res.data.state);
      sessionStorage.setItem("oauth_provider", provider);
      sessionStorage.setItem("oauth_instance", instanceUrl);
      window.location.href = res.data.auth_url;
    } catch(err:any) { setError(err?.response?.data?.detail||err?.message||"OAuth failed"); setOauthConnecting(false); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code"), state = params.get("state");
    const savedState = sessionStorage.getItem("oauth_state");
    if (code && state && savedState === state) {
      setOauthConnecting(true);
      api.post("/external/connections/oauth/callback", { code, state })
        .then(() => { sessionStorage.removeItem("oauth_state"); window.location.search = ""; fetch(); })
        .catch(err => { setError(err?.response?.data?.detail||"OAuth failed"); setOauthConnecting(false); });
    }
  }, []);

  const connectPAT = async (e:React.FormEvent) => { e.preventDefault(); setError(""); setSub(true);
    try { await connectViaPat({provider, token, instance_url: instanceUrl||undefined}); setToken(""); setInstanceUrl(""); setShowForm(false); fetch(); }
    catch(err:any){ setError(err?.message||"Connection failed"); } finally { setSub(false); } };
  const remove = async (id:string) => { if(!confirm(t("common.confirm")+"?"))return; await deleteConnection(id); fetch(); };
  const test = async (id:string) => { const ok=await testConnection(id); alert(ok?t("settings.test_ok","OK"):t("settings.test_fail","Failed")); };

  if (loading) return <div className="flex justify-center pt-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--primary)] border-t-transparent"/></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5 page-enter">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">{t("settings.integrations")}</h1>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{t("settings.desc","Connect to GitHub or Gitea")}</p></div>
        {!showForm && <button onClick={()=>setShowForm(true)} className="btn btn-primary"><Plus size={15}/>{t("settings.connect")}</button>}
      </div>

      {showForm && (
        <div className="card rounded-xl p-5 animate-[fadeInUp_.15s_ease-out]">
          <div className="grid gap-4 sm:grid-cols-2 mb-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("settings.provider","Provider")}</label>
              <div className="flex gap-2">
                <button type="button" onClick={()=>setProvider("github")}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${provider==="github"?"border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]":"border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"}`}>
                  <Code2 size={16}/>GitHub</button>
                <button type="button" onClick={()=>setProvider("gitea")}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${provider==="gitea"?"border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]":"border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"}`}>
                  <Globe size={16}/>Gitea</button>
              </div>
            </div>
            {provider==="gitea" && (
              <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("settings.instance_url","Instance URL")}</label>
                <input value={instanceUrl} onChange={e=>setInstanceUrl(e.target.value)} placeholder="https://gitea.example.com" className="input"/></div>
            )}
          </div>

          <div className="flex gap-1 rounded-lg bg-[var(--bg-muted)] p-1 mb-4">
            <button type="button" onClick={()=>setAuthMode("oauth")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${authMode==="oauth"?"bg-white shadow-sm text-[var(--text)]":"text-[var(--text-muted)]"}`}>
              <Link2 size={12} className="inline mr-1"/>OAuth</button>
            <button type="button" onClick={()=>setAuthMode("pat")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${authMode==="pat"?"bg-white shadow-sm text-[var(--text)]":"text-[var(--text-muted)]"}`}>
              <Key size={12} className="inline mr-1"/>PAT</button>
          </div>

          {authMode==="oauth" ? (
            <div className="rounded-lg bg-[var(--bg)] p-4 text-center">
              <p className="text-[13px] text-[var(--text-muted)] mb-3">{t("settings.oauth_desc","Click below to authorize via OAuth.")}</p>
              <button type="button" onClick={connectOAuth} disabled={oauthConnecting} className="btn btn-primary">
                {oauthConnecting?t("common.loading"):t("settings.connect")}</button>
            </div>
          ) : (
            <form onSubmit={connectPAT}>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("settings.token","Token")}</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2"><Key size={14} className="text-[var(--text-muted)]"/></span>
                  <input type="password" required value={token} onChange={e=>setToken(e.target.value)} placeholder="ghp_xxx" className="input pl-9"/>
                </div>
                <button type="submit" disabled={sub} className="btn btn-primary btn-sm">{t("settings.connect")}</button>
              </div>
            </form>
          )}
          {error && <div className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-[13px] text-red-600">{error}</div>}
        </div>
      )}

      {conns.length===0 && !showForm ? (
        <div className="card flex flex-col items-center justify-center py-16 rounded-xl text-[var(--text-muted)]">
          <ExternalLink size={36} className="mb-3 text-[var(--border)]"/>
          <p className="text-sm">{t("settings.no_connections","No connections yet")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {conns.map(c=>(
            <div key={c.id} className="card rounded-xl p-4 group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.provider==="github"?"bg-[var(--text)]":"bg-orange-100"}`}>
                    {c.provider==="github"?<Code2 size={18} className="text-white"/>:<Globe size={18} className="text-orange-600"/>}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{c.provider==="github"?"GitHub":"Gitea"}</span>
                      {c.instance_url&&<span className="text-[11px] text-[var(--text-muted)] font-mono">{c.instance_url}</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.is_active?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-600"}`}>
                        {c.is_active?<CheckCircle2 size={10} className="inline mr-0.5"/>:<XCircle size={10} className="inline mr-0.5"/>}
                        {c.is_active?t("common.active","Active"):t("common.inactive","Inactive")}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                      {t("settings.connected_as","Connected as")} <strong className="text-[var(--text)]">{c.remote_username}</strong>
                      {c.last_synced_at&&<span className="ml-2">· {t("settings.last_sync","Last sync")}: {new Date(c.last_synced_at).toLocaleString()}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={()=>test(c.id)} className="btn btn-outline btn-xs">{t("common.test")}</button>
                  <button onClick={()=>remove(c.id)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
