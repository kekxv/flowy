import api from "./client";
import type { PaginatedResponse } from "../types";

export interface WikiPageData {
  id: string;
  owner_id: string;
  title: string;
  slug: string;
  content: string;
  tags: string;
  is_public: boolean;
  weight: number;
  created_at: string;
  updated_at: string;
  owner_name: string;
  owner_display_name: string;
  collaborator_ids: string[];
}

export interface WikiCollaboratorData {
  user_id: string;
  username: string;
  display_name: string;
  permission: string;
}

export interface WikiUploadResult {
  filename: string;
  original_name: string;
  url: string;
  is_image: boolean;
  markdown: string;
}

export async function listWikiPages(params: { q?: string; tab?: string; page?: number; per_page?: number } = {}): Promise<PaginatedResponse<WikiPageData>> {
  const res = await api.get("/wiki", { params });
  return res.data;
}

export async function getWikiPage(id: string): Promise<WikiPageData> {
  const res = await api.get(`/wiki/${id}`);
  return res.data;
}

export async function createWikiPage(data: {
  title: string;
  content?: string;
  tags?: string;
  is_public?: boolean;
  weight?: number;
}): Promise<WikiPageData> {
  const res = await api.post("/wiki", data);
  return res.data;
}

export async function updateWikiPage(
  id: string,
  data: {
    title?: string;
    content?: string;
    tags?: string;
    is_public?: boolean;
    weight?: number;
  }
): Promise<WikiPageData> {
  const res = await api.put(`/wiki/${id}`, data);
  return res.data;
}

export async function deleteWikiPage(id: string): Promise<void> {
  await api.delete(`/wiki/${id}`);
}

export async function uploadWikiFile(file: File): Promise<WikiUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post("/wiki/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function listCollaborators(pageId: string): Promise<WikiCollaboratorData[]> {
  const res = await api.get(`/wiki/${pageId}/collaborators`);
  return res.data;
}

export async function addCollaborator(
  pageId: string,
  userId: string,
  permission: string = "editor"
): Promise<void> {
  await api.post(`/wiki/${pageId}/collaborators`, { user_id: userId, permission });
}

export async function removeCollaborator(pageId: string, userId: string): Promise<void> {
  await api.delete(`/wiki/${pageId}/collaborators/${userId}`);
}
