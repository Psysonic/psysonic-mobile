import { usePlayerStore, resolveQueueTrack } from '@/features/playback';
import {
  buildWidgetSnapshot,
  loadWidgetRecentAlbums,
  type WidgetAlbum,
  type WidgetSnapshot,
} from './widgetSnapshot';

/** Player changes within this window after the first go out together (skipping through a queue). */
const UPDATE_DELAY_MS = 600;
/** A jump in the playing position larger than this is a seek: the widgets' bar moves too. */
const SEEK_TOLERANCE_S = 2;
/** Recently played albums follow a new album at most this often. */
const RECENT_MIN_INTERVAL_MS = 60_000;

/** What decides whether the widgets change; the position only counts when it jumps. */
function playerKey(): string {
  const { currentTrack, currentRadio, isPlaying, queueItems, queueIndex } = usePlayerStore.getState();
  const next = queueItems.slice(queueIndex + 1, queueIndex + 4).map(ref => resolveQueueTrack(ref).id);
  return JSON.stringify([currentTrack?.id, currentRadio?.id, isPlaying, queueIndex, next]);
}

/** Where the song would have started, playing without pauses; null when paused. */
function startedAt(): number | null {
  const { isPlaying, currentTime } = usePlayerStore.getState();
  return isPlaying ? Date.now() / 1000 - (currentTime || 0) : null;
}

/**
 * Calls `send` with a fresh snapshot whenever what the widgets show changes: song, play state,
 * up next, a seek. Recently played albums load at the start and after a new album, at most
 * once a minute. Returns the stop function.
 */
export function watchWidgetSnapshot(send: (snapshot: WidgetSnapshot) => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastKey = '';
  let lastStart: number | null = null;
  let lastSent = '';
  let recent: WidgetAlbum[] = [];
  let recentAlbumId: string | undefined;
  let recentLoadedAt = 0;

  const refreshRecent = async () => {
    const albumId = usePlayerStore.getState().currentTrack?.albumId;
    const due = Date.now() - recentLoadedAt >= RECENT_MIN_INTERVAL_MS;
    if (recentLoadedAt > 0 && (albumId === recentAlbumId || !due)) return;
    recentAlbumId = albumId;
    recentLoadedAt = Date.now();
    recent = await loadWidgetRecentAlbums().catch(() => recent);
  };

  const flush = async () => {
    await refreshRecent();
    const snapshot = await buildWidgetSnapshot(recent).catch(() => null);
    if (stopped || !snapshot) return;
    // The start time moves with the clock; it only matters when the song or a seek changed it.
    const text = JSON.stringify({ ...snapshot, now: snapshot.now && { ...snapshot.now, startedAt: undefined } });
    if (text === lastSent && !startMoved()) return;
    lastSent = text;
    lastStart = startedAt();
    send(snapshot);
  };

  const startMoved = () => {
    const start = startedAt();
    if (start === null || lastStart === null) return start !== lastStart;
    return Math.abs(start - lastStart) > SEEK_TOLERANCE_S;
  };

  // One flush at a time, so a slow cover download cannot send an older state last.
  let running: Promise<void> = Promise.resolve();
  const flushInTurn = () => {
    running = running.then(flush, flush);
  };

  // The store changes with every position tick: a flush already waiting takes the change along.
  const schedule = () => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      flushInTurn();
    }, UPDATE_DELAY_MS);
  };

  const off = usePlayerStore.subscribe(() => {
    const key = playerKey();
    if (key !== lastKey || startMoved()) {
      lastKey = key;
      schedule();
    }
  });
  lastKey = playerKey();
  flushInTurn();

  return () => {
    stopped = true;
    off();
    clearTimeout(timer);
  };
}
