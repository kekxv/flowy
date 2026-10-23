import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink, FileText, Paperclip, Printer, UserRound, X, XCircle } from 'lucide-react'
import type { TestRequest, TestStatus } from '../../api/tests'
import MarkdownContent from '../MarkdownContent'
import { testColors, testDate, getTestLabels } from './testPresentation'

type Report = TestRequest['runs'][number]

function excerpt(text: string, empty: string, chart: string) {
  return (text || empty)
    .replace(/```(?:chart|mermaid)[\s\S]*?```/g, chart)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*`>|~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180)
}

function ReportDetail({ report, index, total, title, printing, error, onClose, onNavigate, onPrint }: {
  report: Report; index: number; total: number; title: string; printing: boolean; error: string
  onClose: () => void; onNavigate: (index: number) => void; onPrint: () => void
}) {
  const { t, i18n } = useTranslation()
  const labels = getTestLabels(t)
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const element = dialog.current
    if (element?.showModal) element.showModal()
    else element?.setAttribute('open', '')
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      if (element?.open && element.close) element.close()
      opener?.focus()
    }
  }, [])
  useEffect(() => { body.current?.scrollTo?.({ top: 0 }) }, [report.id])
  const sections = [[t('test_reports.method'), report.method], [t('test_reports.steps'), report.steps], [t('test_reports.result'), report.result], [t('test_reports.full_report'), report.report || report.result]]
  return <dialog ref={dialog} className="test-report-dialog" aria-labelledby="report-dialog-title" onCancel={event => { event.preventDefault(); if (!printing) onClose() }} onClick={event => { if (!printing && event.target === event.currentTarget) onClose() }}>
    <div className="test-report-dialog-shell">
      <header className="test-report-dialog-header">
        <div className="test-report-dialog-heading"><span className="test-report-dialog-icon"><FileText size={20}/></span><div><p>{t('test_reports.report_position', { number: total - index, total })}</p><h2 id="report-dialog-title">{t('test_reports.report_heading', { version: report.version || t('test_reports.unversioned') })}</h2></div></div>
        <button type="button" className="test-report-icon-button" aria-label={t('test_reports.close_details')} disabled={printing} onClick={onClose}><X size={19}/></button>
      </header>
      <div className="test-report-dialog-body" ref={body}>
        {error && <p role="alert" className="markdown-visual-error">{error}</p>}
        <div className={`test-report-cover ${report.status}`}>
          <div><span className="test-report-eyebrow">TEST REPORT / {String(total - index).padStart(2, '0')}</span><h3>{title}</h3><span className={`chip ${testColors[report.status as TestStatus]}`}>{labels[report.status as TestStatus]}</span></div>
          {report.status === 'passed' ? <CheckCircle2 className="test-report-cover-mark" size={64} strokeWidth={1}/> : <XCircle className="test-report-cover-mark" size={64} strokeWidth={1}/>}
        </div>
        <dl className="test-report-detail-meta">
          <div><dt>{t('test_reports.version')}</dt><dd>{report.version || t('test_reports.unversioned')}</dd></div><div><dt>{t('test_reports.tester')}</dt><dd>{report.tester?.display_name || '—'}</dd></div>
          <div><dt>{t('test_reports.submitted')}</dt><dd>{report.created_at ? new Date(report.created_at).toLocaleString(i18n.resolvedLanguage || i18n.language, { hour12: false }) : '—'}</dd></div><div><dt>{t('test_reports.server')}</dt><dd>{report.server_url || t('test_reports.not_provided')}</dd></div>
        </dl>
        <div className="test-report-detail-sections">{sections.map(([heading, text], sectionIndex) => <section key={heading}>
          <h3><span>{String(sectionIndex + 1).padStart(2, '0')}</span>{heading}</h3>
          <MarkdownContent className="prose prose-sm max-w-none break-words">{text || t('test_reports.not_provided')}</MarkdownContent>
        </section>)}</div>
        {report.attachments?.length > 0 && <section className="test-report-detail-attachments"><h3><Paperclip size={15}/>{t('test_reports.attachments')} <span>{report.attachments.length}</span></h3><div>{report.attachments.map((file: { id: string; url: string; name: string }) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer"><Paperclip size={14}/><span>{file.name}</span><ExternalLink size={12}/></a>)}</div></section>}
      </div>
      <footer className="test-report-dialog-footer"><div><button type="button" className="btn btn-outline btn-sm" aria-label={t('test_reports.newer_report')} disabled={printing || index === 0} onClick={() => onNavigate(index - 1)}><ChevronLeft size={14}/>{t('test_reports.newer')}</button><button type="button" className="btn btn-outline btn-sm" aria-label={t('test_reports.older_report')} disabled={printing || index === total - 1} onClick={() => onNavigate(index + 1)}>{t('test_reports.older')}<ChevronRight size={14}/></button></div><button type="button" className="btn btn-primary btn-sm" disabled={printing} onClick={onPrint}><Printer size={14}/>{printing ? t('test_reports.preparing_print') : t('test_reports.preview_print_report')}</button></footer>
    </div>
  </dialog>
}

export default function TestReportGallery({ item, printing = false, error = '', onPrint }: { item: TestRequest; printing?: boolean; error?: string; onPrint: (id: string) => void }) {
  const { t, i18n } = useTranslation()
  const labels = getTestLabels(t)
  const [openedId, setOpenedId] = useState<string | null>(null)
  const index = item.runs.findIndex(report => report.id === openedId)
  const selected = item.runs[index]
  const open = (report: Report) => { setOpenedId(report.id) }
  return <section role="tabpanel" aria-label={t('test_reports.reports')} className="test-report-gallery">
    <header className="test-report-gallery-heading"><div><h2>{t('test_reports.archive')} <span>{item.runs.length}</span></h2><p>{t('test_reports.archive_description')}</p></div><span className="test-report-sort"><Clock3 size={12}/>{t('test_reports.newest_first')}</span></header>
    {item.runs.length === 0 ? <div className="test-report-gallery-empty"><FileText size={32} strokeWidth={1.3}/><h3>{t('test_reports.awaiting_report')}</h3><p>{t('test_reports.empty_archive')}</p></div> : <div className="test-report-grid">{item.runs.map((report, reportIndex) => <article key={report.id} className={`test-report-card ${report.status}`}>
      <div className="test-report-card-top"><span className={`test-report-card-icon ${report.status}`}>{report.status === 'passed' ? <CheckCircle2 size={20}/> : <XCircle size={20}/>}</span><span className={`chip ${testColors[report.status as TestStatus]}`}>{labels[report.status as TestStatus]}</span></div>
      <div className="test-report-card-title"><h3>{report.version || t('test_reports.unversioned')}</h3>{reportIndex === 0 && <span>{t('test_reports.latest_report')}</span>}</div>
      <p className="test-report-card-sequence">{t('test_reports.report_sequence', { number: item.runs.length - reportIndex })}</p>
      <div className="test-report-card-excerpt"><span>{t('test_reports.result_summary')}</span><p>{excerpt(report.result || report.report, t('test_reports.empty_excerpt'), t('test_reports.chart_placeholder'))}</p></div>
      <div className="test-report-card-meta"><span><UserRound size={12}/>{report.tester?.display_name || '—'}</span><time dateTime={report.created_at}><Clock3 size={12}/>{testDate(report.created_at, i18n.resolvedLanguage || i18n.language)}</time></div>
      <footer><span><Paperclip size={12}/>{t('test_reports.attachment_count', { count: report.attachments?.length || 0 })}</span><button type="button" aria-label={t('test_reports.view_report_version', { version: report.version || t('test_reports.unversioned') })} disabled={printing} onClick={event => { event.currentTarget.focus(); open(report) }}>{t('test_reports.view_report')}<ChevronRight size={14}/></button></footer>
    </article>)}</div>}
    {selected && <ReportDetail report={selected} index={index} total={item.runs.length} title={item.title} printing={printing} error={error} onClose={() => setOpenedId(null)} onNavigate={next => open(item.runs[next])} onPrint={() => onPrint(selected.id)}/>}
  </section>
}
