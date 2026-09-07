import api from "./client";

export interface DependencyData {
  id: string;
  kind: "internal" | "external" | "runtime";
  name: string;
  target_component_id: string | null;
  constraint: string;
}

export interface VersionData {
  id: string;
  component_id: string;
  version: string;
  note: string;
  artifact_type: "file" | "url" | "none";
  file_name: string;
  file_size: number;
  download_url: string;
  stored_filename: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  dependencies: DependencyData[];
}

export interface ComponentData {
  id: string;
  name: string;
  identifier: string;
  category: string;
  icon_key: string;
  description: string;
  created_at: string;
  updated_at: string;
  version_count: number;
  latest_version: VersionData | null;
  dependency_count: number;
  internal_dependency_count: number;
  versions?: VersionData[] | null;
}

export interface SoftwareStats {
  component_count: number;
  version_count: number;
  artifact_count: number;
  dependency_count: number;
}

export interface DependencyInput {
  kind: string;
  name: string;
  target_component_id?: string | null;
  constraint: string;
}

export interface VersionInput {
  version: string;
  note?: string;
  artifact_type?: "file" | "url" | "none";
  file_name?: string;
  file_size?: number;
  download_url?: string;
  published_at?: string | null;
  dependencies?: DependencyInput[];
}

export interface ComponentInput {
  name: string;
  identifier: string;
  category?: string;
  icon_key?: string;
  description?: string;
}

export async function listComponents(
  params: { category?: string; sort?: string } = {}
): Promise<ComponentData[]> {
  const res = await api.get("/software", { params });
  return res.data;
}

export async function getStats(): Promise<SoftwareStats> {
  const res = await api.get("/software/stats");
  return res.data;
}

export async function getComponent(id: string): Promise<ComponentData> {
  const res = await api.get(`/software/${id}`);
  return res.data;
}

export async function createComponent(data: ComponentInput): Promise<ComponentData> {
  const res = await api.post("/software", data);
  return res.data;
}

export async function updateComponent(
  id: string,
  data: Partial<ComponentInput>
): Promise<ComponentData> {
  const res = await api.put(`/software/${id}`, data);
  return res.data;
}

export async function deleteComponent(id: string): Promise<void> {
  await api.delete(`/software/${id}`);
}

export async function createVersion(
  componentId: string,
  data: VersionInput
): Promise<VersionData> {
  const res = await api.post(`/software/${componentId}/versions`, data);
  return res.data;
}

export async function getVersion(id: string): Promise<VersionData> {
  const res = await api.get(`/software/versions/${id}`);
  return res.data;
}

export async function updateVersion(
  id: string,
  data: Partial<VersionInput>
): Promise<VersionData> {
  const res = await api.put(`/software/versions/${id}`, data);
  return res.data;
}

export async function deleteVersion(id: string): Promise<void> {
  await api.delete(`/software/versions/${id}`);
}

export async function uploadArtifact(
  versionId: string,
  file: File
): Promise<{ filename: string; original_name: string; size_mb: number; url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post(`/software/versions/${versionId}/upload`, form);
  return res.data;
}

/** Human-friendly artifact download URL on the SPA origin. */
export function artifactUrl(storedFilename: string): string {
  return `/api/v1/software/files/${storedFilename}`;
}
