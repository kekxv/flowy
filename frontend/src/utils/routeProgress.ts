/**
 * Route transition progress store (framework-agnostic singleton).
 *
 * The bar starts immediately on a link click (before React Router commits the
 * navigation) and completes when the new route has actually rendered, so a slow
 * lazy chunk or a paused transition always shows visible feedback.
 */
type Listener = (state: { active: boolean; value: number }) => void;

let active = false;
let value = 0;
let held = false;
let startedAt = 0;
const tickTimers: Array<ReturnType<typeof setTimeout>> = [];
let watchdog: ReturnType<typeof setTimeout> | null = null;
let finishTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

export function subscribeRouteProgress(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emit() {
  listeners.forEach(listener => listener({ active, value }));
}

function clearTimers() {
  tickTimers.splice(0).forEach(clearTimeout);
  if (watchdog) { clearTimeout(watchdog); watchdog = null; }
  if (finishTimer) { clearTimeout(finishTimer); finishTimer = null; }
}

export function beginRouteProgress() {
  if (active) return;
  clearTimers();
  active = true;
  value = 12;
  startedAt = Date.now();
  emit();
  tickTimers.push(setTimeout(() => { if (value < 45) { value = 45; emit(); } }, 140));
  tickTimers.push(setTimeout(() => { if (value < 72) { value = 72; emit(); } }, 420));
  tickTimers.push(setTimeout(() => { if (value < 88) { value = 88; emit(); } }, 1200));
  tickTimers.push(setTimeout(() => { if (value < 96) { value = 96; emit(); } }, 4000));
  // Safety net: never leave the bar stuck forever.
  watchdog = setTimeout(() => finishRouteProgress(), 15000);
}

/** Keeps the bar running while a Suspense fallback is on screen. */
export function holdRouteProgress() {
  held = true;
  clearTimers();
  if (!active) {
    active = true;
    value = 30;
    startedAt = Date.now();
    emit();
  }
}

export function finishRouteProgress() {
  if (!active) { held = false; return; }
  held = false;
  clearTimers();
  // Keep the pulse visible long enough to be noticed on fast transitions.
  const elapsed = Date.now() - startedAt;
  finishTimer = setTimeout(() => {
    value = 100;
    emit();
    hideTimer && clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      active = false;
      value = 0;
      emit();
    }, 200);
  }, Math.max(0, 260 - elapsed));
}

/** Called when a route has successfully rendered. */
export function completeRouteProgress() {
  if (active) {
    finishRouteProgress();
    return;
  }
  // No click-initiated pulse (e.g. redirect or programmatic navigate):
  // flash a short pulse so the transition still reads as intentional.
  if (held) return;
  beginRouteProgress();
  finishRouteProgress();
}

/** A click that did not change the location should not leave the bar running. */
export function abortRouteProgress(hash: string) {
  if (!active) return;
  if (window.location.hash === hash) finishRouteProgress();
}
