import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Edit3, Plus, X, Check, Play, Square, ChevronDown, ExternalLink, Link2, Globe, Code2, Search, Unlink, RefreshCw, AlertCircle, GitPullRequest, CheckCircle2, UserPlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { listExternalLinks, linkExternalIssue, unlinkExternalIssue, refreshExternalLink, createExternalIssue, listConnections, listConnectionRepos, searchExternalIssues, type ExternalLink as ExtLink, type ConnectionData, type ExternalRepo, type ExternalIssueResult } from "../api/connections";

const STAT=["open","in_progress","resolved","closed","cancelled"], PRIS=["critical","high","medium","low","trivial"];
const ROLES=["project_lead","backend_dev","frontend_dev","tester","ui_designer","devops","clerk","member"];

export default function IssueDetailPage() {
  const {id}=useParams<{id:string}>(); const {t}=useTranslation();
  const [issue,setIssue]=useState<any>(null); const [loading,setLoading]=useState(true);
  const [errMsg, setErrMsg] = useState("");

  const showErr = (err: any, fallback: string) => {
    const msg = err?.response?.status === 403
      ? t("common.no_permission","No permission")
      : (err?.response?.data?.detail || err?.message || fallback);
    setErrMsg(msg); setTimeout(() => setErrMsg(""), 3000);
  };
  const [comment,setComment]=useState(""); const [sub,setSub]=useState(false);
  const [milestones,setMilestones]=useState<Array<{id:string;name:string}>>([]);
  const [labels,setLabels]=useState<Array<{id:string;name:string;color:string}>>([]);
  const [users,setUsers]=useState<Array<{id:string;username:string;display_name:string}>>([]);
  const [comments,setComments]=useState<Array<any>>([]); const [replyTo,setReplyTo]=useState<string|null>(null);
  const [activityLogs,setActivityLogs]=useState<Array<any>>([]);
  const [es,setEs]=useState(false); const [ep,setEp]=useState(false);
  const [modal,setModal]=useState<"milestone"|"label"|"role"|"link"|null>(null); const [sr,setSr]=useState("");
  // External links
  const [extLinks,setExtLinks]=useState<ExtLink[]>([]);
  const [conns,setConns]=useState<ConnectionData[]>([]);
  const [linkRepos,setLinkRepos]=useState<ExternalRepo[]>([]);
  const [linkSearchResults,setLinkSearchResults]=useState<ExternalIssueResult[]>([]);
  const [linkConnId,setLinkConnId]=useState("");
  const [linkRepo,setLinkRepo]=useState("");
  const [linkQuery,setLinkQuery]=useState("");
  const [linkSearching,setLinkSearching]=useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimRoles, setClaimRoles] = useState<string[]>([]);
  const [myRoles, setMyRoles] = useState<string[]>([]);
  const ALL_ROLES = ["project_lead","backend_dev","frontend_dev","tester","ui_designer","devops","clerk","member"];
  const flx=async()=>{if(!id)return;try{const r=await listExternalLinks(id);setExtLinks(r);}catch{}};
  useEffect(()=>{flx();},[id]);

  const fi=async()=>{if(!id)return;setLoading(true);const r=await api.get(`/issues/${id}`);setIssue(r.data);setLoading(false);};
  const fc=async()=>{if(!id)return;try{const r=await api.get(`/issues/${id}/comments`);setComments(r.data);}catch{}};
  const fl=async()=>{if(!id)return;try{const r=await api.get(`/issues/${id}/assignee-logs`);setActivityLogs(r.data);}catch{}};
  useEffect(()=>{fi();fc();fl();},[id]);
  useEffect(()=>{api.get("/milestones").then(r=>setMilestones(r.data));api.get("/labels").then(r=>setLabels(r.data));api.get("/users").then(r=>setUsers(r.data));listConnections().then(setConns).catch(()=>{});},[]);

  const qu=async(f:string,v:any)=>{if(!id)return;setIssue((prev:any)=>({...prev,[f]:v}));
    try { await api.put(`/issues/${id}`,{[f]:v});fl(); } catch(err:any) { showErr(err,"Update failed"); fi(); }};
  const hc=async(e:React.FormEvent)=>{e.preventDefault();if(!comment.trim()||!id)return;setSub(true);
    const b:any={body:comment};if(replyTo)b.parent_id=replyTo;await api.post(`/issues/${id}/comments`,b);setComment("");setReplyTo(null);setSub(false);fc();};
  const tl=async(lid:string)=>{const ids=(issue.labels||[]).map((l:any)=>l.id);const next=ids.includes(lid)?ids.filter((x:string)=>x!==lid):[...ids,lid];
    try{await api.put(`/issues/${id}`,{label_ids:next});fi();fl();setModal(null);}catch(err:any){showErr(err,"Label update failed");}};
  const tm=async(mid:string)=>{const ids=[...(issue.milestone_ids||[])];const next=ids.includes(mid)?ids.filter((x:string)=>x!==mid):[...ids,mid];
    setIssue((prev:any)=>({...prev,milestone_ids:next}));
    try{await api.put(`/issues/${id}`,{milestone_ids:next});fl();}catch(err:any){showErr(err,"Milestone update failed");fi();}};
  const ar=async(uid:string,role:string)=>{const c=(issue.assignees||[]).map((a:any)=>({user_id:a.id,role:a.role}));
    const next=c.some((a:any)=>a.user_id===uid&&a.role===role)?c.filter((a:any)=>!(a.user_id===uid&&a.role===role)):[...c,{user_id:uid,role}];
    try{await api.put(`/issues/${id}`,{assignees:next});fi();fl();setModal(null);}catch(err:any){showErr(err,"Assignee update failed");}};
  const ra=async(uid:string,role:string)=>{const next=(issue.assignees||[]).filter((a:any)=>!(a.id===uid&&a.role===role)).map((a:any)=>({user_id:a.id,role:a.role}));
    try{await api.put(`/issues/${id}`,{assignees:next});fi();fl();}catch(err:any){showErr(err,"Assignee update failed");}};
  const curUser = useAuthStore(s=>s.user);
  const isAdmin = curUser?.role === "admin";
  const isLead = (issue?.assignees||[]).some((a:any)=>a.role==="project_lead" && a.id===curUser?.id);
  const isReporter = issue?.reporter?.id === curUser?.id;
  const canEdit = isAdmin || isLead || isReporter;
  const canFullEdit = isAdmin || isLead;
  const mls=issue?.milestone_ids||[];

  // External link handlers
  const openLinkModal=async()=>{setLinkMode("browse");setLinkConnId("");setLinkRepo("");setLinkQuery("");setLinkSearchResults([]);setCreateTitle("");setCreateBody("");setLinkRepos([]);
    try{const c=await listConnections();setConns(c);if(c.length>0){loadRepos(c[0].id);}}catch{};setModal("link");};
  const loadRepos=async(cid:string)=>{setLinkConnId(cid);setLinkRepo("");setLinkQuery("");setLinkSearchResults([]);setLinkRepos([]);try{const r=await listConnectionRepos(cid);setLinkRepos(r);}catch{}};
  const selectRepo=async(repo:string)=>{setLinkRepo(repo);setLinkSearchResults([]);setLinkMode("browse");if(!repo)return;setLinkSearching(true);try{const r=await searchExternalIssues(linkConnId,repo,linkQuery);setLinkSearchResults(r);}catch{}finally{setLinkSearching(false);}};
  const searchIssues=async()=>{if(!linkRepo)return;setLinkSearching(true);try{const r=await searchExternalIssues(linkConnId,linkRepo,linkQuery);setLinkSearchResults(r);}catch{}finally{setLinkSearching(false);}};
  const [linkMode,setLinkMode]=useState<"browse"|"create">("browse");
  const [createTitle,setCreateTitle]=useState("");
  const [createBody,setCreateBody]=useState("");
  const doCreateAndLink=async()=>{if(!id||!linkRepo||!createTitle.trim())return;
    try{const r=await createExternalIssue(linkConnId,{repo:linkRepo,title:createTitle,body:createBody});await linkExternalIssue(id,{connection_id:linkConnId,external_repo:linkRepo,external_id:r.external_id,external_url:r.external_url,title:r.title,status:r.status});flx();setModal(null);setCreateTitle("");setCreateBody("");setLinkMode("browse");}catch{}};
  const doLink=async(extId:string,extUrl:string,title?:string,status?:string,linkType?:string)=>{if(!id||!linkRepo)return;
    try{await linkExternalIssue(id,{connection_id:linkConnId,external_repo:linkRepo,external_id:extId,external_url:extUrl,title,status,link_type:linkType||"issue"});flx();setModal(null);}catch{}};
  const doUnlink=async(lid:string)=>{if(!confirm("Remove this link?"))return;try{await unlinkExternalIssue(id!,lid);flx();}catch{}};
  const doRefresh=async(lid:string)=>{try{await refreshExternalLink(id!,lid);flx();}catch{}};
  // Claim
  const openClaim = async () => { setClaimOpen(true); setClaimRoles([]);
    try { const r = await api.get("/auth/me/project-roles"); setMyRoles(r.data); } catch { setMyRoles(ALL_ROLES); }
  };
  const toggleClaimRole = (r: string) => setClaimRoles(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const doClaim = async () => {
    if (!curUser || !id || claimRoles.length === 0) return;
    try {
      const current = (issue.assignees||[]).map((a:any)=>({user_id:a.id,role:a.role}));
      for (const role of claimRoles) {
        if (!current.some((a:any)=>a.user_id===curUser.id&&a.role===role)) current.push({user_id:curUser.id,role});
      }
      await api.put(`/issues/${id}`,{assignees:current});
      setClaimOpen(false); setClaimRoles([]); fi();
    } catch (err: any) { showErr(err, "Claim failed"); }
  };

  if(loading)return <div className="flex justify-center pt-24"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--primary)] border-t-transparent"/></div>;
  if(!issue)return <div className="text-center pt-24 text-[var(--text-muted)]">Not found.</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-4 page-enter">
      {/* Error toast */}
      {errMsg && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-[13px] text-red-700 shadow-lg animate-[fadeInUp_.2s_ease-out]">{errMsg}</div>}

      {/* Top nav */}
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/issues" className="btn btn-ghost btn-sm"><ArrowLeft size={14}/>{t("common.back")}</Link>
        {canFullEdit && <Link to={`/issues/${issue.id}/edit`} className="btn btn-outline btn-sm"><Edit3 size={12}/>{t("common.edit")}</Link>}
        <button onClick={openClaim} className="btn btn-outline btn-sm"><UserPlus size={12} className="mr-1"/>{t("roles.title","Claim")}</button>
      </div>

      {/* Main card */}
      <div className="card rounded-xl">
        {/* Header */}
        <div className="border-b border-[var(--border-light)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h1 className="text-lg font-bold tracking-tight">{issue.title}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[12px] text-[var(--text-muted)]">
                <span className="font-mono">#{issue.id.slice(0,8)}</span>
                <span>{issue.reporter?.display_name||issue.reporter?.username}</span>
                <span>{new Date(issue.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {/* Status */}
              <div className="relative">
                {canFullEdit ? (
                  <button onClick={()=>setEs(!es)} className={`status-${issue.status} cursor-pointer transition-transform hover:scale-105`}>
                    {t(`issues.status.${issue.status}`)} <ChevronDown size={10} className="ml-0.5 inline opacity-50"/></button>
                ) : (
                  <span className={`status-${issue.status}`}>{t(`issues.status.${issue.status}`)}</span>
                )}
                {canFullEdit && es && <div className="absolute right-0 top-full z-10 mt-2 w-40 rounded-xl border border-[var(--border)] bg-white py-1.5 shadow-[var(--shadow-lg)] ring-1 ring-black/5 animate-[fadeInUp_.12s_ease-out] overflow-hidden">{STAT.map(s=>
                  <button key={s} onClick={()=>{qu("status",s);setEs(false);}} className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[var(--bg-hover)] ${s===issue.status?"font-semibold text-[var(--primary)] bg-[var(--primary-light)]":""}`}>
                    <span className={`status-${s}`} style={{fontSize:11}}>{t(`issues.status.${s}`)}</span>
                    {s===issue.status&&<span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--primary)]"/>}
                  </button>)}</div>}
              </div>
              {/* Priority */}
              <div className="relative">
                {canFullEdit ? (
                  <button onClick={()=>setEp(!ep)} className={`priority-${issue.priority} rounded-md px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-transform hover:scale-105`}>
                    {t(`issues.priority.${issue.priority}`)} <ChevronDown size={10} className="ml-0.5 inline opacity-50"/></button>
                ) : (
                  <span className={`priority-${issue.priority} rounded-md px-2 py-0.5 text-[11px] font-medium`}>{t(`issues.priority.${issue.priority}`)}</span>
                )}
                {canFullEdit && ep && <div className="absolute right-0 top-full z-10 mt-2 w-34 rounded-xl border border-[var(--border)] bg-white py-1.5 shadow-[var(--shadow-lg)] ring-1 ring-black/5 animate-[fadeInUp_.12s_ease-out] overflow-hidden">{PRIS.map(p=>
                  <button key={p} onClick={()=>{qu("priority",p);setEp(false);}} className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[var(--bg-hover)] ${p===issue.priority?"font-semibold text-[var(--primary)] bg-[var(--primary-light)]":""}`}>
                    <span className={`priority-${p} w-1.5 h-1.5 rounded-full`} style={{display:"inline-block"}}/>
                    {t(`issues.priority.${p}`)}
                    {p===issue.priority&&<span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--primary)]"/>}
                  </button>)}</div>}
              </div>
            </div>
          </div>

          {/* Labels bar */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(issue.labels||[]).map((l:any)=>
              canFullEdit
                ? <button key={l.id} onClick={()=>tl(l.id)} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium hover:opacity-80 transition-opacity" style={{backgroundColor:l.color+"14",color:l.color,borderColor:l.color+"30"}}>{l.name} <X size={9}/></button>
                : <span key={l.id} className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{backgroundColor:l.color+"14",color:l.color,borderColor:l.color+"30"}}>{l.name}</span>
            )}
            {canFullEdit && <button onClick={()=>setModal("label")} className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all">
              <Plus size={10}/> {t("common.label")}</button>}
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Assignees */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(issue.assignees||[]).map((a:any)=><span key={`${a.id}-${a.role}`} className={`role-badge role-${a.role} border border-[var(--border-light)]`}>
              {a.display_name||a.username}<span className="opacity-60 ml-0.5">·{t(`roles.${a.role}`)}</span>
              {canFullEdit && <button onClick={()=>ra(a.id,a.role)} className="ml-0.5 rounded-full p-0.5 hover:bg-red-100 transition-colors"><X size={9}/></button>}</span>)}
            {canFullEdit && <button onClick={()=>{setSr("");setModal("role");}} className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all"><Plus size={10}/> {t("roles.role")}</button>}
          </div>

          {/* Milestones + Timer */}
          <div className="flex flex-wrap items-center gap-2">
            {canFullEdit && <TimerW issueId={issue.id}/>}
            {mls.map((mid:string)=>{const m=milestones.find(x=>x.id===mid);return canFullEdit
              ? <button key={mid} onClick={()=>tm(mid)} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-100 transition-colors">{m?.name||mid}<X size={9}/></button>
              : <span key={mid} className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">{m?.name||mid}</span>;})}
            {canFullEdit && <button onClick={()=>setModal("milestone")} className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all"><Plus size={10}/> {t("issues.milestone")}</button>}
          </div>

          {/* Description */}
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("common.description")}</h3>
            <div className="rounded-lg bg-[var(--bg)] p-4 text-[13px] leading-relaxed text-[var(--text-secondary)] prose prose-sm max-w-none">
              <ReactMarkdown>{issue.description||"—"}</ReactMarkdown></div>
          </div>
        </div>
      </div>

      {/* External Links */}
      <div className="card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("external.linked_issues","Linked Issues")} ({extLinks.length})</h3>
          {canFullEdit && <button onClick={openLinkModal} disabled={conns.length===0}
            className="btn btn-outline btn-sm" title={conns.length===0?"No connected accounts":""}><Link2 size={12} className="mr-1"/>{t("external.link_issue","Link Issue")}</button>}
        </div>
        {extLinks.length===0?<p className="text-[12px] text-[var(--text-muted)] py-2">{t("common.no_data")}</p>
        :<div className="space-y-1.5">{extLinks.map(l=>{
          const isPR = l.link_type === "pull_request";
          const isMerged = l.status === "merged";
          return (
          <div key={l.id} className="group flex items-center justify-between rounded-lg border border-[var(--border-light)] px-3 py-2.5 hover:bg-[var(--bg-hover)] transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              {isPR ? <GitPullRequest size={14} className={`shrink-0 ${isMerged?"text-violet-500":"text-cyan-500"}`}/>
                : <AlertCircle size={14} className={`shrink-0 ${l.status==="closed"?"text-red-400":"text-emerald-500"}`}/>}
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate">{l.title||l.external_id}</div>
                <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                  <span className="font-mono">{l.external_repo}</span>
                  <span>#{l.external_id}</span>
                  {isPR && <span className="rounded-full bg-cyan-50 px-1.5 py-0.5 text-[9px] font-medium text-cyan-600">PR</span>}
                  {l.status&&<span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${isMerged?"bg-violet-50 text-violet-600":l.status==="closed"?"bg-red-50 text-red-600":"bg-emerald-50 text-emerald-600"}`}>{l.status}</span>}
                  {l.last_synced_at&&<span className="text-[9px] opacity-50">synced {new Date(l.last_synced_at).toLocaleTimeString()}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {canFullEdit && <button onClick={()=>doRefresh(l.id)} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" title="Sync status"><RefreshCw size={12}/></button>}
              <a href={l.external_url} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><ExternalLink size={12}/></a>
              {canFullEdit && <button onClick={()=>doUnlink(l.id)} className="rounded p-1 text-[var(--text-muted)] hover:bg-red-50 hover:text-red-500"><Unlink size={12}/></button>}
            </div>
          </div>)})}</div>
        }
      </div>

      {/* Activity log */}
      {activityLogs.length>0 && <div className="card rounded-xl p-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("activity.title","Activity")}</h3>
        <div className="max-h-40 space-y-0.5 overflow-y-auto">{activityLogs.slice(0,10).map((l:any)=>(
          <div key={l.id} className="flex items-center gap-2 text-[11px]">
            {/* Action badge */}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              l.raw_action==="status_changed"?"bg-blue-50 text-blue-700":
              l.raw_action==="priority_changed"?"bg-amber-50 text-amber-700":
              l.raw_action==="milestone_added"?"bg-violet-50 text-violet-700":
              l.raw_action==="milestone_removed"?"bg-violet-50 text-violet-700":
              l.raw_action==="label_added"?"bg-cyan-50 text-cyan-700":
              l.raw_action==="label_removed"?"bg-cyan-50 text-cyan-700":
              l.raw_action==="timer_started"?"bg-emerald-50 text-emerald-700":
              l.raw_action==="timer_stopped"?"bg-orange-50 text-orange-700":
              l.raw_action==="added"?"bg-emerald-50 text-emerald-700":
              l.raw_action==="removed"?"bg-red-50 text-red-700":
              "bg-gray-50 text-gray-600"}`}>
              {l.raw_action==="status_changed"?t(`issues.status.${l.role}`):
               l.raw_action==="priority_changed"?t(`issues.priority.${l.role}`):
               l.raw_action==="added"?`+ ${t(`roles.${l.role}`)}`:
               l.raw_action==="removed"?`− ${t(`roles.${l.role}`)}`:
               l.action}</span>
            {/* Content */}
            <span className="text-[var(--text-muted)]">
              {l.raw_action==="added"||l.raw_action==="removed"?l.user_name:l.changed_by_name}
            </span>
            <span className="ml-auto text-[var(--text-muted)]/50">{new Date(l.created_at).toLocaleTimeString()}</span></div>))}</div>
      </div>}

      {/* Comments */}
      <div className="card rounded-xl p-5 space-y-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t("issues.comments")} ({comments.length})</h3>
        {comments.map((c:any)=><Cm key={c.id} c={c} issueId={issue.id} roles={(issue.assignees||[]).filter((a:any)=>a.id===c.author?.id).map((a:any)=>a.role)} canEdit={canFullEdit} onReply={setReplyTo} onRefresh={fc} t={t}/>)}
        {replyTo&&<div className="ml-8 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] text-blue-600">{t("comment.replying","Replying")} <button onClick={()=>setReplyTo(null)} className="ml-2 hover:text-blue-800 font-medium">✕</button></div>}
        <form onSubmit={hc} className="space-y-2">
          <textarea rows={3} value={comment} onChange={e=>setComment(e.target.value)} placeholder={t("issues.write_comment")} className="input resize-none"/>
          <button type="submit" disabled={sub||!comment.trim()} className="btn btn-primary btn-sm">{t("issues.comment")}</button>
        </form>
      </div>

      {modal&&modal!=="link"&&<Modal onClose={()=>setModal(null)} wide={modal==="role"} title={modal==="milestone"?t("issues.milestone"):modal==="label"?t("common.labels"):t("roles.title")}>
        {modal==="milestone"&&<div className="max-h-60 space-y-1 overflow-y-auto">{milestones.map(m=>{const a=mls.includes(m.id);return <button key={m.id} onClick={()=>tm(m.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${a?"bg-violet-50 text-violet-700":"hover:bg-[var(--bg-hover)]"}`}>{m.name}{a&&<Check size={14}/>}</button>})}</div>}
        {modal==="label"&&<div className="max-h-60 space-y-1 overflow-y-auto">{labels.map(l=>{const a=(issue.labels||[]).some((il:any)=>il.id===l.id);return <button key={l.id} onClick={()=>tl(l.id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${a?"bg-[var(--primary-light)] text-[var(--primary)]":"hover:bg-[var(--bg-hover)]"}`}><span className="h-3 w-3 rounded-full" style={{backgroundColor:l.color}}/>{l.name}{a&&<Check size={14} className="ml-auto"/>}</button>})}</div>}
        {modal==="role"&&(
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {ROLES.map(r=>{
              const assigned = (issue.assignees||[]).filter((a:any)=>a.role===r);
              return (
                <div key={r} className="rounded-xl border border-[var(--border-light)] overflow-hidden">
                  <button onClick={()=>setSr(sr===r?"":r)}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${sr===r?"bg-[var(--bg-muted)]":""}`}>
                    <div className="flex items-center gap-2.5">
                      <span className={`role-badge role-${r} rounded-md px-2 py-0.5 text-[11px] font-medium`}>{t(`roles.${r}`)}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {assigned.length>0 ? assigned.map((a:any)=><span key={a.id} className="mr-1">{a.display_name||a.username}</span>) : <span className="italic opacity-50">{t("common.none","none")}</span>}
                      </span>
                    </div>
                    <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${sr===r?"rotate-180":""}`}/>
                  </button>
                  {sr===r && (
                    <div className="border-t border-[var(--border-light)] px-3 py-2 bg-[var(--bg)]">
                      <div className="grid grid-cols-2 gap-1">
                        {users.map(u=>{
                          const isAssigned = assigned.some((a:any)=>a.id===u.id);
                          return (
                            <button key={u.id} onClick={()=>ar(u.id,r)}
                              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-colors ${isAssigned?"bg-emerald-50 text-emerald-700 font-medium":"hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"}`}>
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[9px] font-semibold text-[var(--primary)] shrink-0">
                                {(u.display_name||u.username).slice(0,1).toUpperCase()}
                              </div>
                              <span className="truncate">{u.display_name||u.username}</span>
                              {isAssigned && <Check size={12} className="text-emerald-500 shrink-0 ml-auto"/>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>}

      {/* Link external issue modal */}
      {/* Claim role modal */}
      {claimOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => { setClaimOpen(false); setClaimRoles([]); }}>
          <div className="card w-72 rounded-xl p-5 shadow-[var(--shadow-lg)] animate-[fadeInUp_.2s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("roles.title","Project Roles")}</h3>
              <button onClick={() => { setClaimOpen(false); setClaimRoles([]); }} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={16}/></button>
            </div>
            <div className="space-y-0.5 mb-4">
              {myRoles.map((r: string) => (
                <label key={r}
                  className={`flex items-center gap-2 rounded-md px-2 py-2 text-[12px] cursor-pointer transition-colors ${
                    claimRoles.includes(r) ? "bg-[var(--primary-light)] text-[var(--primary)] font-medium" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                  }`}>
                  <input type="checkbox" checked={claimRoles.includes(r)} onChange={() => toggleClaimRole(r)} className="rounded accent-[var(--primary)]"/>
                  <span className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>
                </label>
              ))}
            </div>
            <button onClick={doClaim} disabled={claimRoles.length===0} className="btn btn-primary btn-sm w-full">{t("common.confirm")}</button>
          </div>
        </div>
      )}

      {modal==="link"&&<Modal onClose={()=>{setModal(null);setCreateTitle("");setCreateBody("");}} title={t("external.link_issue","Link External Issue")} wide>
        <div className="space-y-4">
          {conns.length===0?(
            <div className="flex flex-col items-center py-8 text-[var(--text-muted)]">
              <Globe size={32} className="mb-2 opacity-20"/>
              <p className="text-[13px]">{t("settings.no_connections","No connections")}</p>
              <p className="text-[11px] mt-0.5">{t("settings.connect_hint","Connect GitHub or Gitea to link external issues.")}</p>
            </div>
          ):<>
            {/* Account selector - segmented control */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">Account</label>
              <div className="flex rounded-lg bg-[var(--bg-muted)] p-0.5">{conns.map(c=>(
                <button key={c.id} onClick={()=>loadRepos(c.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all ${
                    linkConnId===c.id
                      ? "bg-white text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}>
                  {c.provider==="github"?<Code2 size={12}/>:<Globe size={12}/>}
                  {c.provider==="github"?"GitHub":"Gitea"}
                </button>
              ))}</div>
            </div>

            {/* Repo selector */}
            {linkRepos.length>0 && (
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5 block">Repository</label>
                <select value={linkRepo} onChange={e=>selectRepo(e.target.value)}
                  className="input text-xs w-full">
                  <option value="">{t("issues.select_repo","Select repo...")}</option>
                  {linkRepos.map(r=><option key={r.full_name} value={r.full_name}>{r.name||r.full_name}</option>)}
                </select>
              </div>
            )}

            {/* Browse or Create (mutually exclusive) */}
            {linkRepo && linkMode==="browse" && <>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"/>
                <input value={linkQuery} onChange={e=>setLinkQuery(e.target.value)} placeholder={t("common.search")+"..."}
                  className="input text-xs w-full" style={{paddingLeft:"34px"}} onKeyDown={e=>{if(e.key==="Enter")searchIssues();}}/>
              </div>
              {linkSearching ? (
                <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"/></div>
              ) : linkSearchResults.length>0 ? (
                <div className="max-h-52 space-y-1 overflow-y-auto -mx-1 px-1">
                  {linkSearchResults.map(r=>{
                    const isPR = r.link_type === "pull_request";
                    const isMerged = r.status === "merged";
                    return (
                    <button key={r.external_id} onClick={()=>doLink(r.external_id,r.external_url,r.title,r.status,r.link_type)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left border border-[var(--border-light)] hover:border-[var(--primary)]/30 hover:bg-[var(--primary-light)] transition-all group">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        isMerged ? "bg-violet-50" : isPR ? "bg-cyan-50" : r.status==="closed" ? "bg-red-50" : "bg-emerald-50"}`}>
                        {isPR ? <GitPullRequest size={14} className={isMerged?"text-violet-500":"text-cyan-500"}/>
                          : r.status==="closed" ? <CheckCircle2 size={14} className="text-red-500"/> : <AlertCircle size={14} className="text-emerald-500"/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate">{r.title}</div>
                        <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono">#{r.external_id}</span>
                          {isPR && <span className="rounded-full bg-cyan-50 px-1.5 py-0.5 text-[9px] font-medium text-cyan-600">PR</span>}
                          {r.status && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${isMerged?"bg-violet-50 text-violet-600":r.status==="closed"?"bg-red-50 text-red-600":"bg-emerald-50 text-emerald-600"}`}>{r.status}</span>}
                          {r.labels?.slice(0,2).map((lb:string)=>(
                            <span key={lb} className="rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">{lb}</span>
                          ))}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-lg bg-[var(--primary)] px-2.5 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">Link</span>
                    </button>
                  )})}
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 text-[var(--text-muted)]">
                  <Search size={20} className="mb-1.5 opacity-20"/>
                  <p className="text-[11px]">No issues found</p>
                </div>
              )}
              <div className="border-t border-[var(--border-light)] pt-2.5">
                <button onClick={()=>setLinkMode("create")}
                  className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--primary)] transition-colors">
                  <Plus size={13}/> {t("issues.create_external","Create New Issue")}
                </button>
              </div>
            </>}

            {linkRepo && linkMode==="create" && <>
              <button onClick={()=>{setLinkMode("browse");setCreateTitle("");setCreateBody("");}}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors mb-2">&larr; {t("common.back")} to browse</button>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                {t("issues.create_external","Create in")} {linkRepo.split("/")[0]}
              </p>
              <input value={createTitle} onChange={e=>setCreateTitle(e.target.value)} placeholder={t("common.title")+" *"}
                className="input text-xs mb-2 w-full"/>
              <textarea rows={3} value={createBody} onChange={e=>setCreateBody(e.target.value)} placeholder={t("common.description")+" ("+t("common.optional")+")"}
                className="input text-xs mb-3 w-full resize-none"/>
              <button onClick={doCreateAndLink} disabled={!createTitle.trim()}
                className="btn btn-primary btn-sm w-full">{t("common.create")} & {t("external.link_issue","Link")}</button>
            </>}

            {/* No repo selected prompt */}
            {!linkRepo && linkRepos.length>0 && (
              <div className="flex flex-col items-center py-10 text-[var(--text-muted)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-muted)] mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"/></svg>
                </div>
                <p className="text-[12px] font-medium mb-0.5">Choose a repository</p>
                <p className="text-[10px]">Select a repo above to browse its issues</p>
              </div>
            )}

            {/* Loading repos */}
            {linkRepos.length===0 && linkConnId && (
              <div className="flex flex-col items-center py-8 text-[var(--text-muted)]">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent mb-2"/>
                <p className="text-[11px]">Loading repositories...</p>
              </div>
            )}
            {/* No account selected yet */}
            {!linkConnId && (
              <div className="flex flex-col items-center py-10 text-[var(--text-muted)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-muted)] mb-3">
                  <Globe size={20} className="opacity-30"/>
                </div>
                <p className="text-[12px] font-medium mb-0.5">Select an account</p>
                <p className="text-[10px]">Choose a connected account above to get started</p>
              </div>
            )}
          </>}
        </div>
      </Modal>}
    </div>
  );
}

function Modal({children,onClose,title,wide}:{children:React.ReactNode;onClose:()=>void;title:string;wide?:boolean}){
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
    <div className={`card rounded-xl p-5 shadow-[var(--shadow-lg)] animate-[fadeInUp_.2s_ease-out] ${wide?"w-[480px]":"w-80"}`} onClick={e=>e.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">{title}</h3><button onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={16}/></button></div>
      {children}</div></div>;}

function TimerW({issueId}:{issueId:string}){
  const[running,setRunning]=useState(false);const[e,setE]=useState(0);const[intv]=useState<{c:any}>({c:null});
  const ft=async()=>{try{const r=await api.get(`/issues/${issueId}/timer/status`);setRunning(r.data.is_running);if(r.data.is_running)setE(r.data.duration_ms);}catch{}};
  useEffect(()=>{ft();return()=>clearInterval(intv.c);},[issueId]);
  useEffect(()=>{if(running){intv.c=setInterval(()=>setE((e:number)=>e+1000),1000);}else clearInterval(intv.c);return()=>clearInterval(intv.c);},[running]);
  const tt=async()=>{running?await api.post(`/issues/${issueId}/timer/stop`):await api.post(`/issues/${issueId}/timer/start`);setRunning(!running);};
  const h=Math.floor(e/3600000),m=Math.floor((e%3600000)/60000),s=Math.floor((e%60000)/1000);
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5">
    <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">{String(h).padStart(2,"0")}:{String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}</span>
    <button onClick={tt} className={`flex h-5 w-5 items-center justify-center rounded-full text-white transition-all hover:scale-110 ${running?"bg-red-500 hover:bg-red-600":"bg-emerald-500 hover:bg-emerald-600"}`}>{running?<Square size={9}/>:<Play size={9}/>}</button></span>;}

const STAT_LBLS:Record<string,string>={invalid:"Invalid",outdated:"Outdated",duplicate:"Duplicate",resolved:"Resolved",valid:""};
function Cm({c,issueId,roles,canEdit,onReply,onRefresh,t,depth=0}:any){
  const[ss,setSs]=useState(false);const hidden=c.status!=="valid";
  return <div className={depth>0?"ml-8 border-l-2 border-[var(--border-light)] pl-3":""}>
    <div className={`mb-3 rounded-lg border p-3 transition-all ${hidden?"border-dashed bg-[var(--bg)] opacity-80":""}`}>
      {hidden&&<div className="mb-2 inline-flex items-center gap-1.5 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">⚠ {STAT_LBLS[c.status]}</div>}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[10px] font-semibold text-[var(--primary)]">{(c.author?.display_name||c.author?.username||"?")[0].toUpperCase()}</div>
          <span className="text-[12px] font-medium">{c.author?.display_name||c.author?.username}</span>
          {roles?.filter((r:string)=>r!=="member").map((r:string)=><span key={r} className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>)}
          <span className="text-[10px] text-[var(--text-muted)]">{new Date(c.created_at).toLocaleString()}</span>
        </div>
        {canEdit && <div className="relative">
          <button onClick={()=>setSs(!ss)} className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors">{hidden?STAT_LBLS[c.status]:"···"}</button>
          {ss&&<div className="absolute right-0 top-full z-10 mt-1.5 w-28 card rounded-lg py-1 shadow-[var(--shadow-lg)] animate-[fadeInUp_.15s_ease-out]">
            {(hidden?["valid",c.status]:["invalid","outdated","duplicate","resolved"]).map((s:string)=><button key={s} onClick={async()=>{await api.patch(`/issues/${issueId}/comments/${c.id}/status`,{status:s});setSs(false);onRefresh?.();}}
              className={`block w-full px-3 py-1.5 text-left text-[10px] transition-colors hover:bg-[var(--bg-hover)] ${c.status===s?"font-semibold text-[var(--primary)] bg-[var(--primary-light)]":""}`}>{c.status===s&&"✓ "}{STAT_LBLS[s]||s}</button>)}</div>}</div>}
      </div>
      <div className={`prose prose-sm max-w-none text-[12px] text-[var(--text-secondary)] ${hidden?"blur-[1px] select-none":""}`}><ReactMarkdown>{c.body}</ReactMarkdown></div>
      {!hidden&&<button onClick={()=>onReply?.(c.id)} className="mt-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">{t("comment.reply","Reply")}</button>}
    </div>
    {c.replies?.map((r:any)=><Cm key={r.id} c={r} issueId={issueId} roles={roles} canEdit={canEdit} onReply={onReply} onRefresh={onRefresh} t={t} depth={depth+1}/>)}
  </div>;}
