import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Lock, Tag } from "lucide-react";
import { listLabels, createLabel, updateLabel, deleteLabel, type LabelData } from "../api/issues";
import { useAuthStore } from "../store/authStore";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import { ListSkeleton } from "../components/ui/Skeleton";

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

  if (!isAdmin) return (
    <EmptyState icon={Lock} title={t("common.no_permission", "Access denied")} hint={t("common.admin_only", "仅管理员可管理标签")} />
  );

  return (
    <div className="page-enter mx-auto max-w-3xl">
      <PageHeader
        icon={Tag}
        title={t("common.labels")}
        subtitle={loading ? t("common.loading", "加载中…") : t("labels.subtitle", "共 {{n}} 个标签，用于给问题分类和筛选", { n: labels.length })}
        actions={
          <button onClick={()=>{reset();setShowForm(true);}} className="btn btn-primary btn-sm">
            <Plus size={13}/>{t("labels.new", "新建标签")}
          </button>
        }
      />

      {showForm && (
        <div className="panel mb-3 p-4">
          <form onSubmit={submit} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="field min-w-[200px] flex-1">
                <span className="field-label">{t("common.name","Name")}</span>
                <input required value={name} onChange={e=>setName(e.target.value)} placeholder="bug" className="input h-9"/>
              </label>
              <label className="field">
                <span className="field-label">{t("common.color","Color")}</span>
                <span className="flex items-center gap-2">
                  <span className="h-9 w-9 rounded-[8px] border border-[var(--border)]" style={{backgroundColor:color}}/>
                  <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded-[8px] border border-[var(--border)] p-0.5"/>
                </span>
              </label>
            </div>
            <label className="field">
              <span className="field-label">{t("common.description")} <span className="font-normal text-[var(--text-faint)]">({t("common.optional","optional")})</span></span>
              <input value={description} onChange={e=>setDescription(e.target.value)} placeholder={t("common.desc_hint","Short description")} className="input h-9"/>
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary btn-sm">{editing?t("common.save"):t("common.create")}</button>
              <button type="button" onClick={reset} className="btn btn-ghost btn-sm">{t("common.cancel")}</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <ListSkeleton rows={5}/> : labels.length===0 ? (
        <div className="panel">
          <EmptyState icon={Tag} title={t("labels.empty", "还没有标签")} hint={t("labels.empty_hint", "创建标签后，可以在问题详情里给问题打标并按标签筛选。")} />
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="divide-y divide-[var(--border-light)]">
            {labels.map(l=>(
              <div key={l.id} className="group flex items-center gap-3 px-4 py-[11px] transition-colors hover:bg-[var(--bg-hover)]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px]" style={{backgroundColor:l.color+"16"}}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:l.color}}/>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-[var(--text)]">{l.name}</span>
                    <span className="mono hidden text-[10.5px] text-[var(--text-faint)] sm:inline">{l.color}</span>
                  </div>
                  {l.description&&<p className="mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">{l.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button onClick={()=>edit(l)} className="ws-icon-btn grid h-7 w-7" title={t("common.edit")}><Pencil size={13}/></button>
                  <button onClick={()=>remove(l.id)} className="ws-icon-btn grid h-7 w-7 hover:!text-red-500" title={t("common.delete")}><Trash2 size={13}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
