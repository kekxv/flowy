import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, ChevronRight, Clock3, FileText, LoaderCircle, X, XCircle } from 'lucide-react'
import { getPublicBotDetail, type PublicBotDetail } from '../api/temporaryBotDetails'
import MarkdownContent from '../components/MarkdownContent'
import IssueListDashboard from '../components/IssueListDashboard'
import { parseIssueListDashboard } from '../components/IssueListDashboardData'

export default function PublicBotDetailPage() {
  const { token = '' } = useParams()
  return <BotDetailContent key={token} token={token} />
}

function BotDetailContent({ token }: { token: string }) {
  const [detail, setDetail] = useState<PublicBotDetail | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [selectedReport, setSelectedReport] = useState<number | null>(null)
  const reportDialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    let active = true
    getPublicBotDetail(token).then(value => { if (active) setDetail(value) }).catch(() => { if (active) setUnavailable(true) })
    return () => { active = false }
  }, [token])

  const date = detail ? new Date(detail.expires_at).toLocaleString() : ''
  const displayTitle = detail?.title.replace(/\s*#[0-9a-f]{8}\b/i, '') || '详情查看'
  const content = detail?.content || ''
  const isTestDetail = content.startsWith('<!-- flowy-test-detail -->\n') || content.startsWith('## 测试申请\n\n### 测试申请')
  const pages = isTestDetail ? content.replace(/^<!-- flowy-test-detail -->\n/, '').split(/\n(?=## 测试报告)/) : [content]
  const reports = pages.length > 1 ? pages.slice(1).join('\n').split(/\n(?=### 报告 )/).filter(report => /^### 报告 /.test(report.trim())) : []
  const parsedDashboard = detail ? parseIssueListDashboard(detail.content) : { dashboard: null, markdown: '' }
  const application = (pages.length > 1 ? pages[0] ?? '' : parsedDashboard.markdown).replace(/(测试申请)\s*#[0-9a-f]{8}\b/ig, '$1')
  const reportData = reports.map((report, index) => {
    const heading = report.match(/^###\s+([^\n]+)/)?.[1] || `报告 ${index + 1}`
    const body = report.replace(/^###\s+[^\n]+\n?/, '')
    const excerpt = body.replace(/```[\s\S]*?```/g, '').replace(/[#*_>`|()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
    const failed = /失败|未通过/.test(heading)
    return { heading, body, excerpt, failed }
  })

  useEffect(() => {
    if (selectedReport === null) return
    const dialog = reportDialog.current
    if (dialog?.showModal) dialog.showModal()
    else dialog?.setAttribute('open', '')
    return () => { if (dialog?.open && dialog.close) dialog.close() }
  }, [selectedReport])

  return <main className="bot-detail-page">
    <div className="bot-detail-shell">
      <header className="bot-detail-topbar"><div className="bot-detail-brand"><span className="bot-detail-brand-mark"><FileText size={14} /></span><span>FLOWY</span><i /> <span>机器人详情</span></div>{detail && <span className="bot-detail-expiry"><Clock3 size={14} /> 有效至 {date}</span>}</header>
      {unavailable ? <section className="bot-detail-state"><span className="bot-detail-state-icon"><Clock3 size={25} /></span><h1>链接已失效</h1><p>该临时详情链接已过期，请重新查询。</p></section>
        : !detail ? <section className="bot-detail-state"><LoaderCircle className="animate-spin" size={28} /><p>加载中…</p></section>
        : <>
          <header className="bot-detail-hero"><p className="bot-detail-kicker">DETAIL</p><h1>{displayTitle}</h1><div className="bot-detail-summary">{detail.summary}</div></header>
          <div className="bot-detail-pages">
            <article className="bot-detail-card">{parsedDashboard.dashboard ? <IssueListDashboard data={parsedDashboard.dashboard} /> : <MarkdownContent className="bot-detail-prose" children={application || '暂无内容'} />}</article>
            {pages.length > 1 && reportData.length === 0 && <section className="bot-detail-reports"><MarkdownContent className="bot-detail-prose" children={pages.slice(1).join('\n')} /></section>}
            {reportData.length > 0 && <section className="bot-detail-reports"><div className="bot-detail-reports-heading"><div><p className="bot-detail-kicker">REPORTS</p><h2>报告档案 <span>{reportData.length}</span></h2><p>每次验证独立留档，点击卡片查看完整测试过程与报告。</p></div><span>按最新提交在前</span></div><div className="test-report-grid bot-detail-report-grid">{reportData.map((report, index) => <article key={index} className={`test-report-card ${report.failed ? 'failed' : 'passed'}`}><div className="test-report-card-top"><span className={`test-report-card-icon ${report.failed ? 'failed' : ''}`}>{report.failed ? <XCircle size={20} /> : <CheckCircle2 size={20} />}</span><span className={`chip ${report.failed ? 'chip-red' : 'chip-green'}`}>{report.failed ? '测试失败' : '测试成功'}</span></div><div className="test-report-card-title"><h3>{report.heading.replace(/\s*#[0-9a-f]{8}\b/ig, '')}</h3>{index === 0 && <span>最新报告</span>}</div><p className="test-report-card-sequence">第 {reportData.length - index} 份测试报告</p><div className="test-report-card-excerpt"><span>结果摘要</span><p>{report.excerpt || '暂无结果摘要'}</p></div><footer><span>报告 {String(index + 1).padStart(2, '0')}</span><button type="button" onClick={() => setSelectedReport(index)}>查看报告 <ChevronRight size={14} /></button></footer></article>)}</div></section>}
          </div>
          <footer className="bot-detail-footer">此页面由 Flowy 机器人生成 · 链接到期后自动失效</footer>
          {selectedReport !== null && reportData[selectedReport] && <dialog ref={reportDialog} className="test-report-dialog public-bot-report-dialog" aria-labelledby="public-bot-report-title" onCancel={() => setSelectedReport(null)}><div className="test-report-dialog-shell"><header className="test-report-dialog-header"><div className="test-report-dialog-heading"><span className="test-report-dialog-icon"><FileText size={20} /></span><div><p>测试报告详情</p><h2 id="public-bot-report-title">{reportData[selectedReport].heading}</h2></div></div><button type="button" className="test-report-icon-button" aria-label="关闭报告详情" onClick={() => setSelectedReport(null)}><X size={19} /></button></header><div className="test-report-dialog-body"><div className={`test-report-cover ${reportData[selectedReport].failed ? 'failed' : ''}`}><div><span className="test-report-eyebrow">TEST REPORT / {String(selectedReport + 1).padStart(2, '0')}</span><h3>{displayTitle}</h3></div>{reportData[selectedReport].failed ? <XCircle className="test-report-cover-mark" size={64} strokeWidth={1} /> : <CheckCircle2 className="test-report-cover-mark" size={64} strokeWidth={1} />}</div><div className="test-report-detail-sections"><section><MarkdownContent className="prose prose-sm max-w-none break-words" children={reportData[selectedReport].body} /></section></div></div></div></dialog>}
        </>}
    </div>
  </main>
}
