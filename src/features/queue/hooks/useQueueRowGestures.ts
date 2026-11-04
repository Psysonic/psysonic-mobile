import { useEffect, useRef, useState, type RefObject } from 'react';
import { usePlayerStore } from '@/features/playback';
import { queueRingCenter, queueRingPick, type QueueRingPick } from '@/features/queue/utils/queueRingGeometry';
import { safeAreaInsetBottom } from '@/lib/dom/safeAreaInset';

/** Hold time before the ring opens (same as the shell's long press). */
export const RING_HOLD_MS = 480;
/** Finger travel before the hold that means "scrolling". */
const SCROLL_TOLERANCE_PX = 10;
/** Room the ring leaves for the status bar at the top. */
const TOP_INSET_PX = 64;
/** Sideways travel that turns a touch into a row swipe… */
const SWIPE_START_PX = 12;
/** …when it beats the vertical travel by this factor. */
const SWIPE_DIRECTION_RATIO = 1.5;
/** Share of the row's width a swipe has to cover to act on release. */
export const SWIPE_COMMIT_FRACTION = 1 / 3;

/** Rows a gesture may start on: upcoming and played queue rows, not the timeline history. */
const ROW_SELECTOR = '[data-queue-idx]:not([data-timeline-kind="history"])';
const SWIPING_CLASS = 'queue-item--swiping';
const TRACK_CLASS = 'queue-swipe-track';

export interface QueueRingState {
  /** Ring centre on screen. */
  x: number;
  y: number;
  pick: QueueRingPick;
  /** Absolute queue index of the held row. */
  idx: number;
}

interface Args {
  /** The queue list's scroll viewport. */
  listRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** The finger left the ring or a swipe: run `pick` on queue row `idx`; (x, y) is where the touch started. */
  onPick: (pick: QueueRingPick, idx: number, at: { x: number; y: number }) => void;
}

interface Press {
  x: number;
  y: number;
  idx: number;
  row: HTMLElement;
  swiping: boolean;
  dx: number;
}

/** Swipe direction: left takes the row out, right makes it play next. */
function swipePick(dx: number): 'remove' | 'next' {
  return dx < 0 ? 'remove' : 'next';
}

/**
 * Touch queue rows (not their buttons, not the playing track):
 * - swipe left / right: remove the row / play it next, once it has travelled a
 *   third of its width (the stripe behind it turns solid then);
 * - hold: a ring of actions opens around the finger; slide towards one and let go.
 * The row's grip keeps reordering (`useTouchQueueReorder`).
 */
export function useQueueRowGestures({ listRef, enabled, onPick }: Args): QueueRingState | null {
  const [ring, setRing] = useState<QueueRingState | null>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; });

  useEffect(() => {
    const list = listRef.current;
    if (!enabled || !list) return;

    let timer: number | undefined;
    let press: Press | null = null;
    let open: QueueRingState | null = null;

    const show = (next: QueueRingState | null) => {
      open = next;
      setRing(next);
    };

    // The stripe behind a swiped row lives on the row's (virtualised) wrapper,
    // sized to the row so a divider in the same wrapper stays as it is.
    const paintSwipe = (p: Press) => {
      const track = p.row.parentElement;
      const width = p.row.getBoundingClientRect().width;
      const armed = width > 0 && Math.abs(p.dx) >= width * SWIPE_COMMIT_FRACTION;
      p.row.classList.add(SWIPING_CLASS);
      p.row.style.setProperty('--swipe-dx', `${p.dx}px`);
      if (!track) return;
      track.classList.add(TRACK_CLASS);
      track.dataset.swipe = swipePick(p.dx);
      track.toggleAttribute('data-swipe-armed', armed);
      track.style.setProperty('--swipe-top', `${p.row.offsetTop}px`);
      track.style.setProperty('--swipe-h', `${p.row.offsetHeight}px`);
    };

    const clearSwipe = (p: Press) => {
      p.row.classList.remove(SWIPING_CLASS);
      p.row.style.removeProperty('--swipe-dx');
      const track = p.row.parentElement;
      if (!track) return;
      track.classList.remove(TRACK_CLASS);
      delete track.dataset.swipe;
      track.removeAttribute('data-swipe-armed');
    };

    const reset = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      if (press?.swiping) clearSwipe(press);
      press = null;
      if (open) show(null);
    };

    const swallowNextClick = () => {
      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      };
      document.addEventListener('click', onClick, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener('click', onClick, { capture: true }), 600);
    };

    const onTouchStart = (e: TouchEvent) => {
      reset();
      if (e.touches.length !== 1) return;
      const el = e.target instanceof Element ? e.target : null;
      if (!el || el.closest('button')) return;
      const row = el.closest<HTMLElement>(ROW_SELECTOR);
      if (!row || !list.contains(row)) return;
      const idx = Number(row.getAttribute('data-queue-idx'));
      if (!Number.isInteger(idx) || idx === usePlayerStore.getState().queueIndex) return;
      const touch = e.touches[0];
      press = { x: touch.clientX, y: touch.clientY, idx, row, swiping: false, dx: 0 };
      timer = window.setTimeout(() => {
        timer = undefined;
        if (!press) return;
        const center = queueRingCenter(press.x, press.y, {
          width: window.innerWidth,
          height: window.innerHeight,
          top: TOP_INSET_PX,
          bottom: safeAreaInsetBottom(),
        });
        navigator.vibrate?.(10);
        show({ ...center, pick: 'menu', idx: press.idx });
      }, RING_HOLD_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!press) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - press.x;
      const dy = touch.clientY - press.y;
      if (open) {
        // The ring owns the finger now: the list must not scroll.
        e.preventDefault();
        const pick = queueRingPick(dx, dy);
        if (pick !== open.pick) show({ ...open, pick });
        return;
      }
      if (!press.swiping
        && Math.abs(dx) > SWIPE_START_PX
        && Math.abs(dx) > Math.abs(dy) * SWIPE_DIRECTION_RATIO) {
        press.swiping = true;
        window.clearTimeout(timer);
        timer = undefined;
      }
      if (press.swiping) {
        e.preventDefault();
        press.dx = dx;
        paintSwipe(press);
        return;
      }
      if (Math.hypot(dx, dy) > SCROLL_TOLERANCE_PX) reset();
    };

    const onTouchEnd = () => {
      const held = open;
      const start = press;
      const width = start?.swiping ? start.row.getBoundingClientRect().width : 0;
      reset();
      if (!start) return;
      if (start.swiping) {
        swallowNextClick();
        if (width > 0 && Math.abs(start.dx) >= width * SWIPE_COMMIT_FRACTION) {
          navigator.vibrate?.(10);
          onPickRef.current(swipePick(start.dx), start.idx, { x: start.x, y: start.y });
        }
        return;
      }
      if (!held) return;
      swallowNextClick();
      onPickRef.current(held.pick, held.idx, { x: start.x, y: start.y });
    };

    // Android's WebView fires its own `contextmenu` on a long press, which would open the
    // row's full menu behind the ring. Only the browser's (trusted) one is dropped: the
    // grip's synthetic event (`useTouchListReorder`) still opens the menu.
    const onNativeMenu = (e: MouseEvent) => {
      if (!e.isTrusted || !press) return;
      e.preventDefault();
      e.stopPropagation();
    };

    list.addEventListener('touchstart', onTouchStart, { passive: true });
    list.addEventListener('touchmove', onTouchMove, { passive: false });
    list.addEventListener('touchend', onTouchEnd);
    list.addEventListener('touchcancel', reset);
    list.addEventListener('contextmenu', onNativeMenu, true);
    return () => {
      list.removeEventListener('contextmenu', onNativeMenu, true);
      reset();
      list.removeEventListener('touchstart', onTouchStart);
      list.removeEventListener('touchmove', onTouchMove);
      list.removeEventListener('touchend', onTouchEnd);
      list.removeEventListener('touchcancel', reset);
    };
  }, [listRef, enabled]);

  return ring;
}
