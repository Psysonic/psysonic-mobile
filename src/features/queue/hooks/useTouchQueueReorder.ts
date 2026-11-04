import type { RefObject } from 'react';
import { useTouchListReorder, type TouchDropTarget } from '@/lib/dnd/useTouchListReorder';

export { LIFT_MS, type TouchDropTarget } from '@/lib/dnd/useTouchListReorder';

interface Args {
  /** The queue list's scroll viewport. */
  listRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Same contract as the desktop drop: indices to move and the gap to insert them at. */
  moveQueueItems: (indices: readonly number[], gapIndex: number) => void;
}

/**
 * Touch reordering for the queue sheet, as in playlists: grab a row's grip and
 * it lifts at once and follows the finger (see `useTouchListReorder`); holding
 * the rest of the row opens the ring menu instead (`useQueueRowGestures`).
 * Timeline history rows stay where they are, and the row's other buttons
 * (favorite) keep their tap.
 */
export function useTouchQueueReorder({ listRef, enabled, moveQueueItems }: Args): TouchDropTarget | null {
  return useTouchListReorder({
    listRef,
    enabled,
    rowSelector: '[data-queue-idx]:not([data-timeline-kind="history"])',
    indexAttr: 'data-queue-idx',
    ignoreSelector: 'button:not(.queue-item-grip)',
    handleSelector: '.queue-item-grip',
    liftDelayMs: 0,
    liftedClass: 'queue-item--lifted',
    onDrop: (from, target) => moveQueueItems([from], target.before ? target.idx : target.idx + 1),
  });
}
