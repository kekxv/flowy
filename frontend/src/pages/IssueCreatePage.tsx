import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createIssue } from "../api/issues";

export default function IssueCreatePage() {
  const navigate = useNavigate(); const { t } = useTranslation();
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState("medium"); const [sub, setSub] = useState(false);

  const handle = async (e: React.FormEvent) => { e.preventDefault(); setSub(true);
    const issue = await createIssue({title,description:desc,priority}); setSub(false); navigate(`/issues/${issue.id}`); };

  return (
    <div className="mx-auto max-w-2xl space-y-5 page-enter">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("issues.new_issue")}</h1>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{t("issues.create_desc","Create a new issue in the project.")}</p>
      </div>

      <form onSubmit={handle} className="card rounded-xl p-6 space-y-4">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">{t("common.title")} *</label>
          <input required value={title} onChange={e => setTitle(e.target.value)}
            className="input text-sm" placeholder={t("issues.title_placeholder","Brief summary of the issue")}/>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">
            {t("common.description")} <span className="font-normal lowercase text-[var(--text-muted)]">(Markdown)</span>
          </label>
          <textarea rows={8} value={desc} onChange={e => setDesc(e.target.value)}
            className="input text-sm resize-y min-h-[120px]" placeholder="## Summary&#10;&#10;Describe the issue in detail..."/>
        </div>

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
