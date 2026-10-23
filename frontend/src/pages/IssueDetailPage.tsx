import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Edit3, Plus, X, Check, Play, Square, ChevronDown, ExternalLink, Globe, Code2, Search, Unlink, RefreshCw, AlertCircle, GitPullRequest, CheckCircle2, UserPlus, Flag, Link2, Paperclip, FileText, MessageSquare } from "lucide-react";
import MarkdownContent from "../components/MarkdownContent";
import api from "../api/client";
import { useAuthStore } from "../store/authStore";
import { listExternalLinks, linkExternalIssue, unlinkExternalIssue, refreshExternalLink, createExternalIssue, listConnections, listConnectionRepos, searchExternalIssues, type ExternalLink as ExtLink, type ConnectionData, type ExternalRepo, type ExternalIssueResult } from "../api/connections";
import { ALL_ROLES, STAT, PRIS } from "../constants";
import { Skeleton } from "../components/ui/Skeleton";
import MarkdownEditor from "../components/MarkdownEditor";
import { extractCommentAttachments } from "../utils/commentAttachments";
import { timeAgo, formatDate, formatDateTime } from "../utils/time";

export default function IssueDetailPage() {
  const {id}=useParams<{id:string}>(); const {t, i18n}=useTranslation();
  const location = useLocation();
  const returnTo = typeof location.state?.from === "string" && (location.state.from === "/issues" || location.state.from.startsWith("/issues?")) ? location.state.from : "/issues";
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
  const [tab,setTab]=useState("activity");
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
  const flx=useCallback(async()=>{if(!id)return;try{const r=await listExternalLinks(id);setExtLinks(r);}catch{}},[id]);
  useEffect(()=>{void flx();},[flx]);

  const fi=useCallback(async()=>{if(!id)return;setLoading(true);const r=await api.get(`/issues/${id}`);setIssue(r.data);setLoading(false);},[id]);
  const fc=useCallback(async()=>{if(!id)return;try{const r=await api.get(`/issues/${id}/comments`);setComments(r.data);}catch{}},[id]);
  const fl=useCallback(async()=>{if(!id)return;try{const r=await api.get(`/issues/${id}/assignee-logs`);setActivityLogs(r.data);}catch{}},[id]);
  useEffect(()=>{void fi();void fc();void fl();},[fi,fc,fl]);
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
  const isFeatureOwner = issue?.issue_type === "feature" && (issue?.assignees||[]).some((a:any)=>a.id===curUser?.id);
  const canFullEdit = isAdmin || isLead || isFeatureOwner;
  const isSoleMember = issue?.assignees?.length === 1
    && issue.assignees[0].id === curUser?.id
    && issue.assignees[0].role === "member";
  const canChangeStatus = canFullEdit || isSoleMember;
  const mls=issue?.milestone_ids||[];

  // External link handlers
  const openLinkModal=async()=>{setLinkMode("browse");setLinkConnId("");setLinkRepo("");setLinkQuery("");setLinkSearchResults([]);setCreateTitle("");setCreateBody("");setLinkRepos([]);
    try{const c=await listConnections();setConns(c);if(c.length>0){const first=c[0];if(first)loadRepos(first.id);}}catch{};setModal("link");};
  const loadRepos=async(cid:string)=>{setLinkConnId(cid);setLinkRepo("");setLinkQuery("");setLinkSearchResults([]);setLinkRepos([]);try{const r=await listConnectionRepos(cid);setLinkRepos(r);}catch{}};
  const selectRepo=async(repo:string)=>{setLinkRepo(repo);setLinkSearchResults([]);setLinkMode("browse");setLinkQuery("");if(!repo)return;setLinkSearching(true);try{const r=await searchExternalIssues(linkConnId,repo,"");setLinkSearchResults(r);}catch{}finally{setLinkSearching(false);}};
  const searchIssues=async()=>{if(!linkRepo)return;setLinkSearching(true);try{const r=await searchExternalIssues(linkConnId,linkRepo,linkQuery);setLinkSearchResults(r);}catch{}finally{setLinkSearching(false);}};
  const [linkMode,setLinkMode]=useState<"browse"|"create">("browse");
  const [createTitle,setCreateTitle]=useState("");
  const [createBody,setCreateBody]=useState("");

  const switchToCreate = () => {
    setCreateTitle(issue?.title || "");
    setCreateBody(issue?.description || "");
    setLinkMode("create");
  };
  const doCreateAndLink=async()=>{if(!id||!linkRepo||!createTitle.trim())return;
    try{const r=await createExternalIssue(linkConnId,{repo:linkRepo,title:createTitle,body:createBody});await linkExternalIssue(id,{connection_id:linkConnId,external_repo:linkRepo,external_id:r.external_id,external_url:r.external_url,title:r.title,status:r.status});flx();setModal(null);setCreateTitle("");setCreateBody("");setLinkMode("browse");}catch{}};
  const doLink=async(extId:string,extUrl:string,title?:string,status?:string,linkType?:string)=>{if(!id||!linkRepo)return;
    try{await linkExternalIssue(id,{connection_id:linkConnId,external_repo:linkRepo,external_id:extId,external_url:extUrl,title,status,link_type:linkType||"issue"});flx();setModal(null);}catch{}};
  const doUnlink=async(lid:string)=>{if(!confirm("Remove this link?"))return;try{await unlinkExternalIssue(id!,lid);flx();}catch{}};
  const doRefresh=async(lid:string)=>{try{await refreshExternalLink(id!,lid);flx();}catch{}};
  // Claim
  const openClaim = async () => { setClaimOpen(true); setClaimRoles([]);
    try { const r = await api.get("/auth/me/project-roles"); setMyRoles(r.data); } catch { setMyRoles([...ALL_ROLES]); }
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

  if (loading) return (
    <div className="space-y-3 page-enter">
      <div className="flex items-center gap-2"><Skeleton className="h-7 w-20" /><Skeleton className="h-7 w-24" /></div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <div className="panel p-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="mt-3 h-3 w-1/3" /></div>
          <div className="panel p-4">
            <div className="flex gap-3 border-b border-[var(--border-light)] pb-2.5">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-3 w-12" />)}
            </div>
            <div className="mt-4 space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className={i % 3 === 2 ? "h-3 w-3/4" : "h-3 w-full"} />)}
            </div>
          </div>
        </div>
        <div className="panel p-4"><Skeleton className="h-3 w-16" /><div className="mt-4 space-y-3">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-3 w-full" />)}</div></div>
      </div>
    </div>
  );
  if(!issue)return <div className="text-center pt-24 text-[var(--text-muted)]">Not found.</div>;

  const attachments = comments.flatMap((c:any) =>
    extractCommentAttachments(c.body || "").map((a:any) => ({ ...a, commentId: c.id, body: c.body }))
  );

  // 描述 + 评论 常驻页面上方，这里只保留次要信息的切换
  const countComments = (list: Array<any>): number => list.reduce((sum, item) => sum + 1 + countComments(item.replies || []), 0);
  const commentTotal = countComments(comments);
  const tabs: Array<{ key: string; label: string; count?: number }> = [
    { key: "activity", label: t("detail.tab_activity", "动态"), count: activityLogs.length },
    { key: "links", label: t("detail.tab_links", "关联"), count: extLinks.length },
    { key: "files", label: t("detail.tab_files", "附件"), count: attachments.length },
  ];

  return (
    <div className="page-enter">
      {errMsg && <div className="fixed left-1/2 top-4 z-[70] -translate-x-1/2 rounded-[8px] border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600 shadow-sm">{errMsg}</div>}

      {/* ─── Sticky action bar ─── */}
      <div className="action-bar">
        <Link to={returnTo} className="btn btn-ghost btn-sm -ml-1"><ArrowLeft size={14}/>{t("common.back")}</Link>
        <span className="mono hidden text-[11px] text-[var(--text-faint)] sm:inline">#{issue.id.slice(0,8)}</span>
        <span className="hidden h-4 w-px bg-[var(--border)] sm:block" />

        <div className="relative">
          {canChangeStatus ? (
            <button onClick={()=>setEs(!es)}
              className={`status-${issue.status} h-[26px] cursor-pointer transition-transform hover:scale-[1.02]`}>
              {t(`issues.status.${issue.status}`)}
              <ChevronDown size={10} className="opacity-50"/>
            </button>
          ) : (
            <span className={`status-${issue.status} h-[26px]`}>{t(`issues.status.${issue.status}`)}</span>
          )}
          {canChangeStatus&&es&&<>
            <div className="fixed inset-0 z-30" onClick={()=>setEs(false)}/>
            <div className="absolute left-0 top-full z-40 mt-1.5 w-40 overflow-hidden rounded-[10px] border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-md)] animate-[fadeInUp_.12s_ease-out]">
              {STAT.map(s=>
                <button key={s} onClick={()=>{qu("status",s);setEs(false);}}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-[12px] transition-colors hover:bg-[var(--bg-hover)] ${s===issue.status?"bg-[var(--primary-subtle)]":""}`}>
                  <span className={`status-${s}`} style={{fontSize:11}}>{t(`issues.status.${s}`)}</span>
                  {s===issue.status&&<Check size={12} className="ml-auto text-[var(--primary)]"/>}
                </button>)}
            </div>
          </>}
        </div>

        {canFullEdit ? (
          <div className="relative">
            <button onClick={()=>setEp(!ep)}
              className={`priority-${issue.priority} h-[26px] cursor-pointer rounded-[6px] px-2 text-[11px] font-medium transition-transform hover:scale-[1.02]`}>
              {t(`issues.priority.${issue.priority}`)}<ChevronDown size={10} className="opacity-50"/>
            </button>
            {ep&&<>
              <div className="fixed inset-0 z-30" onClick={()=>setEp(false)}/>
              <div className="absolute left-0 top-full z-40 mt-1.5 w-36 overflow-hidden rounded-[10px] border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-md)] animate-[fadeInUp_.12s_ease-out]">
                {PRIS.map(p=>
                  <button key={p} onClick={()=>{qu("priority",p);setEp(false);}}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-[12px] transition-colors hover:bg-[var(--bg-hover)] ${p===issue.priority?"bg-[var(--primary-subtle)]":""}`}>
                    <span className={`priority-${p} rounded-[4px] px-1.5 py-0.5 text-[10px]`}>{t(`issues.priority.${p}`)}</span>
                    {p===issue.priority&&<Check size={12} className="ml-auto text-[var(--primary)]"/>}
                  </button>)}
              </div>
            </>}
          </div>
        ) : (
          <span className={`priority-${issue.priority} h-[26px] rounded-[6px] px-2 text-[11px] font-medium`}>{t(`issues.priority.${issue.priority}`)}</span>
        )}

        {canFullEdit && <TimerW issueId={issue.id}/>}

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={openClaim} className="btn btn-outline btn-sm">
            <UserPlus size={12}/><span className="hidden sm:inline">{t("issues.claim","认领")}</span>
          </button>
          {canFullEdit && <Link to={`/issues/${issue.id}/edit`} state={{ from: returnTo }} className="btn btn-primary btn-sm"><Edit3 size={12}/>{t("common.edit")}</Link>}
          {canFullEdit && conns.length>0 && (
            <button onClick={openLinkModal} className="ws-icon-btn grid h-7 w-7" title={t("external.link_issue","关联外部 Issue")}>
              <Link2 size={14}/>
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ─── Left: description → activity/links/files → comments ─── */}
        <div className="min-w-0">
          <div className="panel p-4">
            <div className="flex items-start gap-2.5">
              <span className={`wtype mt-0.5 ${issue.issue_type==="feature"?"is-feature":"is-bug"}`}>{issue.issue_type==="feature"?"需":"问"}</span>
              <div className="min-w-0 flex-1">
                <h1 className="text-[18px] font-semibold leading-snug tracking-[-.01em] text-[var(--text)]">{issue.title}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--text-faint)]">
                  <span className="flex items-center gap-1">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--primary-subtle)] text-[8px] font-semibold text-[var(--primary)]">
                      {(issue.reporter?.display_name||issue.reporter?.username||"?").slice(0,1).toUpperCase()}
                    </span>
                    {issue.reporter?.display_name||issue.reporter?.username}
                  </span>
                  <span className="text-[var(--border)]">·</span>
                  <span>{t("detail.created","创建")} {formatDate(issue.created_at, i18n?.language)}</span>
                  <span className="text-[var(--border)]">·</span>
                  <span>{t("issues.table_updated","更新")} {timeAgo(issue.updated_at||issue.created_at, i18n?.language)}</span>
                  {(issue.labels||[]).map((l:any)=>(
                    <span key={l.id} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium"
                      style={{backgroundColor:l.color+"14",color:l.color}}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{backgroundColor:l.color}}/>{l.name}
                    </span>
                  ))}
                  {mls.map((mid:string)=>{const m=milestones.find(x=>x.id===mid);return m?(
                    <span key={mid} className="inline-flex items-center gap-1 rounded-[4px] bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-medium text-violet-600">
                      <Flag size={9}/>{m.name}
                    </span>):null;})}
                </div>
              </div>
            </div>
          </div>

          {/* 描述：与评论同页展示 */}
          <div className="panel mt-4">
            <div className="panel-head">
              <h2 className="panel-title"><FileText size={12}/>{t("detail.description","描述")}</h2>
              {canFullEdit && (
                <Link to={`/issues/${issue.id}/edit`} state={{ from: returnTo }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--primary)] hover:underline">
                  <Edit3 size={11}/>{t("common.edit")}
                </Link>
              )}
            </div>
            <div className="px-4 py-3.5">
              {issue.description
                ? <MarkdownContent className="prose prose-sm max-w-none">{issue.description}</MarkdownContent>
                : <p className="text-[12.5px] text-[var(--text-faint)]">{t("detail.empty_description","暂无描述")}</p>}
            </div>
          </div>

          {/* 动态 / 关联 / 附件：次要信息 */}
          <div className="panel mt-3 overflow-hidden">
            <div className="tabbar px-1.5">
              {tabs.map(item=>(
                <button key={item.key} role="tab" aria-selected={tab===item.key}
                  onClick={()=>setTab(item.key)}
                  className={`tab${tab===item.key?" is-active":""}`}>
                  {item.label}
                  {item.count!==undefined&&item.count>0&&<span className="tab-count">{item.count}</span>}
                </button>
              ))}
            </div>

            <div className="p-4">
              {tab==="activity" && (
                activityLogs.length===0
                  ? <p className="py-6 text-center text-[12.5px] text-[var(--text-faint)]">{t("detail.no_activity","暂无动态")}</p>
                  : <div className="space-y-1">{activityLogs.map((l:any)=>(
                      <div key={l.id} className="flex items-center gap-2 rounded-[7px] px-1.5 py-1.5 text-[11px] hover:bg-[var(--bg-muted)]">
                        <span className="w-[64px] shrink-0 text-[10.5px] tabular-nums text-[var(--text-faint)]">{formatDate(l.created_at, i18n?.language)}</span>
                        <span className="shrink-0 text-[var(--text-secondary)]">{l.raw_action==="added"||l.raw_action==="removed"?l.user_name:l.changed_by_name}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          l.raw_action==="status_changed"?"bg-blue-50 text-blue-700":
                          l.raw_action==="priority_changed"?"bg-amber-50 text-amber-700":
                          l.raw_action==="milestone_added"||l.raw_action==="milestone_removed"?"bg-violet-50 text-violet-700":
                          l.raw_action==="label_added"||l.raw_action==="label_removed"?"bg-cyan-50 text-cyan-700":
                          l.raw_action==="timer_started"?"bg-emerald-50 text-emerald-700":
                          l.raw_action==="timer_stopped"?"bg-orange-50 text-orange-700":
                          l.raw_action==="added"?"bg-emerald-50 text-emerald-700":
                          l.raw_action==="removed"?"bg-red-50 text-red-700":
                          "bg-gray-50 text-gray-600"}`}>
                          {l.raw_action==="status_changed"?t(`issues.status.${l.role}`):
                           l.raw_action==="priority_changed"?t(`issues.priority.${l.role}`):
                           l.raw_action==="added"?`+ ${t(`roles.${l.role}`)}`:
                           l.raw_action==="removed"?`− ${t(`roles.${l.role}`)}`:
                           l.action}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-[var(--text-faint)]">{new Date(l.created_at).toLocaleTimeString(document.documentElement.lang === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                      </div>))}</div>
              )}

              {tab==="links" && (
                <div>
                  {extLinks.length===0
                    ? <div className="flex flex-col items-center py-8 text-[var(--text-muted)]">
                        <Link2 size={22} className="mb-1.5 opacity-20" strokeWidth={1.5}/>
                        <p className="text-[12px]">{t("detail.no_links","没有关联的外部 Issue")}</p>
                        {canFullEdit&&conns.length>0&&<button onClick={openLinkModal} className="btn btn-outline btn-sm mt-2"><Plus size={12}/>{t("external.link_issue","关联外部 Issue")}</button>}
                      </div>
                    : <div className="space-y-1">{extLinks.map(l=>{
                        const isPR = l.link_type === "pull_request";
                        const isMerged = l.status === "merged";
                        return (
                          <div key={l.id} className="group flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 transition-colors hover:bg-[var(--bg-muted)]">
                            {isPR ? <GitPullRequest size={14} className={`shrink-0 ${isMerged?"text-violet-500":"text-cyan-500"}`}/>
                              : <AlertCircle size={14} className={`shrink-0 ${l.status==="closed"?"text-red-400":"text-emerald-500"}`}/>}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12.5px] font-medium text-[var(--text-secondary)]">{l.title||l.external_id}</div>
                              <div className="mono mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-faint)]">
                                <span>{l.external_repo}</span><span>#{l.external_id}</span>
                                {l.status&&<span className="rounded-full bg-[var(--bg-muted)] px-1.5">{l.status}</span>}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              {canFullEdit&&<button onClick={()=>doRefresh(l.id)} className="rounded p-1 text-[var(--text-faint)] hover:bg-[var(--bg-hover)]"><RefreshCw size={11}/></button>}
                              <a href={l.external_url} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-[var(--text-faint)] hover:bg-[var(--bg-hover)]"><ExternalLink size={11}/></a>
                              {canFullEdit&&<button onClick={()=>doUnlink(l.id)} className="rounded p-1 text-[var(--text-faint)] hover:bg-red-50 hover:text-red-500"><Unlink size={11}/></button>}
                            </div>
                          </div>
                        );
                      })}</div>}
                </div>
              )}

              {tab==="files" && (
                <div data-testid="issue-files-tab">
                  {attachments.length===0
                    ? <div className="flex flex-col items-center py-8 text-[var(--text-muted)]">
                        <Paperclip size={22} className="mb-1.5 opacity-20" strokeWidth={1.5}/>
                        <p className="text-[12px]">{t("detail.no_files","没有附件")}</p>
                      </div>
                    : <div className="space-y-4">
                        {comments.filter((c:any)=>extractCommentAttachments(c.body||"").length>0).map((c:any)=>(
                          <div key={c.id}>
                            <p className="mb-1.5 text-[10.5px] font-medium text-[var(--text-faint)]">
                              {c.author?.display_name||c.author?.username} · {formatDateTime(c.created_at, i18n?.language)}
                            </p>
                            <div className="prose max-w-none text-[12px]"><MarkdownContent>{c.body}</MarkdownContent></div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {extractCommentAttachments(c.body||"").map(({storageName,displayName}:any)=>(
                                <div key={storageName} className="flex items-center gap-1.5 rounded-[7px] border border-[var(--border-light)] bg-[var(--bg)] px-2 py-1 text-[11px]">
                                  <Paperclip size={11} className="text-[var(--text-faint)]"/>
                                  <a href={`api/v1/bot-attachments/${storageName}`} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline">{displayName}</a>
                                  {(canFullEdit||c.author?.id===curUser?.id)&&(
                                    <button onClick={async()=>{if(!confirm(`Delete ${displayName}?`))return;await api.delete(`/bot-attachments/${storageName}`);fc();}}
                                      className="ml-1 cursor-pointer text-red-400 transition-colors hover:text-red-600" title="Delete"><X size={13}/></button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                  }
                  </div>
              )}
            </div>
          </div>

          {/* 评论：讨论区放在动态/关联/附件之后 */}
          <div className="panel mt-3">
            <div className="panel-head">
              <h2 className="panel-title"><MessageSquare size={12}/>{t("detail.tab_comments","评论")}
                {commentTotal>0&&<span className="ws-count">{commentTotal}</span>}
              </h2>
            </div>

            <div className="space-y-3 px-4 py-3.5">
              {comments.length===0&&<p className="py-2 text-center text-[12px] text-[var(--text-faint)]">{t("detail.no_comments","还没有评论")}</p>}
              {comments.map((c:any)=><Cm key={c.id} c={c} issueId={issue.id} roles={(issue.assignees||[]).filter((a:any)=>a.id===c.author?.id).map((a:any)=>a.role)} canEdit={canFullEdit} curUserId={curUser?.id} onReply={setReplyTo} onRefresh={fc} t={t}/>)}
            </div>

            <div className="border-t border-[var(--border-light)] px-4 py-3">
              {replyTo&&<div className="mb-2 flex items-center rounded-[6px] border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] text-blue-600">{t("comment.replying","回复中")} <button onClick={()=>setReplyTo(null)} className="ml-2 font-medium hover:text-blue-800">✕</button></div>}
              <form onSubmit={hc} className="space-y-2">
                <MarkdownEditor id="issue-comment" value={comment} onChange={setComment} rows={3} placeholder={t("issues.write_comment")}/>
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] text-[var(--text-faint)]">{t("comment.markdown_hint","支持 Markdown，附件可直接拖入")}</span>
                  <button type="submit" disabled={sub||!comment.trim()} className="btn btn-primary btn-sm">{t("issues.comment")}</button>
                </div>
              </form>
            </div>
          </div>

        </div>

        {/* ─── Right: properties ─── */}
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-[58px] lg:self-start">
          <div className="panel overflow-hidden">
            <div className="panel-head"><h2>{t("detail.properties","属性")}</h2></div>

            <div className="attr-row">
              <span className="attr-key">{t("common.assignee")}</span>
              <div className="space-y-1">
                {(issue.assignees||[]).map((a:any)=>(
                  <div key={`${a.id}-${a.role}`} className="group flex items-center gap-1.5">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--primary-subtle)] text-[9px] font-semibold text-[var(--primary)]">
                      {(a.display_name||a.username||"?")[0].toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]">{a.display_name||a.username}</span>
                    <span className={`role-badge role-${a.role} shrink-0 text-[9px]`}>{t(`roles.${a.role}`)}</span>
                    {canFullEdit&&<button onClick={()=>ra(a.id,a.role)} className="shrink-0 rounded p-0.5 text-[var(--text-faint)] opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"><X size={10}/></button>}
                  </div>
                ))}
                {(issue.assignees||[]).length===0&&<span className="text-[11.5px] text-[var(--text-faint)]">{t("issues.no_assignee","未指派")}</span>}
                {canFullEdit&&<button onClick={()=>{setSr("");setModal("role");}} className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"><Plus size={10}/>{t("roles.role")}</button>}
              </div>
            </div>

            <div className="attr-row">
              <span className="attr-key">{t("common.labels")}</span>
              <div className="flex flex-wrap items-center gap-1">
                {(issue.labels||[]).map((l:any)=>(
                  canFullEdit
                    ? <button key={l.id} onClick={()=>tl(l.id)} className="group/l inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-70" style={{backgroundColor:l.color+"14",color:l.color}}>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{backgroundColor:l.color}}/>{l.name}<X size={8} className="opacity-0 transition-opacity group-hover/l:opacity-100"/>
                      </button>
                    : <span key={l.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{backgroundColor:l.color+"14",color:l.color}}>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{backgroundColor:l.color}}/>{l.name}
                      </span>
                ))}
                {(issue.labels||[]).length===0&&!canFullEdit&&<span className="text-[11.5px] text-[var(--text-faint)]">{t("common.none")}</span>}
                {canFullEdit&&<button onClick={()=>setModal("label")} className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"><Plus size={10}/>{t("common.label")}</button>}
              </div>
            </div>

            <div className="attr-row">
              <span className="attr-key">{t("issues.col_milestone","里程碑")}</span>
              <div className="space-y-1">
                {mls.map((mid:string)=>{const m=milestones.find(x=>x.id===mid);return(
                  <div key={mid} className="group flex items-center gap-1.5">
                    <Flag size={12} className="shrink-0 text-violet-400"/>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-violet-600">{m?.name||mid}</span>
                    {canFullEdit&&<button onClick={()=>tm(mid)} className="shrink-0 rounded p-0.5 text-[var(--text-faint)] opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"><X size={10}/></button>}
                  </div>
                );})}
                {mls.length===0&&<span className="text-[11.5px] text-[var(--text-faint)]">{t("common.none")}</span>}
                {canFullEdit&&<button onClick={()=>setModal("milestone")} className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"><Plus size={10}/>{t("issues.col_milestone","里程碑")}</button>}
              </div>
            </div>

            <div className="attr-row">
              <span className="attr-key">{t("detail.reporter","报告人")}</span>
              <span className="text-[11.5px] text-[var(--text-secondary)]">{issue.reporter?.display_name||issue.reporter?.username}</span>
            </div>
            <div className="attr-row">
              <span className="attr-key">{t("detail.created","创建")}</span>
              <span className="text-[11.5px] tabular-nums text-[var(--text-secondary)]">{formatDateTime(issue.created_at, i18n?.language)}</span>
            </div>
          </div>

        </aside>
      </div>

      {/* Claim role modal */}
      {claimOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25" onClick={() => { setClaimOpen(false); setClaimRoles([]); }}>
          <div className="card w-72 rounded-[12px] p-4 animate-[scaleIn_.15s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">{t("roles.title","Project Roles")}</h3>
              <button onClick={() => { setClaimOpen(false); setClaimRoles([]); }} className="rounded-[8px] p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={14}/></button>
            </div>
            <div className="mb-3 space-y-0.5">
              {myRoles.map((r: string) => (
                <label key={r}
                  className={`flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-2 text-[12px] transition-colors ${
                    claimRoles.includes(r) ? "bg-[var(--primary-subtle)] font-medium text-[var(--primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
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

      {/* Modals */}
      {modal&&modal!=="link"&&<Modal onClose={()=>setModal(null)} wide={modal==="role"} title={modal==="milestone"?t("issues.milestone"):modal==="label"?t("common.labels"):t("roles.title")}>
        {modal==="milestone"&&<div className="max-h-60 space-y-1 overflow-y-auto">{milestones.map(m=>{const a=mls.includes(m.id);return <button key={m.id} onClick={()=>tm(m.id)} className={`flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-[13px] transition-colors ${a?"bg-violet-50 text-violet-700":"hover:bg-[var(--bg-hover)]"}`}>{m.name}{a&&<Check size={14}/>}</button>})}</div>}
        {modal==="label"&&<div className="max-h-60 space-y-1 overflow-y-auto">{labels.map(l=>{const a=(issue.labels||[]).some((il:any)=>il.id===l.id);return <button key={l.id} onClick={()=>tl(l.id)} className={`flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[13px] transition-colors ${a?"bg-[var(--primary-subtle)] text-[var(--primary)]":"hover:bg-[var(--bg-hover)]"}`}><span className="h-3 w-3 rounded-full" style={{backgroundColor:l.color}}/>{l.name}{a&&<Check size={14} className="ml-auto"/>}</button>})}</div>}
        {modal==="role"&&(
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {ALL_ROLES.map(r=>{
              const assigned = (issue.assignees||[]).filter((a:any)=>a.role===r);
              return (
                <div key={r} className="overflow-hidden rounded-[8px] border border-[var(--border-light)]">
                  <button onClick={()=>setSr(sr===r?"":r)}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${sr===r?"bg-[var(--bg-muted)]":""}`}>
                    <div className="flex items-center gap-2.5">
                      <span className={`role-badge role-${r} rounded-[6px] px-2 py-0.5 text-[11px] font-medium`}>{t(`roles.${r}`)}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {assigned.length>0 ? assigned.map((a:any)=><span key={a.id} className="mr-1">{a.display_name||a.username}</span>) : <span className="italic opacity-50">{t("common.none","none")}</span>}
                      </span>
                    </div>
                    <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${sr===r?"rotate-180":""}`}/>
                  </button>
                  {sr===r && (
                    <div className="border-t border-[var(--border-light)] bg-[var(--bg)] px-3 py-2">
                      <div className="grid grid-cols-2 gap-1">
                        {users.map(u=>{
                          const isAssigned = assigned.some((a:any)=>a.id===u.id);
                          return (
                            <button key={u.id} onClick={()=>ar(u.id,r)}
                              className={`flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[12px] transition-colors ${isAssigned?"bg-emerald-50 font-medium text-emerald-700":"text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"}`}>
                              <div className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--primary-subtle)] text-[9px] font-semibold text-[var(--primary)]">
                                {(u.display_name||u.username).slice(0,1).toUpperCase()}
                              </div>
                              <span className="truncate">{u.display_name||u.username}</span>
                              {isAssigned && <Check size={12} className="ml-auto shrink-0 text-emerald-500"/>}
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

      {modal==="link"&&<Modal onClose={()=>{setModal(null);setCreateTitle("");setCreateBody("");}} title={t("external.link_issue","Link External Issue")} wide>
        <div className="space-y-4">
          {conns.length===0?(
            <div className="flex flex-col items-center py-8 text-[var(--text-muted)]">
              <Globe size={32} className="mb-2 opacity-20"/>
              <p className="text-[13px]">{t("settings.no_connections","No connections")}</p>
              <p className="mt-0.5 text-[11px]">{t("settings.connect_hint","Connect GitHub or Gitea to link external issues.")}</p>
            </div>
          ):<>
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Account</label>
              <div className="flex rounded-[8px] bg-[var(--bg-muted)] p-0.5">{conns.map(c=>(
                <button key={c.id} onClick={()=>loadRepos(c.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[11px] font-medium transition-all ${
                    linkConnId===c.id ? "bg-white text-[var(--text)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}>
                  {c.provider==="github"?<Code2 size={12}/>:<Globe size={12}/>}
                  {c.provider==="github"?"GitHub":"Gitea"}
                </button>
              ))}</div>
            </div>
            {linkRepos.length>0 && (
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Repository</label>
                <select value={linkRepo} onChange={e=>selectRepo(e.target.value)} className="input w-full text-xs">
                  <option value="">{t("issues.select_repo","Select repo...")}</option>
                  {linkRepos.map(r=><option key={r.full_name} value={r.full_name}>{r.name||r.full_name}</option>)}
                </select>
              </div>
            )}
            {linkRepo && linkMode==="browse" && <>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
                <input value={linkQuery} onChange={e=>setLinkQuery(e.target.value)} placeholder={t("common.search")+"..."}
                  className="input input-with-icon w-full text-xs" onKeyDown={e=>{if(e.key==="Enter")searchIssues();}}/>
              </div>
              {linkSearching ? (
                <div className="flex justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"/></div>
              ) : linkSearchResults.length>0 ? (
                <div className="-mx-1 max-h-52 space-y-1 overflow-y-auto px-1">
                  {linkSearchResults.map(r=>{
                    const isPR = r.link_type === "pull_request";
                    const isMerged = r.status === "merged";
                    return (
                    <button key={r.external_id} onClick={()=>doLink(r.external_id,r.external_url,r.title,r.status,r.link_type)}
                      className="group flex w-full items-center gap-3 rounded-[8px] border border-[var(--border-light)] px-3 py-2.5 text-left transition-all hover:border-[var(--primary)]/30 hover:bg-[var(--primary-subtle)]">
                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-[8px] ${isMerged ? "bg-violet-50" : isPR ? "bg-cyan-50" : r.status==="closed" ? "bg-red-50" : "bg-emerald-50"}`}>
                        {isPR ? <GitPullRequest size={14} className={isMerged?"text-violet-500":"text-cyan-500"}/>
                          : r.status==="closed" ? <CheckCircle2 size={14} className="text-red-500"/> : <AlertCircle size={14} className="text-emerald-500"/>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium">{r.title}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                          <span className="font-mono">#{r.external_id}</span>
                          {isPR && <span className="rounded-full bg-cyan-50 px-1.5 py-0.5 text-[9px] font-medium text-cyan-600">PR</span>}
                          {r.status && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${isMerged?"bg-violet-50 text-violet-600":r.status==="closed"?"bg-red-50 text-red-600":"bg-emerald-50 text-emerald-600"}`}>{r.status}</span>}
                          {r.labels?.slice(0,2).map((lb:string)=>(
                            <span key={lb} className="rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">{lb}</span>
                          ))}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-[8px] bg-[var(--primary)] px-2.5 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">Link</span>
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
                <button onClick={switchToCreate}
                  className="flex w-full items-center justify-center gap-2 rounded-[8px] py-2 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--primary)]">
                  <Plus size={13}/> {t("issues.create_external","Create New Issue")}
                </button>
              </div>
            </>}
            {linkRepo && linkMode==="create" && <>
              <button onClick={()=>{setLinkMode("browse");setCreateTitle("");setCreateBody("");}}
                className="mb-2 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]">&larr; {t("common.back")} to browse</button>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {t("issues.create_external","Create in")} {linkRepo.split("/")[0]}
              </p>
              <input value={createTitle} onChange={e=>setCreateTitle(e.target.value)} placeholder={t("common.title")+" *"} className="input mb-2 w-full text-xs"/>
              <textarea rows={3} value={createBody} onChange={e=>setCreateBody(e.target.value)} placeholder={t("common.description")+" ("+t("common.optional")+")"} className="input mb-3 w-full resize-none text-xs"/>
              <button onClick={doCreateAndLink} disabled={!createTitle.trim()} className="btn btn-primary btn-sm w-full">{t("common.create")} & {t("external.link_issue","Link")}</button>
            </>}
            {!linkRepo && linkRepos.length>0 && (
              <div className="flex flex-col items-center py-10 text-[var(--text-muted)]">
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-[8px] bg-[var(--bg-muted)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z"/></svg>
                </div>
                <p className="mb-0.5 text-[12px] font-medium">Choose a repository</p>
                <p className="text-[10px]">Select a repo above to browse its issues</p>
              </div>
            )}
            {linkRepos.length===0 && linkConnId && (
              <div className="flex flex-col items-center py-8 text-[var(--text-muted)]">
                <div className="mb-2 h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"/>
                <p className="text-[11px]">Loading repositories...</p>
              </div>
            )}
            {!linkConnId && (
              <div className="flex flex-col items-center py-10 text-[var(--text-muted)]">
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-[8px] bg-[var(--bg-muted)]">
                  <Globe size={20} className="opacity-30"/>
                </div>
                <p className="mb-0.5 text-[12px] font-medium">Select an account</p>
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
    <div className={`card rounded-[8px] p-5 animate-[fadeInUp_.2s_ease-out] ${wide?"w-[480px]":"w-80"}`} onClick={e=>e.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">{title}</h3><button onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X size={16}/></button></div>
      {children}</div></div>;}

function TimerW({issueId}:{issueId:string}){
  const[running,setRunning]=useState(false);const[e,setE]=useState(0);const intv=useRef<ReturnType<typeof setInterval>|null>(null);
  useEffect(()=>{
    let cancelled=false;
    api.get(`/issues/${issueId}/timer/status`)
      .then(r=>{if(cancelled)return;setRunning(r.data.is_running);if(r.data.is_running)setE(r.data.duration_ms);})
      .catch(()=>{});
    return()=>{cancelled=true;if(intv.current)clearInterval(intv.current);};
  },[issueId]);
  useEffect(()=>{if(running){intv.current=setInterval(()=>setE((e:number)=>e+1000),1000);}else{if(intv.current)clearInterval(intv.current);}return()=>{if(intv.current)clearInterval(intv.current);};},[running]);
  const tt=async()=>{running?await api.post(`/issues/${issueId}/timer/stop`):await api.post(`/issues/${issueId}/timer/start`);setRunning(!running);};
  const h=Math.floor(e/3600000),m=Math.floor((e%3600000)/60000),s=Math.floor((e%60000)/1000);
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5">
    <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">{String(h).padStart(2,"0")}:{String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}</span>
    <button onClick={tt} className={`flex h-5 w-5 items-center justify-center rounded-full text-white transition-all hover:scale-110 ${running?"bg-red-500 hover:bg-red-600":"bg-emerald-500 hover:bg-emerald-600"}`}>{running?<Square size={9}/>:<Play size={9}/>}</button></span>;}

const COMMENT_STATUS_KEYS:Record<string,string>={invalid:"comment_status.invalid",outdated:"comment_status.outdated",duplicate:"comment_status.duplicate",resolved:"comment_status.resolved",valid:"comment_status.valid"};
function Cm({c,issueId,roles,canEdit,curUserId,onReply,onRefresh,t,depth=0}:any){
  const[ss,setSs]=useState(false);const hidden=c.status!=="valid";
  const statusLabel = t(COMMENT_STATUS_KEYS[c.status] || c.status);
  const canDeleteAttachment=canEdit||c.author?.id===curUserId;
  const attachments = extractCommentAttachments(c.body || "");
  const handleDelete = async (storageName: string, displayName: string) => {
    if (!confirm(`Delete ${displayName}?`)) return;
    await api.delete(`/bot-attachments/${storageName}`);
    onRefresh?.();
  };
  return <div className={depth>0?"ml-8 border-l-2 border-[var(--border-light)] pl-3":""}>
    <div className={`mb-3 rounded-lg border p-3 transition-all ${hidden?"border-dashed bg-[var(--bg)] opacity-80":""}`}>
      {hidden&&<div className="mb-2 inline-flex items-center gap-1.5 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">⚠ {statusLabel}</div>}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[10px] font-semibold text-[var(--primary)]">{(c.author?.display_name||c.author?.username||"?")[0].toUpperCase()}</div>
          <span className="text-[12px] font-medium">{c.author?.display_name||c.author?.username}</span>
          {roles?.filter((r:string)=>r!=="member").map((r:string)=><span key={r} className={`role-badge role-${r}`}>{t(`roles.${r}`)}</span>)}
          <span className="text-[10px] text-[var(--text-muted)]">{formatDateTime(c.created_at, document.documentElement.lang)}</span>
        </div>
        {canEdit && <div className="relative">
          <button onClick={()=>setSs(!ss)} className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors">{hidden?statusLabel:"···"}</button>
          {ss&&<div className="absolute right-0 top-full z-10 mt-1.5 w-28 card rounded-lg py-1  animate-[fadeInUp_.15s_ease-out]">
            {(hidden?["valid",c.status]:["invalid","outdated","duplicate","resolved"]).map((s:string)=><button key={s} onClick={async()=>{await api.patch(`/issues/${issueId}/comments/${c.id}/status`,{status:s});setSs(false);onRefresh?.();}}
              className={`block w-full px-3 py-1.5 text-left text-[10px] transition-colors hover:bg-[var(--bg-hover)] ${c.status===s?"font-semibold text-[var(--primary)] bg-[var(--primary-light)]":""}`}>{c.status===s&&"✓ "}{t(COMMENT_STATUS_KEYS[s] || s)}</button>)}</div>}</div>}
      </div>
      <div className={`prose prose-sm max-w-none text-[12px] text-[var(--text-secondary)] ${hidden?"blur-[1px] select-none":""}`}><MarkdownContent>{c.body}</MarkdownContent></div>
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {attachments.map(({storageName, displayName}) => {
            const url = `api/v1/bot-attachments/${storageName}`;
            return (
              <div key={storageName} className="flex items-center gap-1.5 rounded bg-[var(--bg)] px-2 py-1 text-[11px]">
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline"> {displayName}</a>
                {canDeleteAttachment && <button onClick={() => handleDelete(storageName, displayName)} className="cursor-pointer text-red-400 hover:text-red-600 ml-1 transition-colors" title="Delete"><X size={14} /></button>}
              </div>
            );
          })}
        </div>
      )}
      {!hidden&&<button onClick={()=>onReply?.(c.id)} className="mt-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors">{t("comment.reply","Reply")}</button>}
    </div>
    {c.replies?.map((r:any)=><Cm key={r.id} c={r} issueId={issueId} roles={roles} canEdit={canEdit} curUserId={curUserId} onReply={onReply} onRefresh={onRefresh} t={t} depth={depth+1}/>)}
  </div>;}
