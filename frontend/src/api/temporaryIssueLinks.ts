import api from './client'
export interface PublicIssueLink { expires_at: string; creator_name: string; server_time?: string }
export interface TemporaryIssueLink { id: string; expires_at: string; used_at: string | null; revoked_at: string | null; issue_id: string | null; created_at: string; active: boolean; url: string | null }
export async function createTemporaryIssueLink(expires_in_minutes = 1440) { const {data} = await api.post('/temporary-issue-links', {expires_in_minutes}); return data as {token:string;url:string;expires_at:string} }
export async function listTemporaryIssueLinks() { const {data} = await api.get('/temporary-issue-links'); return data as TemporaryIssueLink[] }
export async function cancelTemporaryIssueLink(id: string) { await api.post(`/temporary-issue-links/${encodeURIComponent(id)}/cancel`) }
export async function getPublicIssueLink(token:string) { const {data} = await api.get(`/public/issue-links/${encodeURIComponent(token)}`); return data as PublicIssueLink }
export async function uploadPublicIssueLinkAttachment(token:string, file:File) { const form = new FormData(); form.append('file', file); const {data} = await api.post(`/public/issue-links/${encodeURIComponent(token)}/attachments`, form); return data as {markdown:string; original_name:string} }
export async function submitPublicIssueLink(token:string, body:{title:string;description:string;issue_type:string;priority:string;due_date:string|null}) { const {data} = await api.post(`/public/issue-links/${encodeURIComponent(token)}/submit`, body); return data as {id:string;title:string;status:string} }
