import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import MarkdownEditor from '../components/MarkdownEditor'
import api from '../api/client'

function isGone(error: unknown) {
  return (error as { response?: { status?: number } })?.response?.status === 410
}

export default function PublicTestCollectionPage() {
  const { t, i18n } = useTranslation()
  const { token = '' } = useParams()
  const [form, setForm] = useState({ title: '', objective: '', expected_effect: '', current_behavior: '', issue_id: '' })
  const [files, setFiles] = useState<File[]>([])
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [uploadLimit, setUploadLimit] = useState(5)
  const [inlineUploads, setInlineUploads] = useState(0)
  const deadline = useRef(0)
  const base = `/public/test-collections/${encodeURIComponent(token)}`

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    setLoading(true)
    setUnavailable(false)
    setError('')
    deadline.current = 0
    const check = () => {
      if (!deadline.current || !active) return
      const remaining = deadline.current - Date.now()
      if (remaining <= 0) setUnavailable(true)
      else {
        clearTimeout(timer)
        timer = setTimeout(check, Math.min(remaining, 60000))
      }
    }
    api.get(base).then(({ data }) => {
      if (!active) return
      setExpiresAt(data.expires_at)
      if (data.max_file_size > 0) setUploadLimit(data.max_file_size / (1024 * 1024))
      const serverNow = data.server_time ? Date.parse(data.server_time) : Date.now()
      deadline.current = Date.now() + Date.parse(data.expires_at) - serverNow
      check()
    }).catch(err => {
      if (!active) return
      if (isGone(err)) setUnavailable(true)
      else setError('test_pages.load_failed')
    }).finally(() => { if (active) setLoading(false) })
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => { active = false; clearTimeout(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [base])

  const set = (key: string, value: string) => setForm(x => ({ ...x, [key]: value }))
  function checkActive() {
    if (!deadline.current || Date.now() >= deadline.current) {
      setUnavailable(true)
      return false
    }
    return true
  }
  async function uploadInline(file: File) {
    if (!checkActive()) throw new Error(t('test_pages.link_expired'))
    setInlineUploads(count => count + 1)
    try {
      const formData = new FormData(); formData.append('file', file)
      const { data } = await api.post(`${base}/attachments`, formData)
      const label = String(data.name || file.name).replace(/[\\[\]]/g, '\\$&')
      return `${data.content_type?.startsWith('image/') ? '!' : ''}[${label}](${data.url})`
    } catch (err) {
      if (isGone(err)) setUnavailable(true)
      throw err
    } finally { setInlineUploads(count => count - 1) }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || inlineUploads > 0 || !checkActive()) return
    setBusy(true)
    setError('')
    try {
      for (const file of files) {
        if (!checkActive()) return
        const data = new FormData()
        data.append('file', file)
        await api.post(`${base}/attachments`, data)
        setFiles(pending => pending.filter(item => item !== file))
      }
      // Successfully uploaded files are staged on the link; retries must not upload them again.
      setFiles([])
      if (!checkActive()) return
      await api.post(`${base}/submit`, { ...form, issue_id: form.issue_id || null })
      setDone(true)
    } catch (err) {
      if (isGone(err)) setUnavailable(true)
      else setError('test_pages.public_submit_failed')
    } finally {
      setBusy(false)
    }
  }

  if (done) return <main className="mx-auto max-w-2xl p-8 text-center"><h1 className="text-2xl font-semibold">{t('test_pages.submitted')}</h1><p className="mt-2">{t('test_pages.submitted_hint')}</p></main>
  if (unavailable) return <main className="mx-auto max-w-2xl p-8 text-center"><h1 className="text-2xl font-semibold">{t('test_pages.link_expired')}</h1><p className="mt-2">{t('test_pages.link_expired_hint')}</p></main>
  if (loading) return <main className="p-8 text-center">{t('test_pages.loading')}</main>
  return <main className="mx-auto max-w-2xl space-y-4 p-5">
    <h1 className="text-xl font-semibold">{t('test_pages.collection_title')}</h1>
    {expiresAt && <p className="text-xs text-[var(--text-muted)]">{t('test_pages.expires_at', { date: new Date(expiresAt).toLocaleString(i18n.resolvedLanguage || i18n.language) })}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{t(error)}</p>}
    <form className="panel space-y-4 p-5" onSubmit={submit}>
      <fieldset disabled={busy || inlineUploads > 0 || !expiresAt} className="space-y-4">
        <div><label htmlFor="test-title" className="field-label">{t('test_pages.required_title')}</label><input id="test-title" className="input" required value={form.title} onChange={e => set('title', e.target.value)}/></div>
        <div><label htmlFor="test-objective" className="field-label">{t('test_pages.objective')}</label><MarkdownEditor id="test-objective" value={form.objective} onChange={value => set('objective', value)} uploadFile={uploadInline} uploadLimitMb={uploadLimit} placeholder={t('test_pages.public_objective_placeholder')}/></div>
        <div><label htmlFor="test-issue" className="field-label">{t('test_pages.public_optional_issue')}</label><input id="test-issue" className="input" value={form.issue_id} onChange={e => set('issue_id', e.target.value)}/></div>
        <div><label htmlFor="test-expected" className="field-label">{t('test_pages.expected_effect')}</label><MarkdownEditor id="test-expected" value={form.expected_effect} onChange={value => set('expected_effect', value)} uploadFile={uploadInline} uploadLimitMb={uploadLimit}/></div>
        <div><label htmlFor="test-current" className="field-label">{t('test_pages.current_behavior')}</label><MarkdownEditor id="test-current" value={form.current_behavior} onChange={value => set('current_behavior', value)} uploadFile={uploadInline} uploadLimitMb={uploadLimit}/></div>
        <div><label htmlFor="test-files" className="field-label">{t('test_pages.files_five')}</label><input id="test-files" type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []).slice(0, 5))}/><p className="text-xs text-[var(--text-muted)]">{t('test_pages.public_files_hint')}</p></div>
        <button disabled={busy || inlineUploads > 0 || !expiresAt} className="btn btn-primary">{busy ? t('test_pages.submitting') : t('test_pages.public_submit')}</button>
      </fieldset>
    </form>
  </main>
}
