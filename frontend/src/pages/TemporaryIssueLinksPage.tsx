import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Clipboard, Clock3, ExternalLink, Link2, ShieldCheck, XCircle } from 'lucide-react'
import { cancelTemporaryIssueLink, listTemporaryIssueLinks } from '../api/temporaryIssueLinks'
import { listTestCollections, cancelTestCollection } from '../api/tests'
import type { TestCollectionLink } from '../api/tests'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import { ListSkeleton } from '../components/ui/Skeleton'
type CollectionLink = TestCollectionLink & { kind: 'issue' | 'test' }
async function loadLinks(): Promise<CollectionLink[]> {
  const [issues, tests] = await Promise.all([listTemporaryIssueLinks(), listTestCollections()])
  return [...issues.map(link => ({ ...link, kind: 'issue' as const })), ...tests.map(link => ({ ...link, kind: 'test' as const }))].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
}
function linkKey(link: CollectionLink) { return `${link.kind}:${link.id}` }

export default function TemporaryIssueLinksPage() {
  const { t, i18n } = useTranslation()
  const [links, setLinks] = useState<CollectionLink[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let active = true
    loadLinks().then(data => { if (active) setLinks(data) })
      .catch(() => { if (active) setError('temporary_links.load_failed') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const timer = window.setInterval(refresh, 1000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])

  async function cancel(link: CollectionLink) {
    setBusy(true)
    setError('')
    try {
      await (link.kind === 'test' ? cancelTestCollection(link.id) : cancelTemporaryIssueLink(link.id))
      // Remove actions immediately, even if the following refresh fails.
      setLinks(items => items.map(item => linkKey(item) === linkKey(link) ? { ...item, active: false, revoked_at: new Date().toISOString(), url: null } : item))
      setLinks(await loadLinks())
    } catch {
      setError('temporary_links.cancel_failed')
    } finally {
      setBusy(false)
    }
  }

  async function copy(link: CollectionLink) {
    if (!link.url) return
    setError('')
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(linkKey(link))
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
    {error && <p role="alert" className="mb-4 text-sm text-red-600">{t(error)}</p>}
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <h2>{t('temporary_links.list_title')}<span className="ws-count">{links.length}</span></h2>
        <span className="text-[11px] text-[var(--text-faint)]">{t('temporary_links.list_hint')}</span>
      </div>
      {loading ? <div className="p-4"><ListSkeleton rows={3} /></div> : links.length === 0 ? <EmptyState icon={Link2} title={t('temporary_links.empty')} compact /> : <div className="grid gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3">{links.map(saved => { const link = { ...saved, active: saved.active && Date.parse(saved.expires_at) > now }; return <article key={linkKey(link)} className={`rounded-[10px] border p-3 transition-colors ${link.active ? 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]' : 'border-[var(--border-light)] bg-[var(--bg-muted)]/40'}`}>
        <div className="flex items-center justify-between gap-2"><span className={`chip ${link.active ? 'chip-emerald' : 'chip-gray'}`}>{link.active ? <Check size={14} /> : link.revoked_at ? <XCircle size={14} /> : <Clock3 size={14} />}{t(link.revoked_at ? 'temporary_links.cancelled' : link.used_at ? 'temporary_links.used' : link.active ? 'temporary_links.active' : 'temporary_links.expired')}</span><span className="text-[11px] text-[var(--text-muted)]">{t(`temporary_links.${link.kind}_type`)}</span></div>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-[var(--text-muted)]"><Clock3 size={11} />{t('temporary_links.expires_at', { date: new Date(link.expires_at).toLocaleString(i18n.resolvedLanguage || i18n.language) })}</div>
          {link.active && (link.url ? <a href={link.url} target="_blank" rel="noopener noreferrer" className="mono mt-2 block truncate text-[10.5px] text-[var(--primary)] hover:underline">{link.url}</a> : <p className="mt-2 text-[11px] text-[var(--text-muted)]">{t('temporary_links.legacy_link')} <a className="text-[var(--primary)] hover:underline" href={link.kind === 'test' ? '#/tests' : '#/issues'}>{t('temporary_links.regenerate')}</a></p>)}
        {link.active && <div className="mt-2.5 flex items-center gap-1.5">{link.url && <><a href={link.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm"><ExternalLink size={12} />{t('temporary_links.open')}</a><button className="btn btn-ghost btn-sm" onClick={() => void copy(link)}>{copied === linkKey(link) ? <Check size={12} /> : <Clipboard size={12} />}{t(copied === linkKey(link) ? 'temporary_links.copied' : 'temporary_links.copy')}</button></>}<button className="btn btn-ghost btn-sm ml-auto text-red-500" disabled={busy} onClick={() => void cancel(link)}>{t('temporary_links.cancel')}</button></div>}
      </article> })}</div>}
    </section>
  </div>
}
