import { useTranslation } from 'react-i18next'
import type { TestRequest, TestStatus } from '../../api/tests'
import MarkdownContent from '../MarkdownContent'
import { getTestLabels } from './testPresentation'

function fullDate(value: string | undefined, locale: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale, { hour12: false })
}

export default function TestPrintDocument({ item, reports, paper }: { item: TestRequest; reports: TestRequest['runs']; paper: 'A4' | 'A5' }) {
  const { t, i18n } = useTranslation()
  const labels = getTestLabels(t)
  return <div aria-hidden="true" data-testid="print-document" className={`test-print-root report-${paper.toLowerCase()}`}>
    <article className="test-print-document test-print-application">
      <header className="test-print-header"><span>FLOWY / QUALITY ASSURANCE</span><strong>{t('test_pages.application_details')}</strong></header>
      <div className="test-print-title"><p>TEST APPLICATION</p><h1>{item.title}</h1><span className={`test-print-verdict ${item.status}`}>{labels[item.status as TestStatus] || item.status}</span></div>
      <dl className="test-print-meta">
        <div><dt>{t('test_reports.reporter')}</dt><dd>{item.reporter?.display_name || '—'}</dd></div><div><dt>{t('test_reports.tester')}</dt><dd>{item.tester?.display_name || '—'}</dd></div>
        <div><dt>{t('test_reports.submitted')}</dt><dd>{fullDate(item.created_at, i18n.resolvedLanguage || i18n.language)}</dd></div><div><dt>{t('test_pages.reports_submitted')}</dt><dd>{reports.length}</dd></div>
      </dl>
      {[
        [t('test_reports.objective'), item.objective], [t('test_reports.expected_effect'), item.expected_effect], [t('test_reports.current_behavior'), item.current_behavior],
      ].map(([title, text], index) => <section key={title} className="test-print-section"><h2><span>{String(index + 1).padStart(2, '0')}</span>{title}</h2><MarkdownContent className="prose prose-sm max-w-none">{text || t('test_reports.not_provided')}</MarkdownContent></section>)}
      <footer className="test-print-footer"><span>{t('test_reports.management_brand')}</span><span>{t('test_reports.report_footer')}</span></footer>
    </article>
    {reports.map(report => <article key={report.id} className="test-print-document test-print-report">
      <header className="test-print-header"><span>FLOWY / QUALITY ASSURANCE</span><strong>{t('test_reports.reports')}</strong></header>
      <div className="test-print-title"><p>TEST REPORT · {report.version}</p><h1>{item.title}</h1><span className={`test-print-verdict ${report.status}`}>{labels[report.status as TestStatus]}</span></div>
      <dl className="test-print-meta">
        <div><dt>{t('test_reports.version')}</dt><dd>{report.version || '—'}</dd></div><div><dt>{t('test_reports.tester')}</dt><dd>{report.tester?.display_name || '—'}</dd></div>
        <div><dt>{t('test_reports.reporter')}</dt><dd>{item.reporter?.display_name || '—'}</dd></div><div><dt>{t('test_reports.submitted')}</dt><dd>{fullDate(report.created_at, i18n.resolvedLanguage || i18n.language)}</dd></div>
        <div className="wide"><dt>{t('test_reports.server')}</dt><dd>{report.server_url || t('test_reports.not_provided')}</dd></div>
        <div className="wide test-print-meta-id"><dt>{t('test_reports.report_id')}</dt><dd>{report.id}</dd></div>
      </dl>
      {[
        [t('test_reports.method'), report.method], [t('test_reports.steps'), report.steps], [t('test_reports.result'), report.result], [t('test_reports.full_report'), report.report || report.result],
      ].map(([title, text], index) => <section key={title} className="test-print-section"><h2><span>{String(index + 1).padStart(2, '0')}</span>{title}</h2><MarkdownContent className="prose prose-sm max-w-none">{text || t('test_reports.not_provided')}</MarkdownContent></section>)}
      {report.attachments?.length > 0 && <section className="test-print-section"><h2><span>05</span>{t('test_reports.attachments')}</h2><ul>{report.attachments.map((file: { id: string; url: string; name: string }) => <li key={file.id}><a href={file.url}>{file.name}</a></li>)}</ul></section>}
      <footer className="test-print-footer"><span>{t('test_reports.management_brand')}</span><span>{t('test_reports.report_footer')}</span></footer>
    </article>)}
  </div>
}
