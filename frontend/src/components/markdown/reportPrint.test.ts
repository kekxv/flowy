import { expect, it, vi } from 'vitest'
import { waitForReportVisuals } from './reportPrint'

it('waits for pending figures before allowing report printing', async () => {
  const root = document.createElement('div')
  root.innerHTML = '<figure data-visual-state="loading"></figure>'
  document.body.append(root)
  const ready = vi.fn()
  const waiting = waitForReportVisuals(root).then(ready)
  await Promise.resolve()
  expect(ready).not.toHaveBeenCalled()
  root.firstElementChild!.setAttribute('data-visual-state', 'ready')
  await waiting
  expect(ready).toHaveBeenCalledOnce()
  root.remove()
})
it('allows printing readable source when a diagram failed to render', async () => {
  const root = document.createElement('div')
  root.innerHTML = '<figure data-visual-state="error"><pre>source</pre></figure>'
  await expect(waitForReportVisuals(root)).resolves.toBeUndefined()
})

it('cancels pending figure preparation when the preview closes', async () => {
  const root = document.createElement('div')
  root.innerHTML = '<figure data-visual-state="loading"></figure>'
  const controller = new AbortController()
  const waiting = waitForReportVisuals(root, 30000, controller.signal)
  controller.abort()
  await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
})
