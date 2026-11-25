/**
 * ⚠️ Android territory. The back key closes the topmost sheet, menu or overlay first, as
 * it does in every Android app; only with none open does it go back a page (wry) or send
 * the app to the background (`src-tauri/android/MainActivity.kt`). Every overlay already
 * closes on Escape, so the back key becomes an Escape on the topmost one.
 */
import { IS_ANDROID } from '@/lib/util/platform';

/** Overlays that close on Escape: sheets, the context menu, the "…" menu, search, theme preview, the hub QR scanner. */
export const OVERLAY_SELECTOR =
  '.mobile-sheet, .context-menu, .mobile-more-menu__list, .mobile-search-overlay, .mobile-theme-preview, .mobile-hub-scanner';

declare global {
  interface Window {
    __psyAndroidBack?: () => void;
  }
}

/** Menus always draw above sheets, but the context menu sits before the sheet portals in the DOM. */
const MENU_SELECTOR = '.context-menu, .mobile-more-menu__list';

/**
 * Overlays the back key closed, by when. A sheet stays in the page while it slides out
 * (240 ms); a second back press in that time went to it and was lost. One that is still
 * there after this counts as open again (it did not close on Escape).
 */
const closingSince = new WeakMap<Element, number>();
const CLOSING_MS = 600;

const isClosing = (el: Element) => performance.now() - (closingSince.get(el) ?? -Infinity) < CLOSING_MS;

/** The last of `list` that is not on its way out. */
function lastOpen(list: NodeListOf<Element>): Element | null {
  for (let i = list.length - 1; i >= 0; i--) {
    if (!isClosing(list[i])) return list[i];
  }
  return null;
}

/** The overlay on top: an open menu first, otherwise the one opened last (portals append to the end of the body). */
export function topOverlay(root: ParentNode = document): Element | null {
  return lastOpen(root.querySelectorAll(MENU_SELECTOR)) ?? lastOpen(root.querySelectorAll(OVERLAY_SELECTOR));
}

/** Sends Escape to the topmost overlay (to its focused field, if any); false when none is open. */
export function closeTopOverlay(): boolean {
  const top = topOverlay();
  if (!top) return false;
  const active = document.activeElement;
  const target = active && top.contains(active) ? active : top;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  closingSince.set(top, performance.now());
  return true;
}

/** Tells the activity whether an overlay is open, so it hands it the back key; returns the cleanup. */
export function installAndroidBack(): () => void {
  if (!IS_ANDROID) return () => {};
  let open = false;
  let queued = false;
  const report = () => {
    queued = false;
    const now = topOverlay() !== null;
    if (now === open) return;
    open = now;
    window.PsysonicAndroidShell?.setOverlayOpen?.(now);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(report);
  };
  window.__psyAndroidBack = () => {
    // Only overlays on their way out are left: the key does what it does without one.
    if (!closeTopOverlay()) window.PsysonicAndroidShell?.back?.();
    schedule();
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  report();
  return () => {
    observer.disconnect();
    delete window.__psyAndroidBack;
    if (open) window.PsysonicAndroidShell?.setOverlayOpen?.(false);
  };
}
