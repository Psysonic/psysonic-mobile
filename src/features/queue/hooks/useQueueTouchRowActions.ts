import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore, resolveQueueTrack, queueSongStar } from '@/features/playback';
import { startRadio } from '@/features/contextMenu';
import { ownedOverrideValue } from '@/lib/util/ownedEntityKey';
import { prepareTransientUiOpen } from '@/lib/dom/transientUi';
import type { Track } from '@/lib/media/trackTypes';
import type { QueueRingPick } from '@/features/queue/utils/queueRingGeometry';
import type { QueueRowTarget } from '@/features/queue/hooks/useQueueRowGestures';

/** How long the "removed / plays next" bar with its Undo button stays. */
export const QUEUE_UNDO_NOTICE_MS = 5000;

export interface QueueUndoNotice {
  text: string;
  /** Undo reverts the last queue edit (`undoLastQueueEdit`). */
  undoable: boolean;
}

/**
 * What the touch queue's quick actions (ring menu, row swipes) do with a row.
 * Remove and "play next" are queue edits with an undo step; the bar they show
 * offers that undo for a few seconds.
 */
export function useQueueTouchRowActions(suppressNextAutoScrollRef: MutableRefObject<boolean>) {
  const { t } = useTranslation();
  const [notice, setNotice] = useState<QueueUndoNotice | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const showNotice = useCallback((next: QueueUndoNotice) => {
    window.clearTimeout(timerRef.current);
    setNotice(next);
    timerRef.current = window.setTimeout(() => setNotice(null), QUEUE_UNDO_NOTICE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const undo = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setNotice(null);
    suppressNextAutoScrollRef.current = true;
    usePlayerStore.getState().undoLastQueueEdit();
  }, [suppressNextAutoScrollRef]);

  /** A track outside the queue (played before, a search result). */
  const runOnTrack = useCallback((pick: QueueRingPick, track: Track, row: HTMLElement, at: { x: number; y: number }) => {
    const s = usePlayerStore.getState();
    switch (pick) {
      case 'menu':
        // The row knows its own menu.
        row.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 2,
        }));
        return;
      case 'next':
        suppressNextAutoScrollRef.current = true;
        s.playNext([track]);
        showNotice({ text: t('queue.touchPlaysNext', { title: track.title }), undoable: !!s.currentTrack });
        return;
      case 'like': {
        const starred = ownedOverrideValue(s.starredOverrides, track) ?? !!track.starred;
        queueSongStar(track.id, !starred, track.serverId, { scopedOverride: true });
        return;
      }
      case 'radio':
        void startRadio(track.artistId ?? track.artist, track.artist, s.playTrack, track);
        return;
      case 'info':
        s.openSongInfo(track.id, track.serverId);
        return;
    }
  }, [showNotice, suppressNextAutoScrollRef, t]);

  const run = useCallback((pick: QueueRingPick, target: QueueRowTarget, at: { x: number; y: number }) => {
    if (!pick) return;
    if (target.kind === 'track') {
      runOnTrack(pick, target.track, target.row, at);
      return;
    }
    if (target.kind !== 'queue') return;
    const { idx } = target;
    const s = usePlayerStore.getState();
    const ref = s.queueItems[idx];
    if (!ref || idx === s.queueIndex) return;
    const track = resolveQueueTrack(ref);
    switch (pick) {
      case 'menu':
        prepareTransientUiOpen();
        s.openContextMenu(at.x, at.y, track, 'queue-item', idx);
        return;
      case 'next': {
        const gap = s.queueIndex + 1;
        const moved = idx !== gap;
        if (moved) {
          suppressNextAutoScrollRef.current = true;
          s.moveQueueItems([idx], gap);
        }
        showNotice({ text: t('queue.touchPlaysNext', { title: track.title }), undoable: moved });
        return;
      }
      case 'remove':
        suppressNextAutoScrollRef.current = true;
        s.removeQueueItems([ref]);
        showNotice({ text: t('queue.touchRemoved', { title: track.title }), undoable: true });
        return;
      case 'like': {
        const starred = ownedOverrideValue(s.starredOverrides, track) ?? !!track.starred;
        queueSongStar(track.id, !starred, track.serverId, { scopedOverride: true });
        return;
      }
      case 'radio':
        void startRadio(track.artistId ?? track.artist, track.artist, s.playTrack, track);
        return;
      case 'info':
        s.openSongInfo(track.id, track.serverId);
        return;
    }
  }, [runOnTrack, showNotice, suppressNextAutoScrollRef, t]);

  return { run, notice, undo };
}
