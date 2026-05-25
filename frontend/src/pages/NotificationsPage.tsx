import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Plus, Trash2, Zap, Radio, Webhook, MessageSquare, CheckCircle2, XCircle, X, Pencil } from "lucide-react";
import api from "../api/client";

interface ChannelData { id: string; name: string; channel_type: string; config: Record<string, unknown>; is_active: boolean; }
interface RuleData { id: string; channel_id: string; event_type: string; name: string; filters: Record<string, unknown>; is_active: boolean; }

const CHANNEL_ICONS: Record<string, any> = { webhook: Webhook, wechat_work: MessageSquare };

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [rules, setRules] = useState<RuleData[]>([]);
  const [eventTypes, setEventTypes] = useState<Array<{ key: string; label: string; label_zh?: string }>>([]);
  const [modal, setModal] = useState<"channel"|"rule"|null>(null);
  const [editRuleId, setEditRuleId] = useState<string|null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [channelForm, setChannelForm] = useState({ name: "", channel_type: "webhook", url: "", secret: "", webhook_url: "", mentioned_list: "" });
  const [ruleForm, setRuleForm] = useState({ channel_id: "", event_types: [] as string[], name: "" });
  const successTimer = useRef<any>(null);

  const fetchData = async () => {
    const [chRes, rRes, etRes] = await Promise.all([
      api.get("/notifications/channels"), api.get("/notifications/rules"),
      api.get("/notifications/event-types"),
    ]);
    setChannels(chRes.data); setRules(rRes.data);
    setEventTypes(etRes.data);
  };
  useEffect(() => { fetchData(); }, []);

  const flashSuccess = (msg: string) => {
    setSuccess(msg); clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccess(""), 2500);
  };

  const buildConfig = (): Record<string, unknown> => {
    if (channelForm.channel_type === "webhook") {
      const cfg: Record<string, unknown> = { url: channelForm.url };
      if (channelForm.secret) cfg.secret = channelForm.secret;
      return cfg;
    }
    const cfg: Record<string, unknown> = { webhook_url: channelForm.webhook_url };
    if (channelForm.mentioned_list) cfg.mentioned_list = channelForm.mentioned_list.split(",").map(s => s.trim()).filter(Boolean);
    return cfg;
  };
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      await api.post("/notifications/channels", { name: channelForm.name, channel_type: channelForm.channel_type, config: buildConfig() });
      setModal(null); setChannelForm({ name: "", channel_type: "webhook", url: "", secret: "", webhook_url: "", mentioned_list: "" });
      fetchData(); flashSuccess(t("notifications.channel_created","Channel created"));
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
  };
  const toggleRuleEvent = (key: string) => {
    setRuleForm(f => ({
      ...f,
      event_types: f.event_types.includes(key) ? f.event_types.filter(e => e !== key) : [...f.event_types, key],
    }));
  };
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (ruleForm.event_types.length === 0) { setError(t("notifications.select_event","Select at least one event")); return; }
    const payload = { channel_id: ruleForm.channel_id, event_type: ruleForm.event_types.join(","), name: ruleForm.name };
    try {
      if (editRuleId) {
        await api.put(`/notifications/rules/${editRuleId}`, payload);
        flashSuccess(t("notifications.rule_updated","Rule updated"));
      } else {
        await api.post("/notifications/rules", payload);
        flashSuccess(t("notifications.rule_created","Rule created"));
      }
      setModal(null); setEditRuleId(null);
      setRuleForm({ channel_id: "", event_types: [], name: "" }); fetchData();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Failed"); }
  };
  const handleDeleteChannel = async (id: string) => { if (!confirm(t("notifications.confirm_delete","Delete?"))) return; await api.delete(`/notifications/channels/${id}`); fetchData(); };
  const handleDeleteRule = async (id: string) => { if (!confirm(t("notifications.confirm_delete","Delete?"))) return; await api.delete(`/notifications/rules/${id}`); fetchData(); };
  const handleTestChannel = async (id: string) => {
    const res = await api.post(`/notifications/channels/${id}/test`);
    alert(res.data.ok ? t("notifications.test_ok","OK") : `${t("notifications.test_fail","Failed")}: ${res.data.error || "unknown"}`);
  };

  const openEditRule = (r: RuleData) => {
    setEditRuleId(r.id);
    setRuleForm({
      channel_id: r.channel_id,
      event_types: r.event_type.split(",").filter(Boolean),
      name: r.name,
    });
    setModal("rule");
  };

  const channelTypeNames: Record<string, string> = { webhook: "Generic Webhook", wechat_work: t("notifications.wechat_work","WeChat Work") };
  const getChannelName = (cid: string) => { const c = channels.find(x => x.id === cid); return c ? `${c.name} (${channelTypeNames[c.channel_type] || c.channel_type})` : cid; };

  return (
    <div className="mx-auto max-w-3xl space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("notifications.title")}</h1>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{t("notifications.desc","Manage notification channels and rules.")}</p>
      </div>

      {error && <div className="card rounded-xl px-5 py-3 text-[13px] text-red-700 bg-red-50">{error}</div>}
      {success && <div className="card rounded-xl px-5 py-3 text-[13px] text-emerald-700 bg-emerald-50 flex items-center gap-2"><CheckCircle2 size={14}/>{success}</div>}

      {/* Channels */}
      <div className="card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-light)] px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <Radio size={14}/>{t("notifications.channels")}
            <span className="rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-bold">{channels.length}</span>
          </h2>
          <button onClick={() => { setChannelForm({ name: "", channel_type: "webhook", url: "", secret: "", webhook_url: "", mentioned_list: "" }); setModal("channel"); }}
            className="btn btn-outline btn-sm"><Plus size={12} className="mr-1"/>{t("notifications.add_channel")}</button>
        </div>
        {channels.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-[var(--text-muted)]">
            <Radio size={28} className="mb-2 opacity-30"/>
            <p className="text-[13px]">{t("common.no_data")}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {channels.map(c => {
              const Icon = CHANNEL_ICONS[c.channel_type] || Webhook;
              return (
                <div key={c.id} className="flex items-center justify-between px-5 py-3.5 group hover:bg-[var(--bg-hover)] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.is_active ? "bg-emerald-50" : "bg-[var(--bg-muted)]"}`}>
                      <Icon size={15} className={c.is_active ? "text-emerald-600" : "text-[var(--text-muted)]"}/>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{c.name}</div>
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 flex-wrap">
                        <span>{channelTypeNames[c.channel_type] || c.channel_type}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${c.is_active ? "bg-emerald-50 text-emerald-600" : "bg-[var(--bg-muted)] text-[var(--text-muted)]"}`}>
                          {c.is_active ? <><CheckCircle2 size={8} className="inline mr-0.5"/>{t("admin.active")}</> : <><XCircle size={8} className="inline mr-0.5"/>{t("admin.inactive")}</>}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => handleTestChannel(c.id)} className="btn btn-ghost btn-sm text-[11px]">{t("common.test")}</button>
                    <button onClick={() => handleDeleteChannel(c.id)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500"><Trash2 size={13}/></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rules */}
      <div className="card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-light)] px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <Bell size={14}/>{t("notifications.rules")}
            <span className="rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-bold">{rules.length}</span>
          </h2>
          <button onClick={() => { setEditRuleId(null); setRuleForm({ channel_id: channels[0]?.id || "", event_types: [], name: "" }); setModal("rule"); }}
            className="btn btn-outline btn-sm"><Plus size={12} className="mr-1"/>{t("notifications.add_rule")}</button>
        </div>
        {rules.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-[var(--text-muted)]">
            <Bell size={28} className="mb-2 opacity-30"/>
            <p className="text-[13px]">{t("common.no_data")}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {rules.map(r => {
              const events = r.event_type.split(",").filter(Boolean);
              return (
              <div key={r.id} className="flex items-start gap-3 px-5 py-3.5 group hover:bg-[var(--bg-hover)] transition-colors">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5 ${r.is_active ? "bg-[var(--primary-light)]" : "bg-[var(--bg-muted)]"}`}>
                  <Zap size={15} className={r.is_active ? "text-[var(--primary)]" : "text-[var(--text-muted)]"}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{r.name || events.map(e => t(`events.${e}`, e)).join(", ")}</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5 space-y-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      {events.map(ev => (
                        <span key={ev} className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] whitespace-nowrap">{t(`events.${ev}`, ev)}</span>
                      ))}
                      <span className="text-[var(--text-muted)]/50">→</span>
                      <span className="truncate">{getChannelName(r.channel_id)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => openEditRule(r)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><Pencil size={13}/></button>
                  <button onClick={() => handleDeleteRule(r.id)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500"><Trash2 size={13}/></button>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => { setModal(null); setEditRuleId(null); }}>
          <div className="card w-[420px] max-h-[85vh] overflow-y-auto rounded-xl p-5 shadow-[var(--shadow-lg)] animate-[fadeInUp_.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">
                {modal === "channel" ? t("notifications.add_channel") : editRuleId ? t("common.edit")+" "+t("notifications.rules") : t("notifications.add_rule")}
              </h3>
              <button onClick={() => { setModal(null); setEditRuleId(null); }} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={16}/></button>
            </div>
            {modal === "channel" ? (
              <form onSubmit={handleCreateChannel} className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("common.name")}</label>
                  <input type="text" required value={channelForm.name}
                    onChange={e => setChannelForm({ ...channelForm, name: e.target.value })}
                    className="input text-xs" placeholder={t("notifications.channel_name_placeholder","My Bot")}/>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("notifications.channel_type","Type")}</label>
                  <select value={channelForm.channel_type}
                    onChange={e => setChannelForm({ name: channelForm.name, channel_type: e.target.value, url: "", secret: "", webhook_url: "", mentioned_list: "" })}
                    className="input text-xs">
                    {Object.entries(channelTypeNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                {channelForm.channel_type === "webhook" ? <>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("notifications.webhook_url","Webhook URL")} *</label>
                    <input type="url" required value={channelForm.url}
                      onChange={e => setChannelForm({ ...channelForm, url: e.target.value })}
                      className="input text-xs" placeholder="https://hooks.example.com/notify"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("notifications.secret","Secret")} ({t("common.optional")})</label>
                    <input type="text" value={channelForm.secret}
                      onChange={e => setChannelForm({ ...channelForm, secret: e.target.value })}
                      className="input text-xs" placeholder={t("notifications.secret_placeholder","X-Signature header value")}/>
                  </div>
                </> : <>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("notifications.webhook_url","Webhook URL")} *</label>
                    <input type="url" required value={channelForm.webhook_url}
                      onChange={e => setChannelForm({ ...channelForm, webhook_url: e.target.value })}
                      className="input text-xs" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"/>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">@ {t("notifications.mention_list","Mention List")} ({t("common.optional")})</label>
                    <input type="text" value={channelForm.mentioned_list}
                      onChange={e => setChannelForm({ ...channelForm, mentioned_list: e.target.value })}
                      className="input text-xs" placeholder="user1, user2, @all"/>
                  </div>
                </>}
                <div className="flex gap-2 pt-1">
                  <button type="submit" className="btn btn-primary btn-sm">{t("common.create")}</button>
                  <button type="button" onClick={() => setModal(null)} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSaveRule} className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("common.name")} ({t("common.optional")})</label>
                  <input type="text" value={ruleForm.name}
                    onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })}
                    className="input text-xs" placeholder={t("notifications.rule_name_placeholder","e.g. Issue alerts to Slack")}/>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("notifications.channel","Channel")}</label>
                  <select required value={ruleForm.channel_id}
                    onChange={e => setRuleForm({ ...ruleForm, channel_id: e.target.value })}
                    className="input text-xs">
                    <option value="">--</option>
                    {channels.map(c => <option key={c.id} value={c.id}>{getChannelName(c.id)}</option>)}
                  </select>
                </div>
                <EventSelector
                  eventTypes={eventTypes}
                  selected={ruleForm.event_types}
                  onToggle={toggleRuleEvent}
                  t={t}
                />
                <div className="flex gap-2 pt-1">
                  <button type="submit" className="btn btn-primary btn-sm">{editRuleId ? t("common.save") : t("common.create")}</button>
                  <button type="button" onClick={() => { setModal(null); setEditRuleId(null); }} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Grouped event selector component
function EventSelector({ eventTypes, selected, onToggle, t }: {
  eventTypes: Array<{ key: string; label: string }>;
  selected: string[];
  onToggle: (key: string) => void;
  t: (key: string, fallback?: string) => string;
}) {
  const groups: Record<string, { label: string; keys: string[] }> = {
    issue: { label: "Issue", keys: eventTypes.filter(e => e.key.startsWith("issue.")).map(e => e.key) },
    milestone: { label: t("milestone.title","Milestones"), keys: eventTypes.filter(e => e.key.startsWith("milestone.")).map(e => e.key) },
    timer: { label: t("issues.time_tracking","Time Tracking"), keys: eventTypes.filter(e => e.key.startsWith("timer.")).map(e => e.key) },
    external: { label: t("settings.integrations","External"), keys: eventTypes.filter(e => e.key.startsWith("external") || e.key.startsWith("sync.")).map(e => e.key) },
  };

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groupSelected = (keys: string[]) => keys.filter(k => selected.includes(k)).length;
  const toggleGroup = (keys: string[]) => {
    const allSelected = keys.every(k => selected.includes(k));
    keys.forEach(k => {
      if (allSelected ? selected.includes(k) : !selected.includes(k)) onToggle(k);
    });
  };

  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">
        {t("notifications.events","Events")}
        <span className="font-normal lowercase ml-1">({selected.length})</span>
      </label>
      <div className="space-y-1 rounded-lg border border-[var(--border)] p-1.5">
        {Object.entries(groups).map(([gid, g]) => {
          const sel = groupSelected(g.keys);
          const allSel = sel === g.keys.length;
          const isCollapsed = collapsed[gid];
          return (
            <div key={gid}>
              <div className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${allSel ? "bg-[var(--primary-light)]" : "hover:bg-[var(--bg-hover)]"}`}>
                <input type="checkbox" checked={allSel} onChange={() => toggleGroup(g.keys)}
                  className="rounded accent-[var(--primary)]"/>
                <span onClick={() => setCollapsed(c => ({...c, [gid]: !c[gid]}))}
                  className={`flex-1 text-[12px] font-medium select-none ${allSel ? "text-[var(--primary)]" : "text-[var(--text)]"}`}>
                  {g.label}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">{sel}/{g.keys.length}</span>
              </div>
              {!isCollapsed && (
                <div className="ml-5 mt-0.5 space-y-0.5">
                  {g.keys.map(key => (
                    <label key={key}
                      className={`flex items-center gap-2 rounded-md px-2 py-1 text-[11px] cursor-pointer transition-colors ${
                        selected.includes(key) ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                      }`}>
                      <input type="checkbox" checked={selected.includes(key)}
                        onChange={() => onToggle(key)}
                        className="rounded accent-[var(--primary)]"/>
                      {t(`events.${key}`, key)}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
