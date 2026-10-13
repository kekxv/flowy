import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { ArrowRight, CheckCircle2, Clock3, FileText, Info, LoaderCircle, MessageSquare, UploadCloud } from 'lucide-react'
import { getPublicIssueLink, submitPublicIssueLink, uploadPublicIssueLinkAttachment } from '../api/temporaryIssueLinks'
import type { PublicIssueLink } from '../api/temporaryIssueLinks'

export default function PublicIssueLinkPage() {
  const { token = '' } = useParams()
  const { t, i18n } = useTranslation()
  const [meta, setMeta] = useState<PublicIssueLink | null>(null)
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [issueType, setIssueType] = useState('bug')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [attachments, setAttachments] = useState<{ original_name: string; markdown: string }[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const serverOffset = useRef(0)

  useEffect(() => {
    let active = true
    getPublicIssueLink(token).then(data => {
      if (!active) return
      serverOffset.current = data.server_time ? Date.parse(data.server_time) - Date.now() : 0
      setMeta(data)
    }).catch(() => { if (active) setUnavailable(true) })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    if (!meta || done || unavailable) return
    let timer: ReturnType<typeof setTimeout>
    function checkExpiry() {
      clearTimeout(timer)
      const remaining = Date.parse(meta!.expires_at) - (Date.now() + serverOffset.current)
      if (remaining <= 0) setUnavailable(true)
      else timer = setTimeout(checkExpiry, Math.min(remaining, 60_000))
    }
    checkExpiry()
    window.addEventListener('focus', checkExpiry)
    document.addEventListener('visibilitychange', checkExpiry)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', checkExpiry)
      document.removeEventListener('visibilitychange', checkExpiry)
    }
  }, [meta, done, unavailable])

  function linkExpired() {
    if (!meta || unavailable || done) return true
    if (Date.parse(meta.expires_at) <= Date.now() + serverOffset.current) {
      setUnavailable(true)
      return true
    }
    return false
  }

  async function upload(file: File) {
    if (uploading || busy || attachments.length >= 5 || linkExpired()) return
    setUploading(true)
    setError('')
    try {
      const result = await uploadPublicIssueLinkAttachment(token, file)
      setAttachments(items => [...items, result])
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 410) setUnavailable(true)
      else setError('public_issue_link.upload_failed')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || busy || uploading || linkExpired()) return
    setBusy(true)
    setError('')
    try {
      await submitPublicIssueLink(token, {
        title: title.trim(),
        description: [description, ...attachments.map(item => item.markdown)].filter(Boolean).join('\n\n'),
        issue_type: issueType, priority, due_date: dueDate || null,
      })
      setDone(true)
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 410) setUnavailable(true)
      else setError('public_issue_link.submit_failed')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setTitle(''); setDescription(''); setIssueType('bug'); setPriority('medium'); setDueDate(''); setError('')
  }

  const date = (value: string) => new Date(value).toLocaleString(i18n.resolvedLanguage || i18n.language)
  const status = unavailable || done
  return (
    <main className="collection-page">
      <div className="collection-shell">
        <header className="collection-heading">
          <span className="collection-eyebrow">FLOWY · {t('public_issue_link.collection')}</span>
          <h1>{t('public_issue_link.heading_prefix')}<span>{t('public_issue_link.heading_accent')}</span></h1>
          {meta && <div className="collection-meta">
            <span>{t('public_issue_link.created_by')} <strong>{meta.creator_name}</strong></span>
            <span className="collection-expiry"><Clock3 size={16} /> {t('public_issue_link.link_expires_at', { date: date(meta.expires_at) })}</span>
          </div>}
        </header>
        {status ? (
          <section className="collection-card collection-status" role="status">
            {done ? <CheckCircle2 size={44} /> : <Clock3 size={44} />}
            <h2>{t(done ? 'public_issue_link.submitted_title' : 'public_issue_link.unavailable_title')}</h2>
            <p>{t(done ? 'public_issue_link.submitted_body' : 'public_issue_link.unavailable')}</p>
          </section>
        ) : !meta ? (
          <section className="collection-card collection-status" role="status"><LoaderCircle className="animate-spin" size={32} /><p>{t('common.loading')}</p></section>
        ) : (
          <section className="collection-card">
            <div className="collection-card-header">
              <div className="collection-icon"><MessageSquare size={25} /></div>
              <div><h2>{t('public_issue_link.form_title')}</h2><p>{t('public_issue_link.form_hint')}</p></div>
            </div>
            <form onSubmit={submit} onKeyDown={event => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.requestSubmit() }
            }}>
              <fieldset disabled={busy} className="collection-fields">
                <div className="collection-section-title"><span>1</span><h3>{t('public_issue_link.basic_information')}</h3><div /></div>
                <div className="collection-field">
                  <label htmlFor="title">{t('common.title')} <span aria-hidden="true">*</span></label>
                  <input id="title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={500} placeholder={t('issues.title_placeholder')} />
                </div>
                <div className="collection-field">
                  <label htmlFor="description">{t('common.description')}</label>
                  <textarea id="description" value={description} onChange={event => setDescription(event.target.value)} rows={6} maxLength={50000} placeholder={t('public_issue_link.description_placeholder')} />
                </div>
                <div className="collection-field">
                  <label htmlFor="collection-attachment">{t('public_issue_link.attachment')} <small>{t('common.optional')}</small></label>
                  <input ref={fileInput} id="collection-attachment" aria-label={t('public_issue_link.attachment')} type="file" className="sr-only" disabled={uploading || busy || attachments.length >= 5} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file) }} />
                  <button type="button" disabled={uploading || busy || attachments.length >= 5} className={`collection-upload ${dragging ? 'is-dragging' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void upload(file) }}>
                    <span className="collection-upload-icon">{uploading ? <LoaderCircle className="animate-spin" size={25} /> : <UploadCloud size={25} />}</span>
                    <span><strong>{t(uploading ? 'public_issue_link.uploading' : 'public_issue_link.click_upload')}</strong> {!uploading && t('public_issue_link.drop_hint')}</span>
                    <small>{t('public_issue_link.attachment_hint')}</small>
                  </button>
                  {attachments.length > 0 && <ul className="collection-attachments">{attachments.map((item, index) => <li key={index}><FileText size={16} /><span>{item.original_name}</span><CheckCircle2 size={16} /></li>)}</ul>}
                </div>
                <div className="collection-section-title"><span>2</span><h3>{t('public_issue_link.classification')}</h3><div /></div>
                <div className="collection-classification">
                  <div className="collection-field"><label htmlFor="due-date">{t('common.due_date')}</label><input id="due-date" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></div>
                  <div className="collection-field"><label htmlFor="issue-type">{t('issues.type_label')}</label><select id="issue-type" value={issueType} onChange={event => setIssueType(event.target.value)}>{['bug', 'feature'].map(type => <option key={type} value={type}>{t(`issues.type.${type}`)}</option>)}</select></div>
                  <div className="collection-field"><label htmlFor="priority">{t('common.priority')}</label><select id="priority" value={priority} onChange={event => setPriority(event.target.value)}>{['critical', 'high', 'medium', 'low', 'trivial'].map(value => <option key={value} value={value}>{t(`issues.priority.${value}`)}</option>)}</select></div>
                </div>
              </fieldset>
              {error && <p className="collection-error" role="alert">{t(error)}</p>}
              <div className="collection-actions">
                <p>{t('public_issue_link.review_hint')}</p>
                <div><button type="button" className="collection-reset" disabled={busy || uploading} onClick={reset}>{t('public_issue_link.reset')}</button><button disabled={busy || uploading} className="collection-submit" type="submit">{t(busy ? 'public_issue_link.submitting' : 'public_issue_link.submit')} <ArrowRight size={19} /></button></div>
              </div>
            </form>
            <footer className="collection-footer"><span><Info size={16} />{t('public_issue_link.assignment_hint')}</span><span className="collection-shortcut"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> {t('public_issue_link.shortcut')}</span></footer>
          </section>
        )}
      </div>
    </main>
  )
}
