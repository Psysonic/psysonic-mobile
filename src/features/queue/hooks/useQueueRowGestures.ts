import { useEffect, useRef, useState, type RefObject } from 'react';
import { usePlayerStore, resolveQueueTrack } from '@/features/playback';
import type { Track } from '@/lib/media/trackTypes';
import type { SubsonicAlbum, SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import {
  QUEUE_RING_ACTIONS,
  TRACK_RING_ACTIONS,
  queueRingCenter,
  queueRingPick,
  type QueueRingAction,
  type QueueRingPick,
} from '@/features/queue/utils/queueRingGeometry';
import { safeAreaInsetBottom } from '@/lib/dom/safeAreaInset';

/** Hold time before the ring opens (same as the shell's long press). */
export const RING_HOLD_MS = 480;
/** The picked piece stays on screen, then fades (the fade is in the CSS). */
export const RING_EXIT_MS = 500;
/** How long a committed swipe takes to run the row off the screen. */
export const SWIPE_OUT_MS = 180;
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

/** Rows of the queue, and tracks played before (timeline history). */
const ROW_SELECTOR = '[data-queue-idx], [data-timeline-kind="history"]';
const SWIPING_CLASS = 'queue-item--swiping';
const SWIPE_OUT_CLASS = 'queue-item--swipe-out';
const TRACK_CLASS = 'queue-swipe-track';

/** What a gesture acts on: a row of the queue, or a track that is not in it. */
export type QueueRowTarget =
  | { kind: 'queue'; idx: number }
  | { kind: 'track'; track: Track; row: HTMLElement }
  | { kind: 'album'; album: SubsonicAlbum }
  | { kind: 'playlist'; playlist: SubsonicPlaylist };

export interface QueueRingState {
  /** Ring centre on screen. */
  x: number;
  y: number;
  pick: QueueRingPick;
  target: QueueRowTarget;
  actions: readonly QueueRingAction[];
  /** The finger lifted: only the picked piece stays, then the ring is gone. */
  leaving?: boolean;
}

interface Args {
  /** The list's scroll viewport. */
  listRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** The finger left the ring or a swipe: run `pick` on `target`; (x, y) is where the touch started. */
  onPick: (pick: QueueRingPick, target: QueueRowTarget, at: { x: number; y: number }) => void;
}

interface Press {
  x: number;
  y: number;
  target: QueueRowTarget;
  actions: readonly QueueRingAction[];
  row: HTMLElement;
  swiping: boolean;
  dx: number;
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Swipe direction: left takes the row out, right makes it play next. */
function swipePick(dx: number): 'remove' | 'next' {
  return dx < 0 ? 'remove' : 'next';
}

function queueRowTarget(row: HTMLElement): QueueRowTarget | null {
  if (row.getAttribute('data-timeline-kind') === 'history') {
    const trackId = row.getAttribute('data-history-track');
    if (!trackId) return null;
    const track = resolveQueueTrack({ serverId: row.getAttribute('data-history-server') ?? '', trackId });
    return { kind: 'track', track, row };
  }
  const idx = Number(row.getAttribute('data-queue-idx'));
  if (!Number.isInteger(idx) || idx === usePlayerStore.getState().queueIndex) return null;
  return { kind: 'queue', idx };
}

/**
 * Touch rows (not their buttons, not the playing track):
 * - swipe left / right: remove the row / play it next, once it has travelled a
 *   third of its width (the stripe behind it turns solid then); a track that is
 *   not in the queue only swipes right;
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
    let leaveTimer: number | undefined;
    let press: Press | null = null;
    let open: QueueRingState | null = null;
    /** A committed swipe still running off the screen. */
    let flying: { timer: number; finish: () => void } | null = null;

    const show = (next: QueueRingState | null) => {
      window.clearTimeout(leaveTimer);
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
      p.row.classList.remove(SWIPING_CLASS, SWIPE_OUT_CLASS);
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
      const target = queueRowTarget(row);
      if (!target) return;
      const touch = e.touches[0];
      const actions = target.kind === 'queue' ? QUEUE_RING_ACTIONS : TRACK_RING_ACTIONS;
      press = { x: touch.clientX, y: touch.clientY, target, actions, row, swiping: false, dx: 0 };
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
        show({ ...center, pick: 'menu', target: press.target, actions: press.actions });
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
        const pick = queueRingPick(dx, dy, open.actions);
        if (pick !== open.pick) show({ ...open, pick });
        return;
      }
      const leftAllowed = press.target.kind === 'queue';
      if (!press.swiping
        && (dx > 0 || leftAllowed)
        && Math.abs(dx) > SWIPE_START_PX
        && Math.abs(dx) > Math.abs(dy) * SWIPE_DIRECTION_RATIO) {
        press.swiping = true;
        window.clearTimeout(timer);
        timer = undefined;
      }
      if (press.swiping) {
        e.preventDefault();
        press.dx = leftAllowed ? dx : Math.max(0, dx);
        paintSwipe(press);
        return;
      }
      if (Math.hypot(dx, dy) > SCROLL_TOLERANCE_PX) reset();
    };

    /** A committed swipe runs the row all the way across before it acts. */
    const runOff = (start: Press, width: number) => {
      const act = () => {
        navigator.vibrate?.(10);
        onPickRef.current(swipePick(start.dx), start.target, { x: start.x, y: start.y });
      };
      if (reducedMotion()) {
        clearSwipe(start);
        act();
        return;
      }
      start.row.classList.add(SWIPE_OUT_CLASS);
      start.row.style.setProperty('--swipe-dx', `${start.dx < 0 ? -width : width}px`);
      const finish = () => {
        flying = null;
        clearSwipe(start);
        act();
      };
      flying = { timer: window.setTimeout(finish, SWIPE_OUT_MS), finish };
    };

    const onTouchEnd = () => {
      const held = open;
      const start = press;
      const width = start?.swiping ? start.row.getBoundingClientRect().width : 0;
      const commits = !!start?.swiping && width > 0 && Math.abs(start.dx) >= width * SWIPE_COMMIT_FRACTION;
      const lingers = !!held?.pick && held.pick !== 'menu' && !reducedMotion();
      // Keep what is about to animate out of `reset`'s reach.
      if (commits) press = null;
      if (lingers) open = null;
      reset();
      if (!start) return;
      if (start.swiping) {
        swallowNextClick();
        if (commits) runOff(start, width);
        return;
      }
      if (!held) return;
      swallowNextClick();
      if (lingers) {
        setRing({ ...held, leaving: true });
        leaveTimer = window.setTimeout(() => setRing(null), RING_EXIT_MS);
      }
      onPickRef.current(held.pick, held.target, { x: start.x, y: start.y });
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
      window.clearTimeout(leaveTimer);
      setRing(null);
      if (flying) {
        window.clearTimeout(flying.timer);
        flying.finish();
      }
      list.removeEventListener('touchstart', onTouchStart);
      list.removeEventListener('touchmove', onTouchMove);
      list.removeEventListener('touchend', onTouchEnd);
      list.removeEventListener('touchcancel', reset);
    };
  }, [listRef, enabled]);

  return ring;
}
