/**
 * Geometry of the touch queue's ring menu (hold a row, slide towards an action,
 * let go). The ring is split into five equal pieces, clockwise from the top.
 * The pick follows the finger's movement since the hold, like a stick: where the
 * ring sits on screen does not matter, so it can be pushed away from an edge.
 */

export type QueueRingAction = 'next' | 'like' | 'info' | 'radio' | 'remove';

/** Clockwise from the top. */
export const QUEUE_RING_ACTIONS: readonly QueueRingAction[] = ['next', 'like', 'info', 'radio', 'remove'];

/** `menu` = let go in the middle (full context menu); `null` = let go outside (close). */
export type QueueRingPick = QueueRingAction | 'menu' | null;

export const RING_OUTER_PX = 112;
export const RING_INNER_PX = 48;
/** Finger travel that still counts as "in the middle". */
const CENTER_DEADZONE_PX = 24;
/** Finger travel beyond which letting go picks nothing. */
const OUTSIDE_PX = RING_OUTER_PX + 48;
/** Gap to the screen edge the ring keeps when it is pushed inwards. */
const EDGE_GAP_PX = 8;

const SLICE_DEG = 360 / QUEUE_RING_ACTIONS.length;

export function queueRingPick(dx: number, dy: number): QueueRingPick {
  const distance = Math.hypot(dx, dy);
  if (distance < CENTER_DEADZONE_PX) return 'menu';
  if (distance > OUTSIDE_PX) return null;
  // Clockwise from the top; the first slice is centred on the top.
  const deg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360 + SLICE_DEG / 2) % 360;
  return QUEUE_RING_ACTIONS[Math.floor(deg / SLICE_DEG)] ?? null;
}

/** Ring centre for a hold at (x, y): the finger, pushed in so the whole ring is on screen. */
export function queueRingCenter(
  x: number,
  y: number,
  viewport: { width: number; height: number; top: number; bottom: number },
): { x: number; y: number } {
  const reach = RING_OUTER_PX + EDGE_GAP_PX;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return {
    x: clamp(x, reach, viewport.width - reach),
    y: clamp(y, viewport.top + reach, viewport.height - viewport.bottom - reach),
  };
}

function pointAt(cx: number, cy: number, radius: number, deg: number): string {
  const rad = deg * Math.PI / 180;
  return `${(cx + radius * Math.sin(rad)).toFixed(2)} ${(cy - radius * Math.cos(rad)).toFixed(2)}`;
}

/** SVG path of slice `index` around (cx, cy). */
export function queueRingSlicePath(index: number, cx: number, cy: number): string {
  const start = index * SLICE_DEG - SLICE_DEG / 2;
  const end = start + SLICE_DEG;
  return [
    `M ${pointAt(cx, cy, RING_OUTER_PX, start)}`,
    `A ${RING_OUTER_PX} ${RING_OUTER_PX} 0 0 1 ${pointAt(cx, cy, RING_OUTER_PX, end)}`,
    `L ${pointAt(cx, cy, RING_INNER_PX, end)}`,
    `A ${RING_INNER_PX} ${RING_INNER_PX} 0 0 0 ${pointAt(cx, cy, RING_INNER_PX, start)}`,
    'Z',
  ].join(' ');
}

/** Where slice `index`'s icon sits (middle of the slice). */
export function queueRingIconPoint(index: number, cx: number, cy: number): { x: number; y: number } {
  const rad = index * SLICE_DEG * Math.PI / 180;
  const radius = (RING_OUTER_PX + RING_INNER_PX) / 2;
  return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
}
