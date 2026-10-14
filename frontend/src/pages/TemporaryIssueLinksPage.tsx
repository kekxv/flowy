import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Clipboard, Clock3, ExternalLink, Link2, Plus, ShieldCheck, XCircle } from 'lucide-react'
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

  return <div className="page-container collection-links-page">
    <div className="collection-links-hero">
      <div className="collection-links-hero-icon"><Link2 size={22} /></div>
      <div><h1>{t('temporary_links.title')}</h1><p>{t('temporary_links.description')}</p></div>
      <div className="collection-links-trust"><ShieldCheck size={16} />{t('temporary_links.secure_hint')}</div>
    </div>
    <div id="collection-generation" className="collection-link-generator">
      <div className="collection-link-generator-copy"><span className="collection-link-kicker"><Plus size={14} />{t('temporary_links.create_title')}</span><strong>{t('temporary_links.create_hint')}</strong></div>
      <div className="collection-link-generator-controls"><div>
        <label htmlFor="link-duration">{t('temporary_links.expires_in')}</label>
        <select id="link-duration" value={minutes} disabled={busy} onChange={event => setMinutes(Number(event.target.value))} className="input">
          <option value={30}>{t('temporary_links.minutes', { count: 30 })}</option>
          <option value={360}>{t('temporary_links.hours', { count: 6 })}</option>
          <option value={1440}>{t('temporary_links.hours', { count: 24 })}</option>
          <option value={10080}>{t('temporary_links.days', { count: 7 })}</option>
        </select>
      </div><button className="btn btn-primary" disabled={busy || loading} onClick={create}>{t('temporary_links.generate')}<Link2 size={17} /></button></div>
    </div>
    {error && <p role="alert" className="mb-4 text-sm text-red-600">{t(error)}</p>}
    <section className="collection-link-list">
      <div className="collection-link-list-heading"><div><h2>{t('temporary_links.list_title')}</h2><p>{t('temporary_links.list_hint')}</p></div><span>{links.length}</span></div>
      {loading ? <p className="collection-link-empty">{t('common.loading')}</p> : links.length === 0 ? <p className="collection-link-empty">{t('temporary_links.empty')}</p> : <div className="collection-link-grid">{links.map(link => <article key={link.id} className={`collection-link-item ${link.active ? 'is-active' : 'is-closed'}`}>
        <div className="collection-link-item-top"><span className="collection-link-status">{link.active ? <Check size={14} /> : link.revoked_at ? <XCircle size={14} /> : <Clock3 size={14} />}{t(link.revoked_at ? 'temporary_links.cancelled' : link.active ? 'temporary_links.active' : 'temporary_links.closed')}</span><span className="collection-link-id">#{link.id.slice(0, 6)}</span></div>
        <div className="collection-link-expiry"><Clock3 size={15} />{t('temporary_links.expires_at', { date: new Date(link.expires_at).toLocaleString(i18n.resolvedLanguage || i18n.language) })}</div>
          {link.active && (link.url ? <a href={link.url} target="_blank" rel="noopener noreferrer" className="collection-link-url">{link.url}</a> : <p className="collection-link-legacy">{t('temporary_links.legacy_link')} <button onClick={() => { document.getElementById('collection-generation')?.scrollIntoView({ behavior: 'smooth' }); document.getElementById('link-duration')?.focus() }}>{t('temporary_links.regenerate')}</button></p>)}
        {link.active && <div className="collection-link-actions">{link.url && <><a href={link.url} target="_blank" rel="noopener noreferrer" className="collection-link-open"><ExternalLink size={15} />{t('temporary_links.open')}</a><button className="collection-link-copy" onClick={() => void copy(link)}><span>{copied === link.id ? <Check size={15} /> : <Clipboard size={15} />}{t(copied === link.id ? 'temporary_links.copied' : 'temporary_links.copy')}</span></button></>}<button className="collection-link-cancel" disabled={busy} onClick={() => void cancel(link.id)}>{t('temporary_links.cancel')}</button></div>}
      </article>)}</div>}
    </section>
  </div>
}
