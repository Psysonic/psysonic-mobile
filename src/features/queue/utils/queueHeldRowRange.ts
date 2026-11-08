import { defaultRangeExtractor, type Range } from '@tanstack/react-virtual';

/**
 * The rows to render, plus the row a finger is holding: edge scrolling can carry that row
 * far outside the rendered window, and it has to stay under the finger the whole way.
 */
export function queueRangeWithHeldRow(range: Range, heldIndex: number | null): number[] {
  const indexes = defaultRangeExtractor(range);
  if (heldIndex === null || heldIndex < 0 || heldIndex >= range.count || indexes.includes(heldIndex)) {
    return indexes;
  }
  return [...indexes, heldIndex].sort((a, b) => a - b);
}
