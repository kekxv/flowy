import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2 } from 'lucide-react'
import { createTemporaryIssueLink } from '../../api/temporaryIssueLinks'
import { createTestCollection } from '../../api/tests'

export default function CollectionLinkGenerator({ kind }: { kind: 'issue' | 'test' }) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const [minutes, setMinutes] = useState(1440)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(null)

  async function generate() {
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      setLink(await (kind === 'test' ? createTestCollection(minutes) : createTemporaryIssueLink(minutes)))
    } catch {
      setError('temporary_links.create_failed')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch {
      setError('temporary_links.copy_failed')
    }
  }

  return <section className="panel space-y-3 p-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm font-semibold">{t('temporary_links.create_title')}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{t(`temporary_links.${kind}_hint`)}</p></div>
      <div className="collection-link-generator-controls">
        <div><label htmlFor={id} className="field-label">{t('temporary_links.expires_in')}</label>
          <select id={id} value={minutes} disabled={busy} onChange={event => setMinutes(Number(event.target.value))} className="input">
            <option value={30}>{t('temporary_links.minutes', { count: 30 })}</option>
            <option value={360}>{t('temporary_links.hours', { count: 6 })}</option>
            <option value={1440}>{t('temporary_links.hours', { count: 24 })}</option>
            <option value={10080}>{t('temporary_links.days', { count: 7 })}</option>
          </select></div>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void generate()}><Link2 size={13}/>{t('temporary_links.generate')}</button>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{t(error)}</p>}
    {link && <div className="space-y-2 border-t border-[var(--border-light)] pt-3">
      <p className="text-xs text-[var(--text-muted)]">{t('temporary_links.expires_at', { date: new Date(link.expires_at).toLocaleString(i18n.resolvedLanguage || i18n.language) })}</p>
      <div className="flex flex-wrap items-center gap-2"><a className="min-w-0 flex-1 break-all text-xs text-[var(--primary)]" href={link.url} target="_blank" rel="noopener noreferrer">{link.url}</a><button className="btn btn-ghost btn-sm" onClick={() => void copy()}>{t(copied ? 'temporary_links.copied' : 'temporary_links.copy')}</button></div>
    </div>}
  </section>
}
