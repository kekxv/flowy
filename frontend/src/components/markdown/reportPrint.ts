import i18n from '../../i18n'

export function waitForReportVisuals(root: Element, timeout = 30000, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const pending = () => root.querySelector('[data-visual-state="loading"]')
    if (signal?.aborted) { reject(new DOMException('Preview cancelled', 'AbortError')); return }
    if (!pending()) { resolve(); return }
    const cleanup = () => { observer.disconnect(); clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
    const cancel = () => { cleanup(); reject(new DOMException('Preview cancelled', 'AbortError')) }
    const observer = new MutationObserver(() => { if (!pending()) { cleanup(); resolve() } })
    const timer = setTimeout(() => { cleanup(); reject(new Error(i18n.t('visuals.wait_timeout'))) }, timeout)
    signal?.addEventListener('abort', cancel, { once: true })
    observer.observe(root, { subtree: true, attributes: true, childList: true })
  })
}

export async function printReport() {
  const root = document.querySelector('.test-print-root')
  if (root) await waitForReportVisuals(root)
  if (document.fonts?.ready) await document.fonts.ready
  window.print()
}
