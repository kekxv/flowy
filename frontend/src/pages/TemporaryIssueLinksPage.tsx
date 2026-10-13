import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cancelTemporaryIssueLink, createTemporaryIssueLink, listTemporaryIssueLinks } from '../api/temporaryIssueLinks'
import type { TemporaryIssueLink } from '../api/temporaryIssueLinks'

export default function TemporaryIssueLinksPage() {
  const { t, i18n } = useTranslation()
  const [links, setLinks] = useState<TemporaryIssueLink[]>([])
  const [minutes, setMinutes] = useState(1440)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let active = true
    listTemporaryIssueLinks().then(data => { if (active) setLinks(data) })
      .catch(() => { if (active) setError('temporary_links.load_failed') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function create() {
    setBusy(true)
    setError('')
    try {
      await createTemporaryIssueLink(minutes)
      setLinks(await listTemporaryIssueLinks())
    } catch {
      setError('temporary_links.create_failed')
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id: string) {
    setBusy(true)
    setError('')
    try {
      await cancelTemporaryIssueLink(id)
      // Remove actions immediately, even if the following refresh fails.
      setLinks(items => items.map(item => item.id === id ? { ...item, active: false, revoked_at: new Date().toISOString(), url: null } : item))
      setLinks(await listTemporaryIssueLinks())
    } catch {
      setError('temporary_links.cancel_failed')
    } finally {
      setBusy(false)
    }
  }

  async function copy(link: TemporaryIssueLink) {
    if (!link.url) return
    setError('')
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(link.id)
    } catch {
      setError('temporary_links.copy_failed')
    }
  }

  return <div className="page-container">
    <div className="mb-6">
      <h1 className="text-xl font-semibold">{t('temporary_links.title')}</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{t('temporary_links.description')}</p>
    </div>
    <div id="collection-generation" className="card mb-6 flex flex-col items-stretch gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:p-5">
      <div>
        <label htmlFor="link-duration" className="mb-1 block text-xs font-medium">{t('temporary_links.expires_in')}</label>
        <select id="link-duration" value={minutes} disabled={busy} onChange={event => setMinutes(Number(event.target.value))} className="input">
          <option value={30}>{t('temporary_links.minutes', { count: 30 })}</option>
          <option value={360}>{t('temporary_links.hours', { count: 6 })}</option>
          <option value={1440}>{t('temporary_links.hours', { count: 24 })}</option>
          <option value={10080}>{t('temporary_links.days', { count: 7 })}</option>
        </select>
      </div>
      <button className="btn btn-primary w-full sm:w-auto" disabled={busy || loading} onClick={create}>{t('temporary_links.generate')}</button>
    </div>
    {error && <p role="alert" className="mb-4 text-sm text-red-600">{t(error)}</p>}
    <div className="card divide-y divide-[var(--border-light)]">
      {loading ? <p className="p-5 text-sm">{t('common.loading')}</p> : links.length === 0 ? <p className="p-5 text-sm text-[var(--text-muted)]">{t('temporary_links.empty')}</p> : links.map(link => <div key={link.id} className="flex min-w-0 flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{t(link.revoked_at ? 'temporary_links.cancelled' : link.active ? 'temporary_links.active' : 'temporary_links.closed')}</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">{t('temporary_links.expires_at', { date: new Date(link.expires_at).toLocaleString(i18n.resolvedLanguage || i18n.language) })}</div>
          {link.active && (link.url ? <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-xs text-[var(--accent)]">{link.url}</a> : <p className="mt-2 text-xs text-[var(--text-muted)]">{t('temporary_links.legacy_link')} <button className="underline" onClick={() => { document.getElementById('collection-generation')?.scrollIntoView({ behavior: 'smooth' }); document.getElementById('link-duration')?.focus() }}>{t('temporary_links.regenerate')}</button></p>)}
        </div>
        {link.active && <div className="flex shrink-0 flex-wrap gap-2">
          {link.url && <><a href={link.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">{t('temporary_links.open')}</a><button className="btn btn-ghost" onClick={() => void copy(link)}>{t(copied === link.id ? 'temporary_links.copied' : 'temporary_links.copy')}</button></>}
          <button className="btn btn-ghost text-red-600" disabled={busy} onClick={() => void cancel(link.id)}>{t('temporary_links.cancel')}</button>
        </div>}
      </div>)}
    </div>
  </div>
}
