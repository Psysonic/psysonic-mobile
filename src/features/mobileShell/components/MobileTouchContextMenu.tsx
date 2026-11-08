import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useOfflineBrowseContext } from '@/features/offline';
import { usePlayerStore, setContextMenuInterceptor, type ContextMenuRequest } from '@/features/playback';
import {
  ALBUM_RING_ACTIONS,
  PLAYLIST_RING_ACTIONS,
  QueueRingMenu,
  QueueUndoBar,
  RING_EXIT_MS,
  TRACK_RING_ACTIONS,
  queueRingCenter,
  queueRingPick,
  useQueueTouchRowActions,
  type QueueRingAction,
  type QueueRingState,
  type QueueRowTarget,
} from '@/features/queue';
import {
  removeSongFromPlaylist,
  runAlbumRingAction,
  runPlaylistRingAction,
} from '@/features/mobileShell/utils/ringItemActions';
import { buildArtistDetailPath } from '@/lib/navigation/detailServerScope';
import { useMobileSelectionStore } from '@/features/mobileShell/store/mobileSelectionStore';
import { safeAreaInsetBottom } from '@/lib/dom/safeAreaInset';
import type { SubsonicAlbum, SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import type { Track } from '@/lib/media/trackTypes';

/** Hold time before a touch counts as a long press. */
const LONG_PRESS_MS = 480;
/** Finger travel that turns a press into a scroll. */
const MOVE_TOLERANCE_PX = 10;
/** Room the ring leaves for the status bar at the top. */
const TOP_INSET_PX = 64;
/** Elements with their own long-press meaning, or where a menu would get in the way. */
const EXCLUDED = 'input, textarea, select, [role="slider"], .long-press-play-btn, [data-no-touch-menu]';

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The ring a menu request becomes; `null` keeps the plain menu (artists, selections, …).
 * Its pieces follow the context, by the same rules as the menu: offline nothing changes on
 * the server, a song in an editable playlist can leave it, an album on its artist's page
 * has no artist to go to.
 */
function ringFor(
  [, , item, type, , playlistId, playlistSongIndex, , , playlistSongRemove]: ContextMenuRequest,
  row: Element,
  online: boolean,
  pathname: string,
): { target: QueueRowTarget; actions: readonly QueueRingAction[] } | null {
  if (!item) return null;
  const withoutLike = (actions: readonly QueueRingAction[]) => (
    online ? actions : actions.filter(action => action !== 'like')
  );
  const inEditablePlaylist = online && !!playlistId && playlistSongIndex !== undefined && !!playlistSongRemove;
  switch (type) {
    case 'song':
    case 'album-song':
    case 'favorite-song':
      return {
        target: { kind: 'track', track: item as Track, row: row as HTMLElement },
        actions: [
          ...withoutLike(TRACK_RING_ACTIONS),
          ...(inEditablePlaylist ? ['remove' as const] : []),
          ...(row.closest('[data-ring-select]') ? ['select' as const] : []),
        ],
      };
    case 'album': {
      const album = item as SubsonicAlbum;
      const onArtistPage = pathname === buildArtistDetailPath(album.artistId, {}).split('?')[0];
      const actions = withoutLike(ALBUM_RING_ACTIONS);
      return {
        target: { kind: 'album', album },
        actions: onArtistPage ? actions.filter(action => action !== 'artist') : actions,
      };
    }
    case 'playlist':
      return { target: { kind: 'playlist', playlist: item as SubsonicPlaylist }, actions: PLAYLIST_RING_ACTIONS };
    default:
      return null;
  }
}

/**
 * iOS has no right click: a long press dispatches `contextmenu` at the pressed element, so
 * every existing context menu opens on touch. Songs, albums and playlists show the ring
 * instead: the finger picks a quick action, the middle opens the same full menu. The click
 * that follows the long press is swallowed so the row does not also play. Mounted once by
 * the touch shell.
 */
export default function MobileTouchContextMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { active: offlineActive } = useOfflineBrowseContext();
  const [ring, setRing] = useState<QueueRingState | null>(null);
  const keepPlaceRef = useRef(false);
  const actions = useQueueTouchRowActions(keepPlaceRef);
  const latest = useRef({ t, navigate, run: actions.run, offlineActive, pathname });
  useEffect(() => { latest.current = { t, navigate, run: actions.run, offlineActive, pathname }; });

  useEffect(() => {
    let timer: number | undefined;
    let leaveTimer: number | undefined;
    let press: { x: number; y: number; target: Element } | null = null;
    let swallowClick = false;
    let open: { state: QueueRingState; request: ContextMenuRequest; x: number; y: number } | null = null;

    const cancel = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      press = null;
    };

    const openRing = (request: ContextMenuRequest, x: number, y: number, row: Element): boolean => {
      const shown = ringFor(request, row, !latest.current.offlineActive, latest.current.pathname);
      if (!shown) return false;
      const center = queueRingCenter(x, y, {
        width: window.innerWidth,
        height: window.innerHeight,
        top: TOP_INSET_PX,
        bottom: safeAreaInsetBottom(),
      });
      window.clearTimeout(leaveTimer);
      navigator.vibrate?.(10);
      const state: QueueRingState = { ...center, pick: 'menu', ...shown };
      open = { state, request, x, y };
      setRing(state);
      return true;
    };

    const onTouchStart = (e: TouchEvent) => {
      swallowClick = false;
      cancel();
      setContextMenuInterceptor(null);
      if (e.touches.length !== 1) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest(EXCLUDED)) return;
      const touch = e.touches[0];
      press = { x: touch.clientX, y: touch.clientY, target };
      timer = window.setTimeout(() => {
        if (!press) return;
        const { x, y, target: pressed } = press;
        cancel();
        swallowClick = true;
        // The row asks for its menu as always; here that request can become the ring. It
        // stays armed while the finger is down: a playlist card first resolves its server.
        setContextMenuInterceptor(request => {
          setContextMenuInterceptor(null);
          return openRing(request, x, y, pressed);
        });
        pressed.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 2,
        }));
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (open) {
        // The ring owns the finger now: nothing underneath may scroll or refresh.
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        const pick = queueRingPick(touch.clientX - open.x, touch.clientY - open.y, open.state.actions);
        if (pick !== open.state.pick) {
          open.state = { ...open.state, pick };
          setRing(open.state);
        }
        return;
      }
      if (!press) return;
      if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > MOVE_TOLERANCE_PX) cancel();
    };

    const finish = (held: NonNullable<typeof open>) => {
      open = null;
      const { pick, target } = held.state;
      if (pick && pick !== 'menu' && !reducedMotion()) {
        setRing({ ...held.state, leaving: true });
        leaveTimer = window.setTimeout(() => setRing(null), RING_EXIT_MS);
      } else {
        setRing(null);
      }
      if (!pick) return;
      if (pick === 'menu') {
        const reopen = usePlayerStore.getState().openContextMenu;
        reopen(...(held.request as Parameters<typeof reopen>));
        return;
      }
      const { run, navigate: go, t: translate } = latest.current;
      if (pick === 'select' && target.kind === 'track') useMobileSelectionStore.getState().start(target.track);
      else if (pick === 'remove' && target.kind === 'track') void removeSongFromPlaylist(held.request[9] as () => void | Promise<void>, translate);
      else if (target.kind === 'album') void runAlbumRingAction(pick, target.album, go, translate);
      else if (target.kind === 'playlist') void runPlaylistRingAction(pick, target.playlist, translate);
      else run(pick, target, { x: held.x, y: held.y });
    };

    const onTouchEnd = () => {
      cancel();
      setContextMenuInterceptor(null);
      if (open) finish(open);
    };

    const onTouchCancel = () => {
      cancel();
      setContextMenuInterceptor(null);
      if (!open) return;
      open = null;
      setRing(null);
    };

    // Android's WebView fires its own `contextmenu` on a long press, which would open the
    // full menu behind the ring. Only the browser's (trusted) one is dropped: our own
    // synthetic event above decides.
    const onNativeMenu = (e: MouseEvent) => {
      if (!e.isTrusted || (!press && !open)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    document.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true });
    document.addEventListener('contextmenu', onNativeMenu, true);
    document.addEventListener('click', onClick, true);
    return () => {
      cancel();
      setContextMenuInterceptor(null);
      window.clearTimeout(leaveTimer);
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchmove', onTouchMove, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchCancel, { capture: true });
      document.removeEventListener('contextmenu', onNativeMenu, true);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return (
    <>
      {ring && <QueueRingMenu ring={ring} />}
      {actions.notice && <QueueUndoBar notice={actions.notice} onUndo={actions.undo} t={t} />}
    </>
  );
}
