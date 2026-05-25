import api from "./client";
import type { PaginatedResponse } from "../types";

export interface IssueData {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  reporter: { id: string; username: string; display_name: string; avatar_url: string };
  assignees: Array<{ id: string; username: string; display_name: string }>;
  labels: Array<{ id: string; name: string; color: string }>;
  comments: Array<{
    id: string;
    issue_id: string;
    author: { id: string; username: string; display_name: string };
    body: string;
    created_at: string;
    updated_at: string;
  }>;
  milestone_ids: string[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface LabelData {
  id: string;
  name: string;
  color: string;
  description: string;
  created_at: string;
}

export async function listIssues(params: Record<string, string> = {}): Promise<PaginatedResponse<IssueData>> {
  const res = await api.get("/issues", { params });
  return res.data;
}

export async function getIssue(id: string): Promise<IssueData> {
  const res = await api.get(`/issues/${id}`);
  return res.data;
}

export async function createIssue(data: {
  title: string;
  description?: string;
  issue_type?: string;
  priority?: string;
  assignees?: Array<{user_id: string; role: string}>;
  label_ids?: string[];
  milestone_ids?: string[];
}): Promise<IssueData> {
  const res = await api.post("/issues", data);
  return res.data;
}

export async function updateIssue(
  id: string,
  data: Record<string, unknown>
): Promise<IssueData> {
  const res = await api.put(`/issues/${id}`, data);
  return res.data;
}

export async function getComments(issueId: string): Promise<IssueData["comments"]> {
  const res = await api.get(`/issues/${issueId}/comments`);
  return res.data;
}

export async function addComment(issueId: string, body: string) {
  const res = await api.post(`/issues/${issueId}/comments`, { body });
  return res.data;
}

export async function listLabels(): Promise<LabelData[]> {
  const res = await api.get("/labels");
  return res.data;
}

export async function createLabel(data: { name: string; color?: string; description?: string }): Promise<LabelData> {
  const res = await api.post("/labels", data);
  return res.data;
}

export async function updateLabel(id: string, data: Record<string, unknown>): Promise<LabelData> {
  const res = await api.put(`/labels/${id}`, data);
  return res.data;
}

export async function deleteLabel(id: string): Promise<void> {
  await api.delete(`/labels/${id}`);
}
