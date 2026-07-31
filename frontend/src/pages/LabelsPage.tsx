import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Edit3, Trash2, Lock } from "lucide-react";
import { listLabels, createLabel, updateLabel, deleteLabel, type LabelData } from "../api/issues";
import { useAuthStore } from "../store/authStore";
import Loader from "../components/Loader";

export default function LabelsPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === "admin";
  const [labels, setLabels] = useState<LabelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LabelData|null>(null);
  const [name, setName] = useState("");
  const randomColor = () => "#"+Math.floor(Math.random()*16777215).toString(16).padStart(6,"0");
  const [color, setColor] = useState("#6366f1");
  const [description, setDescription] = useState("");

  const fetch = async () => { const d=await listLabels(); setLabels(d); setLoading(false); };
  useEffect(()=>{fetch();},[]);

  const reset = () => { setName(""); setColor(randomColor()); setDescription(""); setEditing(null); setShowForm(false); };
  const edit = (l:LabelData) => { setEditing(l); setName(l.name); setColor(l.color); setDescription(l.description); setShowForm(true); };
  const submit = async (e:React.FormEvent) => { e.preventDefault();
    editing?await updateLabel(editing.id,{name,color,description}):await createLabel({name,color,description});reset();fetch(); };
  const remove = async (id:string) => { if(!confirm(t("common.confirm")+"?"))return; await deleteLabel(id); fetch(); };

  if (loading) return <Loader />;
  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center pt-24 text-[var(--text-muted)]">
      <Lock size={40} className="mb-3 opacity-30"/>
      <p className="text-sm font-medium">Access denied</p>
      <p className="text-xs mt-1">Admin only</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5 page-enter">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-semibold tracking-tight">{t("common.labels")}</h1>
        {isAdmin && <button onClick={()=>{reset();setShowForm(true);}} className="btn btn-primary btn-sm"><Plus size={13}/>{t("common.create")}</button>}
      </div>

      {showForm&&(
        <div className="card rounded-[8px] p-5 animate-[fadeInUp_.15s_ease-out]">
          <form onSubmit={submit} className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1"><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("common.name","Name")}</label><input required value={name} onChange={e=>setName(e.target.value)} placeholder="bug" className="input"/></div>
              <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("common.color","Color")}</label>
                <div className="flex items-center gap-2">
                  <span className="h-9 w-9 rounded-lg border shadow-sm" style={{backgroundColor:color}}/>
                  <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="h-9 w-16 cursor-pointer rounded-lg border border-[var(--border)] p-0.5"/></div></div>
            </div>
            <div><label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1 block">{t("common.description")} <span className="font-normal lowercase text-[var(--text-muted)]/60">({t("common.optional","optional")})</span></label>
              <input value={description} onChange={e=>setDescription(e.target.value)} placeholder={t("common.desc_hint","Short description")} className="input"/></div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary btn-sm">{editing?t("common.save"):t("common.create")}</button>
              <button type="button" onClick={reset} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
            </div>
          </form>
        </div>
      )}

      {labels.length===0?(
        <div className="card flex flex-col items-center justify-center py-16 rounded-[8px] text-[var(--text-muted)]">
          <TagsIcon/><p className="mt-3 text-[13px]">{t("issues.no_issues")}</p>
        </div>
      ):(
        <div className="card overflow-hidden rounded-[8px] divide-y divide-[var(--border-light)]">
          {labels.map(l=>(
            <div key={l.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-muted)] transition-colors">
              {/* Left: color indicator */}
              <div className="w-[26px] h-[26px] shrink-0 rounded-[6px]" style={{backgroundColor:l.color+"18"}}>
                <span className="flex h-full w-full items-center justify-center">
                  <span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:l.color}}/>
                </span>
              </div>
              {/* Center: name + description */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-[var(--text)] truncate">{l.name}</span>
                  <span className="flex h-[18px] items-center rounded-full px-1.5 text-[10px] font-medium" style={{backgroundColor:l.color+"0a",color:l.color}}>
                    <span className="h-1.5 w-1.5 rounded-full mr-1" style={{backgroundColor:l.color}}/>{l.color}
                  </span>
                </div>
                {l.description&&<p className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">{l.description}</p>}
              </div>
              {/* Right: actions */}
              {isAdmin && <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={()=>edit(l)} className="rounded p-1 text-[var(--text-faint)] hover:text-[var(--primary)] hover:bg-[var(--primary-subtle)] transition-colors" title={t("common.edit")}><Edit3 size={14}/></button>
                <button onClick={()=>remove(l.id)} className="rounded p-1 text-[var(--text-faint)] hover:text-red-500 hover:bg-red-50 transition-colors" title={t("common.delete")}><Trash2 size={14}/></button>
              </div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TagsIcon() { return <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2H2v10l9.3 9.3c.4.4 1 .4 1.4 0l7.6-7.6c.4-.4.4-1 0-1.4L12 2Z"/><circle cx="7" cy="7" r="1.5" fill="var(--border)"/></svg>; }
