import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X, Plus, ChevronDown } from "lucide-react";
import { createIssue } from "../api/issues";
import api from "../api/client";

const ROLES = ["project_lead","backend_dev","frontend_dev","tester","ui_designer","devops","clerk","member"];

export default function IssueCreatePage() {
  const navigate = useNavigate(); const { t } = useTranslation();
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [issueType, setIssueType] = useState("bug");
  const [priority, setPriority] = useState("medium"); const [sub, setSub] = useState(false);
  const [users, setUsers] = useState<Array<{id:string;username:string;display_name:string}>>([]);
  const [assignees, setAssignees] = useState<Array<{user_id:string;role:string;name:string}>>([]);
  const [roleOpen, setRoleOpen] = useState(false);
  const [selRole, setSelRole] = useState("project_lead");

  useEffect(() => { api.get("/users").then(r => setUsers(r.data)).catch(()=>{}); }, []);

  const addAssignee = (uid: string, role: string) => {
    if (assignees.some(a => a.user_id === uid && a.role === role)) return;
    const u = users.find(x => x.id === uid);
    setAssignees([...assignees, { user_id: uid, role, name: u?.display_name || u?.username || uid }]);
  };
  const removeAssignee = (uid: string, role: string) => {
    setAssignees(assignees.filter(a => !(a.user_id === uid && a.role === role)));
  };

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (issueType === "feature" && assignees.length === 0) {
      alert(t("issues.feature_require_owner","需求必须指定一个负责人"));
      return;
    }
    setSub(true);
    const issue = await createIssue({
      title, description: desc, issue_type: issueType, priority,
      assignees: assignees.map(a => ({ user_id: a.user_id, role: a.role })),
    });
    setSub(false); navigate(`/issues/${issue.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 page-enter">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("issues.new_issue")}</h1>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{t("issues.create_desc","Create a new issue in the project.")}</p>
      </div>

      <form onSubmit={handle} className="card rounded-xl p-6 space-y-4">
        {/* Type */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">Type</label>
          <div className="flex rounded-lg bg-[var(--bg-muted)] p-0.5 w-64">
            {(["bug","feature"] as const).map(v => (
              <button key={v} type="button" onClick={() => setIssueType(v)}
                className={`flex-1 rounded-md py-1.5 text-[12px] font-medium transition-all ${issueType===v?"bg-white text-[var(--text)] shadow-sm":"text-[var(--text-muted)]"}`}>
                {t(`issues.type.${v}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">{t("common.title")} *</label>
          <input required value={title} onChange={e => setTitle(e.target.value)}
            className="input text-sm" placeholder={t("issues.title_placeholder","Brief summary")}/>
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">
            {t("common.description")} <span className="font-normal lowercase text-[var(--text-muted)]">(Markdown)</span>
          </label>
          <textarea rows={6} value={desc} onChange={e => setDesc(e.target.value)}
            className="input text-sm resize-y min-h-[100px]" placeholder="## Summary&#10;&#10;Describe..."/>
        </div>

        {/* Assignees */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">
            {t("common.assignee","Assignee")} {issueType==="feature" && "*"}
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {assignees.map(a => (
              <span key={`${a.user_id}-${a.role}`} className={`role-badge role-${a.role} border border-[var(--border-light)] inline-flex items-center gap-0.5`}>
                {a.name}<span className="opacity-60">·{t(`roles.${a.role}`)}</span>
                <button type="button" onClick={() => removeAssignee(a.user_id, a.role)} className="rounded-full p-0.5 hover:bg-red-100"><X size={9}/></button>
              </span>
            ))}
            <div className="relative">
              <button type="button" onClick={() => setRoleOpen(!roleOpen)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]">
                <Plus size={10}/> {t("roles.role")} <ChevronDown size={8}/>
              </button>
              {roleOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 w-48 card rounded-xl py-1.5 shadow-[var(--shadow-lg)] animate-[fadeInUp_.12s_ease-out]">
                  <div className="px-2 pb-1 mb-1 border-b border-[var(--border-light)]">
                    <div className="flex flex-wrap gap-1">
                      {ROLES.map(r => (
                        <button key={r} type="button" onClick={() => setSelRole(r)}
                          className={`role-badge role-${r} rounded px-1.5 py-0.5 text-[10px] ${selRole===r ? "ring-2 ring-[var(--primary)]" : ""}`}>{t(`roles.${r}`)}</button>
                      ))}
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {users.map(u => (
                      <button key={u.id} type="button" onClick={() => { addAssignee(u.id, selRole); setRoleOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-[var(--bg-hover)] transition-colors">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[9px] font-semibold text-[var(--primary)] shrink-0">
                          {(u.display_name||u.username).slice(0,1).toUpperCase()}
                        </span>
                        {u.display_name||u.username}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">{t("common.priority")}</label>
          <select value={priority} onChange={e => setPriority(e.target.value)} className="input text-sm w-48">
            {["critical","high","medium","low","trivial"].map(p => (
              <option key={p} value={p}>{t(`issues.priority.${p}`)}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={sub} className="btn btn-primary">{sub ? t("common.loading") : t("common.create")}</button>
          <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost">{t("common.cancel")}</button>
        </div>
      </form>
    </div>
  );
}
