import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X, Plus, ChevronDown, FilePlus2 } from "lucide-react";
import { createIssue } from "../api/issues";
import api from "../api/client";
import { ALL_ROLES } from "../constants";
import MarkdownEditor from "../components/MarkdownEditor";
import PageHeader from "../components/ui/PageHeader";
import Segmented from "../components/ui/Segmented";

export default function IssueCreatePage() {
  const navigate = useNavigate(); const { t } = useTranslation();
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [searchParams] = useSearchParams();
  const [issueType, setIssueType] = useState(searchParams.get("type") === "feature" ? "feature" : "bug");
  const [priority, setPriority] = useState("medium"); const [sub, setSub] = useState(false);
  const [startDate, setStartDate] = useState(""); const [dueDate, setDueDate] = useState("");
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
      assignees: assignees.map(a => ({ user_id: a.user_id, role: a.role })), start_date: startDate || null, due_date: dueDate || null,
    });
    setSub(false); navigate(`/issues/${issue.id}`);
  };

  return (
    <div className="page-enter mx-auto max-w-3xl space-y-3">
      <PageHeader
        icon={FilePlus2}
        title={t("issues.new_issue")}
        subtitle={t("issues.create_desc","Create a new issue in the project.")}
        actions={
          <Segmented
            ariaLabel="Type"
            value={issueType as "bug" | "feature"}
            onChange={v => setIssueType(v)}
            items={[
              { key: "bug", label: t("issues.type.bug") },
              { key: "feature", label: t("issues.type.feature") },
            ]}
          />
        }
      />

      <form onSubmit={handle} className="panel p-5 space-y-4">

        {/* Title */}
        <div>
          <label className="field-label">{t("common.title")} *</label>
          <input required value={title} onChange={e => setTitle(e.target.value)}
            className="input text-sm" placeholder={t("issues.title_placeholder","Brief summary")}/>
        </div>

        {/* Description */}
        <div>
          <label className="field-label">
            {t("common.description")} <span className="font-normal text-[var(--text-faint)]">(Markdown)</span>
          </label>
          <MarkdownEditor
            value={desc}
            onChange={setDesc}
            rows={14}
            className="min-h-[360px]"
            placeholder={"## Summary\n\nDescribe..."}
          />
        </div>

        {/* Assignees */}
        <div>
          <label className="field-label">
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
                <div className="modal-card absolute left-0 top-full z-10 mt-1 w-48 py-1.5">
                  <div className="px-2 pb-1 mb-1 border-b border-[var(--border-light)]">
                    <div className="flex flex-wrap gap-1">
                      {ALL_ROLES.map(r => (
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
        <div className="grid gap-4 sm:grid-cols-2"><div><label className="field-label">{t("milestones.start", "开始时间")}</label><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="input text-sm"/></div><div><label className="field-label">{t("common.due_date", "Due date")}</label><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className="input text-sm"/></div></div>
        <div>
          <label className="field-label">{t("common.priority")}</label>
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
