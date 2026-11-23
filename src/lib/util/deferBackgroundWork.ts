import { IS_MOBILE_SHELL } from '@/lib/util/platform';

/**
 * How long the phone waits before prefetching for the next visit. A page that mounts while
 * a sheet closes (e.g. Mainstage under the full-screen player) would otherwise load its whole
 * next feed during the close animation; on a phone that kept the main thread busy for about
 * 2.5 s and the player stuck halfway down (S20+, 23.11.2026).
 */
export const MOBILE_BACKGROUND_WORK_DELAY_MS = 2500;

/**
 * Runs prefetch work that only serves a later visit. Desktop: right away, as before. Phone:
 * after `MOBILE_BACKGROUND_WORK_DELAY_MS`, then when the browser is idle. Returns a cancel.
 */
export function deferBackgroundWork(work: () => void): () => void {
  if (!IS_MOBILE_SHELL) {
    work();
    return () => {};
  }
  let idleId: number | undefined;
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    work();
  };
  const timer = setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      run();
    }
  }, MOBILE_BACKGROUND_WORK_DELAY_MS);
  return () => {
    done = true;
    clearTimeout(timer);
    if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
  };
}
