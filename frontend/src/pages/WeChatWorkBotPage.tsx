import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot, Play, Square, RefreshCw, Plus, Trash2, Pencil, Users, Settings, ScrollText,
  CheckCircle2, XCircle, Shield, Wrench, Eye, Loader2, Link, Copy, X,
} from "lucide-react";
import api from "../api/client";

interface BotConfig {
  bot_id: string;
  ai_enabled: boolean;
  auto_reply: boolean;
  is_running: boolean;
}
interface BotUser {
  id: string;
  wechat_user_id: string;
  display_name: string | null;
  flowy_user_id: string | null;
  role: string;
  flowy_user_name: string;
  created_at: string;
}
interface BotLog {
  id: string;
  wechat_user_id: string;
  command: string;
  status: string;
  created_at: string;
  response: string | null;
  error: string | null;
}
interface FlowyUser {
  id: string;
  username: string;
  display_name: string;
}

type Tab = "config" | "users" | "logs";

const ROLE_ICONS: Record<string, typeof Shield> = {
  admin: Shield,
  helper: Wrench,
  viewer: Eye,
};
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-50 text-purple-700",
  helper: "bg-blue-50 text-blue-700",
  viewer: "bg-gray-50 text-gray-600",
};
const ROLE_LABELS: Record<string, string> = {
  admin: "管理员",
  helper: "协助人员",
  viewer: "查看者",
};

export default function WeChatWorkBotPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("config");
  const [config, setConfig] = useState<BotConfig>({ bot_id: "", ai_enabled: false, auto_reply: true, is_running: false });
  const [formSecret, setFormSecret] = useState("");
  const [users, setUsers] = useState<BotUser[]>([]);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [flowyUsers, setFlowyUsers] = useState<FlowyUser[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [userForm, setUserForm] = useState({ wechat_user_id: "", display_name: "", flowy_user_id: "", role: "viewer" });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [showBindDialog, setShowBindDialog] = useState(false);
  const [bindForm, setBindForm] = useState({ flowy_user_id: "", role: "viewer" });
  const [bindResult, setBindResult] = useState<{ token: string; command: string } | null>(null);
  const [bindLoading, setBindLoading] = useState(false);
  const successTimer = useRef<any>(null);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccess(""), 3000);
  };

  const fetchConfig = async () => {
    try {
      const res = await api.get("/wechat-work-bot/config");
      setConfig(res.data);
    } catch { /* ignore */ }
  };

  const fetchUsers = async () => {
    try {
      const [usersRes, flowyRes] = await Promise.all([
        api.get("/wechat-work-bot/users"),
        api.get("/users"),
      ]);
      setUsers(usersRes.data);
      setFlowyUsers(flowyRes.data);
    } catch { /* ignore */ }
  };

  const fetchLogs = async () => {
    try {
      const res = await api.get("/wechat-work-bot/logs?page_size=100");
      setLogs(res.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchConfig(); }, []);
  useEffect(() => { if (tab === "users") fetchUsers(); }, [tab]);
  useEffect(() => { if (tab === "logs") fetchLogs(); }, [tab]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload: any = {
        bot_id: config.bot_id,
        ai_enabled: config.ai_enabled,
        auto_reply: config.auto_reply,
      };
      if (formSecret) payload.secret = formSecret;
      await api.put("/wechat-work-bot/config", payload);
      setFormSecret("");
      await fetchConfig();
      flashSuccess(t("common.saved"));
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/wechat-work-bot/start");
      if (res.data.ok) flashSuccess(res.data.message);
      else setError(res.data.message);
      await fetchConfig();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setError("");
    try {
      const res = await api.post("/wechat-work-bot/stop");
      flashSuccess(res.data.message);
      await fetchConfig();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (editingUserId) {
        await api.put(`/wechat-work-bot/users/${editingUserId}`, { role: userForm.role });
        flashSuccess(t("common.saved"));
      } else {
        await api.post("/wechat-work-bot/users", userForm);
        flashSuccess(t("common.create"));
      }
      setShowUserForm(false);
      setEditingUserId(null);
      setUserForm({ wechat_user_id: "", display_name: "", flowy_user_id: "", role: "viewer" });
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm(t("notifications.confirm_delete", "Delete?"))) return;
    try {
      await api.delete(`/wechat-work-bot/users/${id}`);
      fetchUsers();
      flashSuccess(t("common.delete") + " ✓");
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const openEditUser = (u: BotUser) => {
    setEditingUserId(u.id);
    setUserForm({ wechat_user_id: u.wechat_user_id, display_name: u.display_name || "", flowy_user_id: u.flowy_user_id || "", role: u.role });
    setShowUserForm(true);
  };

  const handleGenerateBind = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBindLoading(true);
    try {
      const res = await api.post("/wechat-work-bot/bind-token", bindForm);
      setBindResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setBindLoading(false);
    }
  };

  const copyCommand = () => {
    if (bindResult) {
      navigator.clipboard.writeText(bindResult.command);
      flashSuccess("已复制到剪贴板");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <Bot size={26} className="text-[var(--primary)]" />
          {t("wechat_work_bot.title", "企业微信机器人")}
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
          {t("wechat_work_bot.desc", "配置智能机器人，通过群聊管理问题和里程碑")}
        </p>
      </div>

      {error && <div className="card rounded-xl px-5 py-3 text-[13px] text-red-700 bg-red-50">{error}</div>}
      {success && <div className="card rounded-xl px-5 py-3 text-[13px] text-emerald-700 bg-emerald-50 flex items-center gap-2"><CheckCircle2 size={14}/>{success}</div>}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-[var(--bg-muted)] p-1">
        {([
          { key: "config" as Tab, label: t("wechat_work_bot.config", "配置"), icon: Settings },
          { key: "users" as Tab, label: t("wechat_work_bot.users", "用户管理"), icon: Users },
          { key: "logs" as Tab, label: t("wechat_work_bot.logs", "指令日志"), icon: ScrollText },
        ]).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${tab === key ? "bg-white shadow-sm text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* Tab: Config */}
      {tab === "config" && (
        <div className="card rounded-xl overflow-hidden">
          <form onSubmit={handleSaveConfig} className="space-y-5 p-5">
            {/* Status bar */}
            <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 ${config.is_running ? "bg-emerald-50" : "bg-[var(--bg-muted)]"}`}>
              <div className="flex items-center gap-2 text-[13px]">
                <div className={`h-2 w-2 rounded-full ${config.is_running ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
                <span className="font-medium">{config.is_running ? "运行中" : "已停止"}</span>
              </div>
              <div className="flex gap-1.5">
                {!config.is_running ? (
                  <button type="button" onClick={handleStart} className="btn btn-sm btn-primary" disabled={loading}>
                    {loading ? <Loader2 size={12} className="animate-spin mr-1" /> : <Play size={12} className="mr-1" />}
                    启动
                  </button>
                ) : (
                  <button type="button" onClick={handleStop} className="btn btn-sm btn-outline text-red-600 hover:bg-red-50">
                    <Square size={12} className="mr-1" />停止
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="text-[13px] font-medium text-[var(--text-secondary)]">Bot ID</label>
              <input type="text" value={config.bot_id} onChange={e => setConfig({ ...config, bot_id: e.target.value })}
                className="input mt-1" placeholder="企业微信机器人 Bot ID" />
            </div>

            <div>
              <label className="text-[13px] font-medium text-[var(--text-secondary)]">Secret</label>
              <input type="password" value={formSecret} onChange={e => setFormSecret(e.target.value)}
                className="input mt-1" placeholder={config.bot_id ? "留空保持不变" : "企业微信机器人 Secret"} />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={config.ai_enabled}
                  onChange={e => setConfig({ ...config, ai_enabled: e.target.checked })}
                  className="rounded border-[var(--border)]" />
                AI 自然语言匹配
              </label>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={config.auto_reply}
                  onChange={e => setConfig({ ...config, auto_reply: e.target.checked })}
                  className="rounded border-[var(--border)]" />
                自动回复提示
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading && <Loader2 size={14} className="animate-spin mr-1.5" />}
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab: Users */}
      {tab === "users" && (
        <div className="card rounded-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border-light)] px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <Users size={14} />
              机器人用户
              <span className="rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-bold">{users.length}</span>
            </h2>
            <button onClick={() => { setShowUserForm(true); setEditingUserId(null); setUserForm({ wechat_user_id: "", display_name: "", flowy_user_id: "", role: "viewer" }); }}
              className="btn btn-outline btn-sm"><Plus size={12} className="mr-1" />添加用户</button>
            <button onClick={() => { setShowBindDialog(true); setBindResult(null); setBindForm({ flowy_user_id: "", role: "viewer" }); }}
              className="btn btn-outline btn-sm"><Link size={12} className="mr-1" />生成绑定指令</button>
          </div>

          {showUserForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setShowUserForm(false); setEditingUserId(null); }}>
              <div className="card w-full max-w-md rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-semibold flex items-center gap-2">
                    <Users size={18} className="text-[var(--primary)]" />
                    {editingUserId ? "编辑用户" : "添加用户"}
                  </h3>
                  <button onClick={() => { setShowUserForm(false); setEditingUserId(null); }} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"><X size={16} /></button>
                </div>

                <form onSubmit={handleAddUser} className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-[var(--text-secondary)]">企业微信用户 ID</label>
                    <input type="text" value={userForm.wechat_user_id}
                      onChange={e => setUserForm({ ...userForm, wechat_user_id: e.target.value })}
                      className="input mt-1 text-[13px]" placeholder="woZpPdCQAA..." disabled={!!editingUserId} required />
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">从企业微信后台或消息日志中获取</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[var(--text-secondary)]">关联 Flowy 用户 <span className="text-[var(--text-muted)]">(可选)</span></label>
                    <select value={userForm.flowy_user_id}
                      onChange={e => setUserForm({ ...userForm, flowy_user_id: e.target.value })}
                      className="input mt-1 text-[13px]" disabled={!!editingUserId}>
                      <option value="">不绑定</option>
                      {flowyUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.display_name || u.username}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[var(--text-secondary)]">角色</label>
                    <select value={userForm.role}
                      onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                      className="input mt-1 text-[13px]">
                      <option value="viewer">查看者</option>
                      <option value="helper">协助人员</option>
                      <option value="admin">管理员</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => { setShowUserForm(false); setEditingUserId(null); }}
                      className="btn btn-outline btn-sm">{t("common.cancel")}</button>
                    <button type="submit" className="btn btn-primary btn-sm">
                      {editingUserId ? t("common.save") : t("common.create")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {users.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-[var(--text-muted)]">
              <Users size={28} className="mb-2 opacity-30" />
              <p className="text-[13px]">{t("common.no_data")}</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-light)]">
              {users.map(u => {
                const RoleIcon = ROLE_ICONS[u.role] || Eye;
                return (
                  <div key={u.id} className="flex items-center justify-between px-5 py-3.5 group hover:bg-[var(--bg-hover)] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ROLE_COLORS[u.role] || "bg-gray-50"}`}>
                        <RoleIcon size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">{u.flowy_user_name || u.wechat_user_id}</div>
                        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono">{u.wechat_user_id}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${ROLE_COLORS[u.role]}`}>
                            {ROLE_LABELS[u.role]}
                          </span>
                          {!u.flowy_user_id && <span className="text-[9px] text-[var(--text-muted)]">未绑定</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => openEditUser(u)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"><Pencil size={13} /></button>
                      <button onClick={() => handleDeleteUser(u.id)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bind Token Dialog */}
      {showBindDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowBindDialog(false)}>
          <div className="card w-full max-w-md rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold flex items-center gap-2">
                <Link size={18} className="text-[var(--primary)]" />
                生成绑定指令
              </h3>
              <button onClick={() => setShowBindDialog(false)} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-muted)]"><X size={16} /></button>
            </div>

            {!bindResult ? (
              <form onSubmit={handleGenerateBind} className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-[var(--text-secondary)]">Flowy 用户</label>
                  <select value={bindForm.flowy_user_id}
                    onChange={e => setBindForm({ ...bindForm, flowy_user_id: e.target.value })}
                    className="input mt-1 text-[13px]" required>
                    <option value="">选择用户...</option>
                    {flowyUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.display_name || u.username}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[var(--text-secondary)]">角色</label>
                  <select value={bindForm.role}
                    onChange={e => setBindForm({ ...bindForm, role: e.target.value })}
                    className="input mt-1 text-[13px]">
                    <option value="viewer">查看者</option>
                    <option value="helper">协助人员</option>
                    <option value="admin">管理员</option>
                  </select>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  生成后发送给目标用户，用户在群里发送该指令即可自动绑定。指令 10 分钟后失效。
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setShowBindDialog(false)} className="btn btn-outline btn-sm">{t("common.cancel")}</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={bindLoading}>
                    {bindLoading && <Loader2 size={12} className="animate-spin mr-1" />}
                    生成
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-[13px] text-emerald-800">
                  指令已生成，请发送给目标用户。10 分钟内有效。
                </div>
                <div className="rounded-lg bg-[var(--bg-muted)] px-4 py-3">
                  <code className="text-[13px] font-mono break-all text-[var(--text)]">{bindResult.command}</code>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={copyCommand} className="btn btn-outline btn-sm"><Copy size={12} className="mr-1" />复制</button>
                  <button onClick={() => { setShowBindDialog(false); setBindResult(null); }} className="btn btn-primary btn-sm">完成</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Logs */}
      {tab === "logs" && (
        <div className="card rounded-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border-light)] px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <ScrollText size={14} />
              指令日志
              <span className="rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-bold">{logs.length}</span>
            </h2>
            <button onClick={fetchLogs} className="btn btn-ghost btn-sm"><RefreshCw size={12} className="mr-1" />刷新</button>
          </div>

          {logs.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-[var(--text-muted)]">
              <ScrollText size={28} className="mb-2 opacity-30" />
              <p className="text-[13px]">{t("common.no_data")}</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-light)]">
              {logs.map(log => (
                <div key={log.id} className="px-5 py-3 hover:bg-[var(--bg-hover)] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[13px]">
                      <code className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[11px] font-mono font-semibold text-[var(--primary)]">
                        /{log.command}
                      </code>
                      <span className="text-[var(--text-muted)]">from</span>
                      <span className="font-mono text-[12px]">{log.wechat_user_id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium flex items-center gap-0.5 ${log.status === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                        {log.status === "success" ? <CheckCircle2 size={8} /> : <XCircle size={8} />}
                        {log.status}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {log.created_at?.slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                  </div>
                  {log.error && (
                    <div className="mt-1 text-[11px] text-red-500">{log.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
