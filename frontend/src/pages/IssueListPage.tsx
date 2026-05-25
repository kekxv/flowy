import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, Plus, ChevronRight, X, UserPlus } from "lucide-react";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { listIssues, type IssueData } from "../api/issues";

const STAT = ["open","in_progress","resolved","closed","cancelled","proposed","accepted","rejected"] as const;
const PRIS = ["critical","high","medium","low","trivial"] as const;
const ALL_ROLES = ["project_lead","backend_dev","frontend_dev","tester","ui_designer","devops","clerk","member"];
const timeAgo = (iso: string) => { const d=Date.now()-new Date(iso).getTime(); const m=Math.floor(d/60000); if (m<1) return "just"; if (m<60) return `${m}m`; const h=Math.floor(m/60); if (h<24) return `${h}h`; return `${Math.floor(h/24)}d`; };
const statusL = (s:string) => ({ open:"border-l-[#1a6ff5]", in_progress:"border-l-amber-400", resolved:"border-l-emerald-400", closed:"border-l-[var(--border)]", cancelled:"border-l-red-400" })[s]||"";

export default function IssueListPage() {
  const { t } = useTranslation();
  const [sp] = useSearchParams(); const user = useAuthStore(s=>s.user);
  const [issues, setIssues] = useState<IssueData[]>([]); const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1); const [status, setStatus] = useState(sp.get("status")||"all");
  const [priority, setPriority] = useState(sp.get("priority")||"all"); const [q, setQ] = useState(sp.get("q")||"");
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(()=>{const t=setTimeout(()=>setDebouncedQ(q),350);return()=>clearTimeout(t);},[q]);
  const [labels, setLabels] = useState<Array<{id:string;name:string;color:string}>>([]);
  const [labelId, setLabelId] = useState(sp.get("label_id")||"");
  const [activeTimerIds, setActiveTimerIds] = useState<Set<string>>(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<{issue:IssueData;type:"status"|"priority"}|null>(null);
  const [labelPopup, setLabelPopup] = useState(false);
  const [claimId, setClaimId] = useState<string|null>(null);
  const [claimRoles, setClaimRoles] = useState<string[]>([]);
  const [myRoles, setMyRoles] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickType, setQuickType] = useState("bug");
  const [quickPri, setQuickPri] = useState("medium");
  const [quickSub, setQuickSub] = useState(false);

  const openQuick = () => { setQuickOpen(true); setQuickTitle(q); };

  const doQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    setQuickSub(true);
    try {
      const r = await api.post("/issues", { title: quickTitle, issue_type: quickType, priority: quickPri });
      setQuickOpen(false); setQuickTitle(""); fetch();
      navigate(`/issues/${r.data.id}`);
    } catch (err: any) { showToast(t("common.error","Failed")); }
    setQuickSub(false);
  };

  useEffect(()=>{api.get("/labels").then(r=>setLabels(r.data));},[]);
  // Poll active timers
  useEffect(()=>{const poll=()=>api.get("/dashboard").then(r=>{const ids:Set<string>=new Set((r.data.active_timers||[]).map((t:any)=>t.issue_id as string));setActiveTimerIds(ids);});poll();const i=setInterval(poll,15000);return()=>clearInterval(i);},[]);

  const fetch = () => { setLoading(true); const p: Record<string,string> = {page:String(page),per_page:"20"};
    if (status!=="all") p.status=status; if (priority!=="all") p.priority=priority; if (debouncedQ) p.q=debouncedQ; if (labelId) p.label_id=labelId;
    if (sp.get("reporter")==="me"&&user) p.reporter_id=user.id;
    listIssues(p).then(r=>{setIssues(r.data);setTotal(r.meta.total);setLoading(false);}); };
  useEffect(fetch,[page,status,priority,debouncedQ,labelId]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };
  const doPopup = async (id:string, field:string, value:string) => {
    try {
      await api.put(`/issues/${id}`,{[field]:value}); setPopup(null); fetch();
    } catch (err: any) {
      showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error","Failed"));
      setPopup(null);
    }
  };
  const openClaim = async (issueId: string) => {
    setClaimId(issueId); setClaimRoles([]);
    try { const r = await api.get("/auth/me/project-roles"); setMyRoles(r.data); } catch { setMyRoles(ALL_ROLES); }
  };
  const toggleClaimRole = (r: string) => setClaimRoles(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const doClaim = async () => {
    if (!user || !claimId || claimRoles.length === 0) return;
    try {
      const r = await api.get(`/issues/${claimId}`);
      const current = (r.data.assignees||[]).map((a:any)=>({user_id:a.id,role:a.role}));
      for (const role of claimRoles) {
        if (!current.some((a:any)=>a.user_id===user.id&&a.role===role)) {
          current.push({user_id:user.id,role});
        }
      }
      await api.put(`/issues/${claimId}`,{assignees:current});
      setClaimId(null); setClaimRoles([]); fetch();
    } catch (err: any) { showToast(err?.response?.status === 403 ? t("common.no_permission") : t("common.error","Failed")); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 page-enter">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-[13px] text-red-700 shadow-lg animate-[fadeInUp_.2s_ease-out]">{toast}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">{t("issues.title")}</h1>{total>0&&<p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{total} issues</p>}</div>
        <Link to="/issues/new" className="btn btn-primary"><Plus size={15}/>{t("issues.new_issue")}</Link>
      </div>

      <div className="card rounded-xl p-3 space-y-2.5">
        {/* Search row */}
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
          <input placeholder={t("common.search")} value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} className="w-full rounded-lg border-0 bg-transparent py-1.5 pl-8 pr-2 text-[13px] outline-none"/>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] shrink-0 mr-1">{t("common.status")}</span>
          {STAT.map(s=><button key={s} onClick={()=>{setStatus(status===s?"all":s);setPage(1);}}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${status===s?"status-"+s:""} ${status!=="all"&&status!==s?"opacity-40 hover:opacity-80":"hover:ring-2 hover:ring-offset-1"}`}>{t(`issues.status.${s}`)}</button>)}
        </div>

        {/* Priority row */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] shrink-0 mr-1">{t("common.priority")}</span>
          {PRIS.map(p=><button key={p} onClick={()=>{setPriority(priority===p?"all":p);setPage(1);}}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${priority===p?"priority-"+p:""} ${priority!=="all"&&priority!==p?"opacity-40 hover:opacity-80":"hover:ring-2 hover:ring-offset-1"}`}>{t(`issues.priority.${p}`)}</button>)}
        </div>

        {/* Label row */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] shrink-0 mr-1">{t("common.label")}</span>
          {labels.slice(0, 8).map(l=>(
            <button key={l.id} onClick={()=>{setLabelId(labelId===l.id?"":l.id);setPage(1);}}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                labelId===l.id?"ring-2 ring-offset-1":"hover:ring-2 hover:ring-offset-1 opacity-70 hover:opacity-100"}`}
              style={labelId===l.id?{backgroundColor:l.color+"20",color:l.color}:{}}>{l.name}</button>
          ))}
          {labels.length > 8 && (
            <button onClick={()=>setLabelPopup(true)}
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-all">
              +{labels.length-8} more</button>
          )}
        </div>

        {(status!=="all"||priority!=="all"||labelId) && (
          <button onClick={()=>{setStatus("all");setPriority("all");setLabelId("");}}
            className="text-[11px] text-[var(--primary)] hover:underline self-start">✕ {t("common.clear","Clear filters")}</button>
        )}
      </div>

      {loading ? <div className="flex justify-center pt-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--primary)] border-t-transparent"/></div>
      : issues.length===0 ? <div className="card flex flex-col items-center justify-center py-16 rounded-[var(--radius-lg)]"><div className="mb-3 text-4xl">🔍</div><p className="text-[13px] text-[var(--text-muted)]">{t("issues.no_issues")}</p></div>
      : <div className="card overflow-hidden rounded-[var(--radius-lg)]">
          {issues.map((issue,idx)=>(
            <div key={issue.id} className={`relative group border-l-[3px] ${statusL(issue.status)} ${idx%2?"bg-[var(--bg)]/40":""}`}>
            <Link to={`/issues/${issue.id}`} className="flex items-center gap-3 px-4 py-3 transition-all duration-150 hover:bg-[var(--bg-hover)]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate text-[13px] font-medium group-hover:text-[var(--primary)] transition-colors">
                  {activeTimerIds.has(issue.id) && <span className="flex h-1.5 w-1.5 shrink-0"><span className="absolute h-1.5 w-1.5 animate-ping rounded-full bg-red-400 opacity-75"/><span className="relative h-1.5 w-1.5 rounded-full bg-red-500"/></span>}
                  <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${(issue as any).issue_type==="feature"?"bg-violet-50 text-violet-600":"bg-amber-50 text-amber-600"}`}>{t(`issues.type.${(issue as any).issue_type||"bug"}`)}</span>
                  <span className="truncate">{issue.title}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
                  <span className="font-mono text-[var(--text-muted)]/70">#{issue.id.slice(0,8)}</span>
                  <span>{issue.reporter?.display_name||issue.reporter?.username}</span>
                  <span>{timeAgo(issue.created_at)}</span>
                  {(issue as any).assignees?.length>0 && <><span className="hidden sm:inline text-[var(--border)]">·</span><span className="hidden sm:flex items-center gap-1">
                    {(issue as any).assignees.slice(0,3).map((a:any)=><span key={`${a.id}-${a.role}`} className={`role-badge role-${a.role}`}>{a.display_name||a.username}</span>)}
                    {(issue as any).assignees.length>3 && <span className="text-[var(--text-muted)]">+{(issue as any).assignees.length-3}</span>}
                  </span></>}
                  {issue.labels?.slice(0,2).map((l:any)=><span key={l.id} className="shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium" style={{backgroundColor:l.color+"14",color:l.color,borderColor:l.color+"30"}}>{l.name}</span>)}
                </div>
              </div>
              <button onClick={e=>{e.stopPropagation();e.preventDefault();setPopup({issue,type:"priority"});}}
                className={`priority-${issue.priority} rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-transform hover:scale-105`}>{t(`issues.priority.${issue.priority}`)}</button>
              <button onClick={e=>{e.stopPropagation();e.preventDefault();setPopup({issue,type:"status"});}}
                className={`status-${issue.status} cursor-pointer transition-transform duration-150 hover:scale-105`}>{t(`issues.status.${issue.status}`)}</button>
              <button onClick={e=>{e.stopPropagation();e.preventDefault();openClaim(issue.id);}}
                className="hidden sm:flex rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--primary-light)] hover:text-[var(--primary)] transition-all opacity-0 group-hover:opacity-100">
                <UserPlus size={13}/>
              </button>
              <ChevronRight size={14} className="hidden sm:block shrink-0 text-[var(--text-muted)]/30 transition-all duration-150 group-hover:text-[var(--text-muted)]/60 group-hover:translate-x-0.5" />
            </Link>
            </div>
          ))}
        </div>}

      {total>20 && <div className="flex items-center justify-between">
        <span className="text-[12px] text-[var(--text-muted)]">{(page-1)*20+1}–{Math.min(page*20,total)} of {total}</span>
        <div className="flex gap-1">
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1} className="btn btn-outline btn-sm disabled:opacity-30">Prev</button>
          <button onClick={()=>setPage(p=>p+1)} disabled={page>=Math.ceil(total/20)} className="btn btn-outline btn-sm disabled:opacity-30">Next</button>
        </div>
      </div>}

      {/* Label popup */}
      {labelPopup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-sm sm:items-center" onClick={()=>setLabelPopup(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-2xl animate-[fadeInUp_.2s_ease-out] sm:rounded-2xl" onClick={e=>e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("common.labels")}</h3>
              <button onClick={()=>setLabelPopup(false)} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={16}/></button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto">
              {labels.map(l=>{
                const active = labelId===l.id;
                return <button key={l.id} onClick={()=>{setLabelId(active?"":l.id);setPage(1);setLabelPopup(false);}}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                    active?"ring-2 ring-offset-1":"hover:ring-2 hover:ring-offset-1"}`}
                  style={active?{backgroundColor:l.color+"20",color:l.color}:{color:"var(--text-secondary)",border:"1px solid var(--border)"}}>
                  <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{backgroundColor:l.color}}/>{l.name}
                </button>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Status/Priority popup modal */}
      {popup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 backdrop-blur-sm sm:items-center" onClick={()=>setPopup(null)}>
          <div className="w-full max-w-xs rounded-t-2xl bg-white p-5 shadow-2xl animate-[fadeInUp_.2s_ease-out] sm:rounded-2xl" onClick={e=>e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{popup.type==="status"?t("common.status"):t("common.priority")}</h3>
              <button onClick={()=>setPopup(null)} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={16}/></button>
            </div>
            <div className="space-y-1">
              {(popup.type==="status"?STAT:PRIS).map((v:any)=>{
                const current = popup.type==="status"?popup.issue.status:popup.issue.priority;
                const isActive = v===current;
                return <button key={v} onClick={()=>doPopup(popup.issue.id, popup.type, v)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-all hover:bg-[var(--bg-hover)] active:scale-[.98] ${
                    isActive?"bg-[var(--primary-light)] text-[var(--primary)] ring-1 ring-[var(--primary)]/20":""}`}>
                  <span className={popup.type==="status"?`status-${v}`:`priority-${v} rounded-[6px] px-2 py-0.5`}>{popup.type==="status"?t(`issues.status.${v}`):t(`issues.priority.${v}`)}</span>
                  {isActive && <span className="ml-auto text-[var(--primary)] text-xs font-semibold">✓ {t("common.current","current")}</span>}
                </button>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Claim role modal */}
      {claimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => { setClaimId(null); setClaimRoles([]); }}>
          <div className="card w-72 rounded-xl p-5 shadow-[var(--shadow-lg)] animate-[fadeInUp_.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("roles.title")}</h3>
              <button onClick={() => { setClaimId(null); setClaimRoles([]); }} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={16}/></button>
            </div>
            <div className="space-y-0.5 mb-4">
              {myRoles.map(r => (
                <label key={r}
                  className={`flex items-center gap-2 rounded-md px-2 py-2 text-[12px] cursor-pointer transition-colors ${
                    claimRoles.includes(r) ? "bg-[var(--primary-light)] text-[var(--primary)] font-medium" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  }`}>
                  <input type="checkbox" checked={claimRoles.includes(r)}
                    onChange={() => toggleClaimRole(r)}
                    className="rounded accent-[var(--primary)]"/>
                  <span className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>
                </label>
              ))}
            </div>
            <button onClick={doClaim} disabled={claimRoles.length===0}
              className="btn btn-primary btn-sm w-full">{t("common.confirm")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
