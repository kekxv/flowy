import i18n from '../../i18n'
import pagedScriptUrl from '../../../node_modules/pagedjs/dist/paged.js?url'
import { waitForReportVisuals } from '../markdown/reportPrint'
import { reportPreviewStyles } from './reportPreviewStyles'

export interface PreviewSize { pages: number; width: number; height: number }

function abortable<T>(promise: Promise<T>, signal: AbortSignal, timeout = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown, value?: T) => {
      clearTimeout(timer); signal.removeEventListener('abort', cancel)
      if (error) reject(error); else resolve(value as T)
    }
    const cancel = () => finish(new DOMException('Preview cancelled', 'AbortError'))
    const timer = setTimeout(() => finish(new Error(i18n.t('test_reports.preview_timeout'))), timeout)
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
    promise.then(value => finish(undefined, value), error => finish(error))
  })
}

export async function buildReportPreview(frame: HTMLIFrameElement, source: Element, paper: 'A4' | 'A5', signal: AbortSignal, locale = i18n.resolvedLanguage || i18n.language): Promise<PreviewSize> {
  await waitForReportVisuals(source, 30000, signal)
  if (document.fonts?.ready) await abortable(document.fonts.ready, signal)
  signal.throwIfAborted()
  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute('aria-hidden')
  clone.removeAttribute('data-testid')
  for (const element of clone.querySelectorAll('[src],a[href]')) {
    const attribute = element.hasAttribute('src') ? 'src' : 'href'
    const value = element.getAttribute(attribute)
    if (value && !value.startsWith('#')) element.setAttribute(attribute, new URL(value, document.baseURI).href)
    if (element.tagName === 'A') { element.setAttribute('target', '_blank'); element.setAttribute('rel', 'noopener noreferrer') }
  }
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) throw new Error(i18n.t('test_reports.preview_unavailable'))
  doc.open()
  doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body><main id="pages"></main></body></html>')
  doc.close()
  doc.documentElement.lang = locale
  doc.title = i18n.t('test_reports.document_title')
  const script = doc.createElement('script')
  script.src = new URL(pagedScriptUrl, document.baseURI).href
  const loaded = new Promise<void>((resolve, reject) => { script.onload = () => resolve(); script.onerror = () => reject(new Error(i18n.t('test_reports.pagination_load_failed'))) })
  doc.head.append(script)
  await abortable(loaded, signal)
  signal.throwIfAborted()
  const temporary = doc.createElement('div')
  temporary.style.cssText = 'position:absolute;left:-10000px;width:800px'
  temporary.append(clone)
  doc.body.append(temporary)
  await abortable(Promise.all(Array.from(clone.querySelectorAll('img')).map(img => img.decode().catch(() => { throw new Error(i18n.t('test_reports.image_load_failed')) }))), signal)
  temporary.remove()
  type PagedWindow = Window & { Paged: { Previewer: new () => { preview: (html: string, styles: Record<string, string>[], target: Element) => Promise<{ total: number }> } } }
  const previewer = new (win as PagedWindow).Paged.Previewer()
  const flow = await abortable(previewer.preview(clone.outerHTML, [{ [document.baseURI]: reportPreviewStyles(paper) }], doc.getElementById('pages')!), signal)
  signal.throwIfAborted()
  // Paged.js has already included the paper margins inside each sheet. Print
  // those exact sheets at 100%, independently of the preview's display zoom.
  const finishStyles = doc.createElement('style')
  finishStyles.textContent = `html,body{margin:0!important;padding:0!important}.pagedjs_page{margin:0 auto 20px;box-shadow:0 2px 8px #0f172a20} @media print{@page{size:${paper};margin:0!important}.pagedjs_page{margin:0!important;box-shadow:none!important;break-after:page}.pagedjs_page:last-child{break-after:auto}body{background:white!important}}`
  doc.head.append(finishStyles)
  const first = doc.querySelector('.pagedjs_page')
  if (!first || !flow.total) throw new Error(i18n.t('test_reports.no_pages'))
  return { pages: flow.total, width: first.getBoundingClientRect().width, height: Math.ceil(doc.getElementById('pages')!.getBoundingClientRect().height) }
}
