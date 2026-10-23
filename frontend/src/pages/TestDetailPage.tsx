import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import TestPrintPreview from '../components/tests/TestPrintPreview'
import TestReportGallery from '../components/tests/TestReportGallery'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardCheck, FileText, History, Paperclip, Play, Printer, RefreshCw, UserRound } from 'lucide-react'
import api from '../api/client'
import { addTestRun, assignTest, getTest, transitionTest, type TestRequest, type TestStatus } from '../api/tests'
import TestPrintDocument from '../components/tests/TestPrintDocument'
import PageHeader from '../components/ui/PageHeader'
import MarkdownContent from '../components/MarkdownContent'
import MarkdownEditor from '../components/MarkdownEditor'
import { getTestLabels, testColors, testDate } from '../components/tests/testPresentation'

const blankRun = { version: '', method: '', server_url: '', steps: '', result: '', report: '', status: 'passed' }
function message(error: unknown) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? { message: detail } : error instanceof Error ? { message: error.message } : 'test_pages.operation_failed'
}

export default function TestDetailPage() {
  const { t, i18n } = useTranslation()
  const labels = getTestLabels(t)
  const { id = '' } = useParams()
  const [item, setItem] = useState<TestRequest | null>(null)
  const [testers, setTesters] = useState<{ id: string; display_name: string; username: string }[]>([])
  const [testerId, setTesterId] = useState('')
  const [finishOpen, setFinishOpen] = useState(false)
  const [tab, setTab] = useState('reports')
  const [previewReports, setPreviewReports] = useState<TestRequest['runs'] | null>(null)
  const [paper, setPaper] = useState<'A4' | 'A5'>('A4')
  const [runFiles, setRunFiles] = useState<File[]>([])
  const [run, setRun] = useState(blankRun)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | { message: string }>('')
  const errorMessage = typeof error === 'string' ? t(error) : error.message
  const [inlineUploads, setInlineUploads] = useState(0)
  const uploadActivity = (uploading: boolean) => setInlineUploads(count => count + (uploading ? 1 : -1))
  const [busy, setBusy] = useState(false)
  const [pendingRun, setPendingRun] = useState<string | null>(null)
  const load = useCallback(async () => { const data = await getTest(id); setItem(data); setTesterId(data.tester?.id || '') }, [id, setItem, setTesterId])
  useEffect(() => {
    load().catch(err => setError(message(err)))
    api.get('/tests/testers').then(r => setTesters(r.data)).catch(() => {})
  }, [load])

  useEffect(() => {
    if (finishOpen) document.getElementById('test-completion')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [finishOpen])

  async function act(operation: () => Promise<void>) {
    setBusy(true); setError('')
    try { await operation() } catch (err) { setError(message(err)) } finally { setBusy(false) }
  }
  const move = (status: TestStatus) => act(async () => {
    if (!item) return
    if (status === 'rejected' && !reason.trim()) { setError('test_pages.rejection_required'); return }
    await transitionTest(item.id, status, reason.trim())
    setReason(''); await load()
  })
  const saveAssignment = () => act(async () => { if (item) { await assignTest(item.id, testerId); await load() } })
  const saveRun = (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || inlineUploads > 0) return
    if ([run.version, run.method, run.steps, run.result, run.report].some(value => !value.trim())) { setError('test_pages.run_required'); return }
    void act(async () => {
      if (!item) return
      let runId = pendingRun
      if (!runId) { runId = (await addTestRun(item.id, run)).id; setPendingRun(runId) }
      for (const file of runFiles) {
        const data = new FormData(); data.append('file', file)
        await api.post(`/tests/${item.id}/attachments?run_id=${runId}`, data)
        setRunFiles(files => files.filter(value => value !== file))
      }
      await load(); setTab('reports'); setPendingRun(null); setRun(blankRun); setFinishOpen(false)
    })
  }
  if (!item) return <div className="panel p-8 text-center">{error ? <p role="alert">{errorMessage}</p> : t('test_pages.loading')}</div>
  const printingReports = previewReports || item.runs
  const openPreview = (reports: TestRequest['runs']) => flushSync(() => setPreviewReports([...reports]))
  const transitions = item.available_transitions || []
  const actionLabel = (status: TestStatus) => status === 'queued' ? (['passed', 'failed', 'cancelled'].includes(item.status) ? t('test_pages.retest') : item.status === 'testing' ? t('test_pages.pause_requeue') : t('test_pages.approve')) : status === 'submitted' ? t('test_pages.return_review') : status === 'testing' ? t('test_pages.start') : labels[status]

  return <><div className="page-enter space-y-4 test-detail-screen">
    <Link to="/tests" className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] print:hidden"><ArrowLeft size={13}/>{t('test_pages.back')}</Link>
    <PageHeader icon={ClipboardCheck} title={item.title} subtitle={t('test_pages.requested_at', { date: testDate(item.created_at, i18n.resolvedLanguage || i18n.language) })} actions={<button disabled={!item.runs.length || busy} className="btn btn-outline btn-sm" onClick={() => openPreview(item.runs)}><Printer size={13}/>{t('test_pages.print_all')}</button>}/>
    <section className="test-detail-summary">
      <div><span className="test-summary-caption">{t('test_pages.progress')}</span><span className={`chip ${testColors[item.status]}`}>{labels[item.status]}</span></div>
      <div><span className="test-summary-caption">{t('test_pages.execution')}</span><strong>{item.tester?.display_name || t('test_pages.unassigned')}</strong></div>
      <div><span className="test-summary-caption">{t('test_pages.reports_submitted')}</span><strong>{item.runs.length}<small> {t('test_pages.independent_records')}</small></strong></div>
      <div><span className="test-summary-caption">{t('test_pages.latest_version')}</span><strong>{item.runs[0]?.version || t('test_pages.not_tested')}</strong></div>
    </section>
    {item.status !== 'testing' && item.can_submit_run && <div className="test-report-callout"><div><strong>{t('test_pages.continuous_title')}</strong><p>{t('test_pages.continuous_hint')}</p></div><button disabled={busy || !!pendingRun} className="btn btn-primary btn-sm" onClick={() => setFinishOpen(true)}><FileText size={14}/>{t('test_pages.add_report')}</button></div>}
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 print:hidden">{pendingRun ? t('test_pages.report_attachments_pending') : ''}{errorMessage}</p>}
    {item.status === 'testing' && <section className="panel flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-[var(--primary)] p-4 print:hidden"><div><h2 className="text-sm font-semibold">{t('test_pages.testing')}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{t('test_pages.complete_hint')}</p></div>{item.can_submit_run ? <button disabled={busy} className="btn btn-primary btn-sm" onClick={() => setFinishOpen(true)}><ClipboardCheck size={14}/>{t('test_pages.complete_submit')}</button> : <p className="text-xs text-[var(--text-muted)]">{t('test_pages.complete_permission')}</p>}</section>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px] print:block">
      <div className="min-w-0 space-y-4">
        {item.can_submit_run && finishOpen && <section id="test-completion" className="panel overflow-hidden print:hidden">
          <div className="panel-head"><h2><ClipboardCheck size={14}/>{item.status === 'testing' ? t('test_pages.complete_title') : t('test_pages.add_report')}</h2><button type="button" disabled={busy || inlineUploads > 0 || !!pendingRun} className="btn btn-outline btn-sm" onClick={() => setFinishOpen(false)}>{t('test_pages.collapse_editor')}</button></div>
          <form className="space-y-4 p-5" onSubmit={saveRun}><fieldset disabled={busy || inlineUploads > 0 || !!pendingRun} className="space-y-4">
            <div className="space-y-4"><div><label htmlFor="run-version" className="field-label">{t('test_pages.required_version')}</label><input id="run-version" className="input" required value={run.version} placeholder={t('test_pages.version_placeholder')} onChange={e => setRun(x => ({ ...x, version: e.target.value }))}/></div><div><label htmlFor="run-method" className="field-label">{t('test_pages.required_method')}</label><MarkdownEditor onUploadStateChange={uploadActivity} id="run-method" rows={4} value={run.method} onChange={method => setRun(x => ({ ...x, method }))} placeholder={t('test_pages.method_placeholder')}/></div></div>
            <div><label htmlFor="run-server" className="field-label">{t('test_pages.server_url')}</label><input id="run-server" className="input" value={run.server_url} placeholder="https://test.example.com" onChange={e => setRun(x => ({ ...x, server_url: e.target.value }))}/></div>
            <div><label htmlFor="run-steps" className="field-label">{t('test_pages.required_steps')}</label><MarkdownEditor onUploadStateChange={uploadActivity} id="run-steps" value={run.steps} onChange={steps => setRun(x => ({ ...x, steps }))} placeholder={t('test_pages.steps_placeholder')}/></div>
            <section aria-label={t('test_pages.result_editor')}><label htmlFor="run-result" className="field-label">{t('test_pages.required_result')}</label><MarkdownEditor reportVisuals onUploadStateChange={uploadActivity} id="run-result" rows={8} value={run.result} onChange={result => setRun(x => ({ ...x, result }))} placeholder={t('test_pages.result_placeholder')}/></section>
            <section aria-label={t('test_pages.report_editor')}><label htmlFor="run-report" className="field-label">{t('test_pages.required_report')}</label><MarkdownEditor reportVisuals onUploadStateChange={uploadActivity} id="run-report" rows={10} value={run.report} onChange={report => setRun(x => ({ ...x, report }))} placeholder={t('test_pages.report_placeholder')}/></section>
            <div><label htmlFor="run-files" className="field-label">{t('test_pages.report_files')}</label><input id="run-files" type="file" multiple onChange={e => setRunFiles(Array.from(e.target.files || []).slice(0, 10))}/></div>
            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[var(--border-light)] pt-4"><div><label htmlFor="run-conclusion" className="field-label">{t('test_pages.conclusion')}</label><select id="run-conclusion" className="input w-40" value={run.status} onChange={e => setRun(x => ({ ...x, status: e.target.value }))}><option value="passed">{t('test_pages.success')}</option><option value="failed">{t('test_pages.failure')}</option></select></div></div>
          </fieldset><div className="flex justify-end pt-3"><button className="btn btn-primary btn-sm" disabled={busy || inlineUploads > 0}><FileText size={13}/>{busy ? t('test_pages.submitting') : pendingRun ? t('test_pages.retry_report_attachments') : item.status === 'testing' ? t('test_pages.complete_generate') : t('test_pages.submit_report')}</button></div></form>
        </section>}

        <div role="tablist" aria-label={t('test_pages.details')} className="test-detail-tabs">{([['reports', t('test_pages.reports')], ['application', t('test_pages.application_details')], ['history', t('test_pages.history')]] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}{key === 'reports' && <span>{item.runs.length}</span>}</button>)}</div>
        {tab === 'history' && (<section className="panel overflow-hidden"><div className="panel-head"><h2><History size={14}/>{t('test_pages.history')}</h2></div><div className="max-h-[500px] space-y-4 overflow-auto p-4">{[...item.history].reverse().map((entry, index) => <div key={index} className="border-l-2 border-[var(--border)] pl-3"><p className="text-xs font-medium">{labels[entry.from_status as TestStatus] || t('test_pages.created')} → {labels[entry.to_status as TestStatus]}</p>{entry.reason && <MarkdownContent className="prose prose-sm mt-1 max-w-none break-words text-xs text-[var(--text-muted)]">{entry.reason}</MarkdownContent>}<time className="mt-1 block text-[10px] text-[var(--text-faint)]">{testDate(entry.created_at, i18n.resolvedLanguage || i18n.language)}</time></div>)}{item.history.length === 0 && <p className="text-xs text-[var(--text-muted)]">{t('test_pages.no_history')}</p>}</div></section>)}
        {tab === 'application' && (<section className="panel overflow-hidden" role="tabpanel" aria-label={t('test_pages.application_details')}>
          <div className="panel-head"><h2><FileText size={14}/>{t('test_pages.application_content')}</h2><span className={`chip ${testColors[item.status]}`}>{labels[item.status]}</span></div>
          <div className="space-y-5 p-5">
            <div className="grid gap-4 rounded-lg bg-[var(--bg-muted)] p-4 text-sm sm:grid-cols-3"><div><p className="text-xs text-[var(--text-muted)]">{t('test_pages.reporter')}</p><p className="mt-1 font-medium">{item.reporter?.display_name || '—'}</p></div><div><p className="text-xs text-[var(--text-muted)]">{t('test_pages.execution')}</p><p className="mt-1 font-medium">{item.tester?.display_name || t('test_pages.unassigned')}</p></div><div><p className="text-xs text-[var(--text-muted)]">{t('test_pages.related_issue')}</p><p className="mt-1">{item.issue_id ? <Link className="text-[var(--primary)]" to={`/issues/${item.issue_id}`}>{item.issue_title || item.issue_id}</Link> : t('test_pages.unlinked')}</p></div></div>
            <div><h3 className="mb-2 text-sm font-semibold">{t('test_pages.objective')}</h3><MarkdownContent className="prose prose-sm max-w-none break-words">{item.objective || t('test_pages.not_provided')}</MarkdownContent></div>
            <div><h3 className="mb-2 text-sm font-semibold">{t('test_pages.expected_effect')}</h3><MarkdownContent className="prose prose-sm max-w-none break-words">{item.expected_effect || t('test_pages.not_provided')}</MarkdownContent></div>
            <div className="border-t border-[var(--border-light)] pt-4"><h3 className="mb-2 text-sm font-semibold">{t('test_pages.current_behavior')}</h3><MarkdownContent className="prose prose-sm max-w-none break-words">{item.current_behavior || t('test_pages.not_provided')}</MarkdownContent></div>
            {item.attachments.length > 0 && <div className="flex flex-wrap gap-2 border-t border-[var(--border-light)] pt-3">{item.attachments.map(file => <a key={file.id} href={file.url} className="chip text-[var(--primary)]"><Paperclip size={12}/>{file.name}</a>)}</div>}
            {item.rejection_reason && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t('test_pages.rejection_reason')}<MarkdownContent className="prose prose-sm max-w-none">{item.rejection_reason}</MarkdownContent></div>}
          </div>
        </section>)}
        {tab === 'reports' && <TestReportGallery item={item} printing={busy} error={errorMessage} onPrint={reportId => openPreview(item.runs.filter(report => report.id === reportId))}/>}
      </div>
      <aside className="space-y-4 print:hidden">
        <section className="panel overflow-hidden"><div className="panel-head"><h2><RefreshCw size={14}/>{t('test_pages.status_actions')}</h2></div><div className="space-y-4 p-4"><div className={`chip ${testColors[item.status]}`}>{labels[item.status]}</div><p className="text-xs leading-relaxed text-[var(--text-muted)]">{t('test_pages.retest_hint')}</p>
          {transitions.length > 0 ? <fieldset disabled={busy || inlineUploads > 0 || !!pendingRun} className="space-y-3"><details className="test-operation-reason"><summary>{t('test_pages.operation_details')}</summary><div><label htmlFor="transition-reason" className="field-label">{t('test_pages.operation_reason')}</label><MarkdownEditor onUploadStateChange={uploadActivity} id="transition-reason" rows={3} value={reason} onChange={setReason} placeholder={t('test_pages.reason_placeholder')}/></div></details><div className="flex flex-col gap-2">{transitions.map(status => <button key={status} className={`btn btn-sm justify-center ${status === 'testing' || status === 'queued' ? 'btn-primary' : 'btn-outline'}`} onClick={() => void move(status)}>{status === 'testing' ? <Play size={13}/> : status === 'queued' ? <RefreshCw size={13}/> : null}{actionLabel(status)}</button>)}</div></fieldset> : <p className="text-xs text-[var(--text-muted)]">{t('test_pages.no_actions')}</p>}
        </div></section>
        {item.can_assign && <section className="panel overflow-hidden"><div className="panel-head"><h2><UserRound size={14}/>{t('test_pages.tester')}</h2></div><fieldset disabled={busy || inlineUploads > 0 || !!pendingRun} className="space-y-3 p-4"><label htmlFor="test-assignee" className="field-label">{t('test_pages.assign')}</label><select id="test-assignee" className="input" value={testerId} onChange={e => setTesterId(e.target.value)}><option value="">{t('test_pages.select_tester')}</option>{testers.map(user => <option key={user.id} value={user.id}>{user.display_name || user.username}</option>)}</select><button disabled={!testerId || busy} className="btn btn-outline btn-sm w-full" onClick={() => void saveAssignment()}>{item.status === 'submitted' ? t('test_pages.approve_assign') : t('test_pages.save_tester')}</button><p className="text-xs text-[var(--text-muted)]">{t('test_pages.assignment_hint')}</p></fieldset></section>}

      </aside>
    </div>
  </div><TestPrintDocument item={item} reports={printingReports} paper={paper}/>{previewReports && <TestPrintPreview paper={paper} onPaperChange={setPaper} reportCount={previewReports.length} onClose={() => setPreviewReports(null)}/>}</>
}
