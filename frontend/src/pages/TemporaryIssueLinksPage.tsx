import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Clipboard, Clock3, ExternalLink, Link2, Plus, ShieldCheck, XCircle } from 'lucide-react'
import { cancelTemporaryIssueLink, createTemporaryIssueLink, listTemporaryIssueLinks } from '../api/temporaryIssueLinks'
import type { TemporaryIssueLink } from '../api/temporaryIssueLinks'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import { ListSkeleton } from '../components/ui/Skeleton'

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

  return <div className="page-enter space-y-3">
    <PageHeader
      icon={Link2}
      title={t('temporary_links.title')}
      subtitle={t('temporary_links.description')}
      actions={<span className="chip chip-emerald"><ShieldCheck size={11} />{t('temporary_links.secure_hint')}</span>}
    />
    <div id="collection-generation" className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--primary)]"><Plus size={13} />{t('temporary_links.create_title')}</p>
        <p className="mt-1 text-[13px] font-medium text-[var(--text)]">{t('temporary_links.create_hint')}</p>
      </div>
      <div className="flex items-end gap-2">
        <div>
        <label htmlFor="link-duration" className="field-label">{t('temporary_links.expires_in')}</label>
        <select id="link-duration" value={minutes} disabled={busy} onChange={event => setMinutes(Number(event.target.value))} className="input">
          <option value={30}>{t('temporary_links.minutes', { count: 30 })}</option>
          <option value={360}>{t('temporary_links.hours', { count: 6 })}</option>
          <option value={1440}>{t('temporary_links.hours', { count: 24 })}</option>
          <option value={10080}>{t('temporary_links.days', { count: 7 })}</option>
        </select>
      </div>
      <button className="btn btn-primary btn-sm" disabled={busy || loading} onClick={create}>{t('temporary_links.generate')}<Link2 size={13} /></button>
      </div>
    </div>
    {error && <p role="alert" className="mb-4 text-sm text-red-600">{t(error)}</p>}
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <h2>{t('temporary_links.list_title')}<span className="ws-count">{links.length}</span></h2>
        <span className="text-[11px] text-[var(--text-faint)]">{t('temporary_links.list_hint')}</span>
      </div>
      {loading ? <div className="p-4"><ListSkeleton rows={3} /></div> : links.length === 0 ? <EmptyState icon={Link2} title={t('temporary_links.empty')} compact /> : <div className="grid gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3">{links.map(link => <article key={link.id} className={`rounded-[10px] border p-3 transition-colors ${link.active ? 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]' : 'border-[var(--border-light)] bg-[var(--bg-muted)]/40'}`}>
        <div className="flex items-center justify-between gap-2"><span className={`chip ${link.active ? 'chip-emerald' : 'chip-gray'}`}>{link.active ? <Check size={14} /> : link.revoked_at ? <XCircle size={14} /> : <Clock3 size={14} />}{t(link.revoked_at ? 'temporary_links.cancelled' : link.active ? 'temporary_links.active' : 'temporary_links.closed')}</span><span className="mono text-[10.5px] text-[var(--text-faint)]">#{link.id.slice(0, 6)}</span></div>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-[var(--text-muted)]"><Clock3 size={11} />{t('temporary_links.expires_at', { date: new Date(link.expires_at).toLocaleString(i18n.resolvedLanguage || i18n.language) })}</div>
          {link.active && (link.url ? <a href={link.url} target="_blank" rel="noopener noreferrer" className="mono mt-2 block truncate text-[10.5px] text-[var(--primary)] hover:underline">{link.url}</a> : <p className="mt-2 text-[11px] text-[var(--text-muted)]">{t('temporary_links.legacy_link')} <button className="text-[var(--primary)] hover:underline" onClick={() => { document.getElementById('collection-generation')?.scrollIntoView({ behavior: 'smooth' }); document.getElementById('link-duration')?.focus() }}>{t('temporary_links.regenerate')}</button></p>)}
        {link.active && <div className="mt-2.5 flex items-center gap-1.5">{link.url && <><a href={link.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm"><ExternalLink size={12} />{t('temporary_links.open')}</a><button className="btn btn-ghost btn-sm" onClick={() => void copy(link)}>{copied === link.id ? <Check size={12} /> : <Clipboard size={12} />}{t(copied === link.id ? 'temporary_links.copied' : 'temporary_links.copy')}</button></>}<button className="btn btn-ghost btn-sm ml-auto text-red-500" disabled={busy} onClick={() => void cancel(link.id)}>{t('temporary_links.cancel')}</button></div>}
      </article>)}</div>}
    </section>
  </div>
}
