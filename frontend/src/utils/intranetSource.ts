export interface IntranetSourceForm {
  name: string
  url: string
  source_type: "json" | "nginx"
  file_ttl_seconds: number
  use_basic_auth: boolean
  auth_username: string
  auth_password: string
}

export function formatFileSize(size?: number | null): string {
  if (size == null || size < 0) return "未知"
  let value = size
  const units = ["B", "KB", "MB", "GB", "TB"]
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  if (unitIndex === 0) return `${Math.trunc(value)} B`
  const rendered = value.toFixed(1).replace(/\.0$/, "")
  return `${rendered} ${units[unitIndex]}`
}

export function buildIntranetSourcePayload(
  form: IntranetSourceForm,
  editingHasAuth: boolean,
) {
  const payload: Record<string, string | number | boolean> = {
    name: form.name,
    url: form.url,
    source_type: form.source_type,
    file_ttl_seconds: form.file_ttl_seconds,
  }
  if (form.use_basic_auth) {
    payload.auth_username = form.auth_username.trim()
    if (form.auth_password) payload.auth_password = form.auth_password
  } else if (editingHasAuth) {
    payload.clear_auth = true
  }
  return payload
}

export function buildIntranetSourceTestPayload(
  form: IntranetSourceForm,
  editingSourceId: string | null,
) {
  const payload: Record<string, string | boolean> = {
    url: form.url,
    source_type: form.source_type,
    use_basic_auth: form.use_basic_auth,
  }
  if (editingSourceId) payload.source_id = editingSourceId
  if (form.use_basic_auth) {
    payload.auth_username = form.auth_username.trim()
    payload.auth_password = form.auth_password
  }
  return payload
}
