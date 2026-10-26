import api from './client'

export interface PublicBotDetail {
  title: string
  summary: string
  content: string
  expires_at: string
  server_time?: string
}

export async function getPublicBotDetail(token: string) {
  const { data } = await api.get(`/public/bot-details/${encodeURIComponent(token)}`)
  return data as PublicBotDetail
}
