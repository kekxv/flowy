import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus, Printer, X } from 'lucide-react'
import { buildReportPreview, type PreviewSize } from './buildReportPreview'

export default function TestPrintPreview({ paper, onPaperChange, reportCount, onClose }: {
  paper: 'A4' | 'A5'; onPaperChange: (paper: 'A4' | 'A5') => void; reportCount: number; onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language
  const dialog = useRef<HTMLDialogElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const [result, setResult] = useState<(PreviewSize & { paper: string; attempt: number; locale: string }) | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [zoom, setZoom] = useState<number | null>(null)
  const [viewportWidth, setViewportWidth] = useState(1000)
  const [printing, setPrinting] = useState(false)
  const ready = result?.paper === paper && result.attempt === attempt && result.locale === locale
  const width = ready ? result.width : paper === 'A4' ? 794 : 560
  const scale = zoom ?? Math.max(.25, Math.min(1, (viewportWidth - 48) / width))
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const element = dialog.current
    if (element?.showModal) element.showModal(); else element?.setAttribute('open', '')
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous; if (element?.open && element.close) element.close(); opener?.focus() }
  }, [])
  useEffect(() => {
    const update = () => setViewportWidth(viewport.current?.clientWidth || 1000)
    update()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (viewport.current) observer?.observe(viewport.current)
    return () => observer?.disconnect()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const source = document.querySelector('.test-print-root')
    const target = frame.current
    if (source && target) {
      buildReportPreview(target, source, paper, controller.signal, locale)
        .then(size => { if (!controller.signal.aborted) { setError(''); setResult({ ...size, paper, attempt, locale }) } })
        .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : t('test_reports.preview_failed')) })
    }
    return () => controller.abort()
  }, [paper, attempt, locale, t])
  const changePaper = (value: 'A4' | 'A5') => { setResult(null); setError(''); onPaperChange(value) }
  const print = () => {
    if (!ready || printing) return
    setPrinting(true)
    try { frame.current?.contentWindow?.print() } catch { setError(t('test_reports.print_failed')) } finally { setPrinting(false) }
  }
  return <dialog ref={dialog} className="test-print-preview" aria-labelledby="print-preview-title" onCancel={event => { event.preventDefault(); if (!printing) onClose() }}>
    <div className="test-print-preview-shell">
      <header className="test-print-preview-header"><div><span className="test-print-preview-icon"><Printer size={19}/></span><div><h2 id="print-preview-title">{t('test_reports.preview')}</h2><p>{ready ? t('test_reports.preview_count_ready', { count: reportCount, pages: result.pages }) : t('test_reports.preview_count_loading', { count: reportCount })}</p></div></div><button type="button" className="test-report-icon-button" disabled={printing} aria-label={t('test_reports.close_preview')} onClick={onClose}><X size={20}/></button></header>
      <div className="test-print-preview-toolbar">
        <label>{t('test_reports.paper')}<select aria-label={t('test_reports.preview_paper')} value={paper} disabled={printing} onChange={event => changePaper(event.target.value as 'A4' | 'A5')}><option>A4</option><option>A5</option></select></label>
        <div className="test-preview-zoom"><button type="button" aria-label={t('test_reports.zoom_out')} onClick={() => setZoom(Math.max(.25, Math.round((scale - .25) * 100) / 100))} disabled={scale <= .25}><Minus size={15}/></button><select aria-label={t('test_reports.zoom_ratio')} value={scale} onChange={event => setZoom(Number(event.target.value))}>{[...new Set([scale, .25, .5, .75, 1, 1.25, 1.5, 2, 3])].sort((a,b) => a-b).map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}</select><button type="button" aria-label={t('test_reports.zoom_in')} onClick={() => setZoom(Math.min(3, Math.round((scale + .25) * 100) / 100))} disabled={scale >= 3}><Plus size={15}/></button></div>
        <button type="button" className="test-preview-fit" onClick={() => setZoom(null)}><Maximize2 size={13}/>{t('test_reports.fit_width')}</button>
        <span>{t('test_reports.zoom_hint')}</span>
      </div>
      <div className="test-print-preview-viewport" ref={viewport} aria-busy={!ready && !error}>
        {!ready && !error && <div role="status" className="test-print-preview-status">{t('test_reports.generating')}</div>}
        {error && <div className="test-print-preview-status"><p role="alert">{error}</p><button type="button" className="btn btn-outline btn-sm" onClick={() => { setError(''); setAttempt(value => value + 1) }}>{t('test_reports.regenerate')}</button></div>}
        <div className="test-print-preview-canvas" style={{ width: width * scale, height: (ready ? result.height : 1100) * scale, opacity: ready ? 1 : 0 }}>
          <iframe key={`${paper}:${attempt}:${locale}`} ref={frame} lang={locale} title={t('test_reports.iframe_title')} scrolling="no" sandbox="allow-same-origin allow-scripts allow-modals allow-popups" style={{ width, height: ready ? result.height : 1100, transform: `scale(${scale})` }}/>
        </div>
      </div>
      <footer className="test-print-preview-footer"><p>{t('test_reports.check_before_print')}</p><button type="button" className="btn btn-primary btn-sm" disabled={!ready || !!error || printing} onClick={print}><Printer size={14}/>{t('test_reports.confirm_print')}</button></footer>
    </div>
  </dialog>
}
