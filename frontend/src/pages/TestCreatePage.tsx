import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardCheck, FileText, Paperclip, Send } from 'lucide-react'
import api from '../api/client'
import { createTest } from '../api/tests'
import PageHeader from '../components/ui/PageHeader'
import MarkdownEditor from '../components/MarkdownEditor'

export default function TestCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', objective: '', expected_effect: '', current_behavior: '', issue_id: '' })
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [inlineUploads, setInlineUploads] = useState(0)
  const uploadActivity = (uploading: boolean) => setInlineUploads(count => count + (uploading ? 1 : -1))
  const [createdId, setCreatedId] = useState<string | null>(null)
  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }))
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || inlineUploads > 0) return
    setBusy(true); setError('')
    let requestId = createdId
    try {
      if (!requestId) { requestId = (await createTest({ ...form, issue_id: form.issue_id || null })).id; setCreatedId(requestId) }
      for (const file of files) {
        const data = new FormData(); data.append('file', file)
        await api.post(`/tests/${requestId}/attachments`, data)
        setFiles(pending => pending.filter(value => value !== file))
      }
      navigate(`/tests/${requestId}`)
    } catch {
      setError(requestId ? 'test_pages.attachments_failed' : 'test_pages.submit_failed')
    } finally { setBusy(false) }
  }
  return <div className="page-enter mx-auto max-w-5xl space-y-4">
    <Link to="/tests" className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]"><ArrowLeft size={13}/>{t('test_pages.back')}</Link>
    <PageHeader icon={ClipboardCheck} title={t('test_pages.create')} subtitle={t('test_pages.create_hint')}/>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{t(error)}{createdId && <Link className="ml-2 underline" to={`/tests/${createdId}`}>{t('test_pages.view_created')}</Link>}</p>}
    <form onSubmit={submit} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <fieldset disabled={busy || inlineUploads > 0 || !!createdId} className="min-w-0 space-y-4">
        <section className="panel overflow-hidden"><div className="panel-head"><h2><FileText size={14}/>{t('test_pages.basic_information')}</h2><span className="chip chip-amber">{t('test_pages.awaiting_review')}</span></div><div className="space-y-4 p-5">
          <div><label htmlFor="new-title" className="field-label">{t('test_pages.required_title')}</label><input id="new-title" className="input" required maxLength={500} placeholder={t('test_pages.title_placeholder')} value={form.title} onChange={e => set('title', e.target.value)}/></div>
          <div><label htmlFor="new-issue" className="field-label">{t('test_pages.optional_issue')}</label><input id="new-issue" className="input" placeholder={t('test_pages.issue_placeholder')} value={form.issue_id} onChange={e => set('issue_id', e.target.value)}/></div>
        </div></section>
        <section className="panel overflow-hidden"><div className="panel-head"><h2><ClipboardCheck size={14}/>{t('test_pages.description')}</h2><span className="text-xs text-[var(--text-muted)]">{t('test_pages.markdown_supported')}</span></div><div className="space-y-5 p-5"><div><label htmlFor="new-objective" className="field-label">{t('test_pages.objective')}</label><MarkdownEditor onUploadStateChange={uploadActivity} id="new-objective" value={form.objective} onChange={value => set('objective', value)} placeholder={t('test_pages.objective_placeholder')}/></div><div><label htmlFor="new-expected" className="field-label">{t('test_pages.expected_effect')}</label><MarkdownEditor onUploadStateChange={uploadActivity} id="new-expected" value={form.expected_effect} onChange={value => set('expected_effect', value)} placeholder={t('test_pages.expected_placeholder')}/></div><div><label htmlFor="new-current" className="field-label">{t('test_pages.current_behavior')}</label><MarkdownEditor onUploadStateChange={uploadActivity} id="new-current" value={form.current_behavior} onChange={value => set('current_behavior', value)} placeholder={t('test_pages.current_placeholder')}/></div></div></section>
        <section className="panel overflow-hidden"><div className="panel-head"><h2><Paperclip size={14}/>{t('test_pages.attachments')}</h2></div><div className="space-y-2 p-5"><label htmlFor="new-files" className="field-label">{t('test_pages.files_ten')}</label><input id="new-files" type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []).slice(0, 10))}/><p className="text-xs text-[var(--text-muted)]">{t('test_pages.files_hint')}</p></div></section>
      </fieldset>
      <aside className="panel space-y-4 p-5 lg:sticky lg:top-4"><h2 className="text-sm font-semibold">{t('test_pages.workflow')}</h2><ol className="space-y-4 text-xs text-[var(--text-muted)]">{[t('test_pages.submit_request'), t('test_pages.workflow_review'), t('test_pages.workflow_execute'), t('test_pages.workflow_report')].map((step, index) => <li className="flex items-center gap-2" key={step}><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--primary-subtle)] text-[var(--primary)]">{index + 1}</span>{step}</li>)}</ol><div className="border-t border-[var(--border-light)] pt-4"><button disabled={busy || inlineUploads > 0} type="submit" className="btn btn-primary btn-sm w-full"><Send size={13}/>{busy ? t('test_pages.submitting') : createdId ? t('test_pages.retry_attachments') : t('test_pages.submit_request')}</button><p className="mt-3 text-[11px] leading-relaxed text-[var(--text-faint)]">{t('test_pages.independent_hint')}</p></div></aside>
    </form>
  </div>
}
