import api from "./client";

export interface ConnectionData {
  id: string;
  provider: string;
  instance_url: string;
  remote_username: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalRepo {
  full_name: string;
  name: string;
  description: string;
  private: boolean;
  url: string;
}

export interface ExternalIssueResult {
  external_id: string;
  title: string;
  status: string;
  external_url: string;
  labels: string[];
  updated_at: string;
  link_type: string;
}

export interface ExternalLink {
  id: string;
  issue_id: string;
  connection_id: string;
  external_id: string;
  external_url: string;
  external_repo: string;
  title: string | null;
  status: string | null;
  link_type: string;
  last_synced_at: string | null;
  created_at: string;
}

export async function listConnections(): Promise<ConnectionData[]> {
  const res = await api.get("/external/connections");
  return res.data;
}

export async function connectViaPat(data: {
  provider: string;
  token: string;
  instance_url?: string;
}): Promise<ConnectionData> {
  const res = await api.post("/external/connections/pat", data);
  return res.data;
}

export async function deleteConnection(id: string): Promise<void> {
  await api.delete(`/external/connections/${id}`);
}

export async function testConnection(id: string): Promise<boolean> {
  const res = await api.post(`/external/connections/${id}/test`);
  return res.data.ok;
}

export async function listConnectionRepos(connectionId: string): Promise<ExternalRepo[]> {
  const res = await api.get(`/external/connections/${connectionId}/repos`);
  return res.data;
}

export async function searchExternalIssues(
  connectionId: string,
  repo: string,
  query?: string
): Promise<ExternalIssueResult[]> {
  const res = await api.get(`/external/connections/${connectionId}/issues`, {
    params: { repo, query: query || "" },
  });
  return res.data;
}

export async function linkExternalIssue(
  issueId: string,
  data: {
    connection_id: string;
    external_repo: string;
    external_id: string;
    external_url: string;
    title?: string;
    status?: string;
    link_type?: string;
  }
): Promise<ExternalLink> {
  const res = await api.post(
    `/external/connections/issues/${issueId}/external-links`,
    data
  );
  return res.data;
}

export async function listExternalLinks(issueId: string): Promise<ExternalLink[]> {
  const res = await api.get(
    `/external/connections/issues/${issueId}/external-links`
  );
  return res.data;
}

export async function refreshExternalLink(
  issueId: string,
  linkId: string
): Promise<ExternalLink> {
  const res = await api.post(
    `/external/connections/issues/${issueId}/external-links/${linkId}/refresh`
  );
  return res.data;
}

export async function createExternalIssue(
  connectionId: string,
  data: { repo: string; title: string; body?: string }
): Promise<ExternalIssueResult> {
  const res = await api.post(`/external/connections/${connectionId}/create-issue`, data);
  return res.data;
}

export async function unlinkExternalIssue(
  issueId: string,
  linkId: string
): Promise<void> {
  await api.delete(
    `/external/connections/issues/${issueId}/external-links/${linkId}`
  );
}
