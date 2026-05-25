import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIssue, updateIssue } from "../api/issues";

const STAT = ["open","in_progress","resolved","closed","cancelled"];
const PRIS = ["critical","high","medium","low","trivial"];

export default function IssueEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate(); const { t } = useTranslation();
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [status, setStatus] = useState(""); const [priority, setPriority] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { if(!id)return; getIssue(id).then(d=>{ setTitle(d.title); setDesc(d.description); setStatus(d.status); setPriority(d.priority); setLoading(false); }); }, [id]);

  const handle = async (e: React.FormEvent) => { e.preventDefault(); if(!id)return; await updateIssue(id,{title,description:desc,status,priority}); navigate(`/issues/${id}`); };

  if (loading) return (
    <div className="flex justify-center pt-24">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--primary)] border-t-transparent"/>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-5 page-enter">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("issues.edit_issue")}</h1>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)] font-mono">#{id?.slice(0,8)}</p>
      </div>

      <form onSubmit={handle} className="card rounded-xl p-6 space-y-4">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">{t("common.title")} *</label>
          <input required value={title} onChange={e => setTitle(e.target.value)} className="input text-sm"/>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">
            {t("common.description")} <span className="font-normal lowercase text-[var(--text-muted)]">(Markdown)</span>
          </label>
          <textarea rows={8} value={desc} onChange={e => setDesc(e.target.value)}
            className="input text-sm resize-y min-h-[120px]"/>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">{t("common.status")}</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="input text-sm">
              {STAT.map(s => <option key={s} value={s}>{t(`issues.status.${s}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">{t("common.priority")}</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="input text-sm">
              {PRIS.map(p => <option key={p} value={p}>{t(`issues.priority.${p}`)}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button type="submit" className="btn btn-primary">{t("common.save")}</button>
          <button type="button" onClick={() => navigate(`/issues/${id}`)} className="btn btn-ghost">{t("common.cancel")}</button>
        </div>
      </form>
    </div>
  );
}
