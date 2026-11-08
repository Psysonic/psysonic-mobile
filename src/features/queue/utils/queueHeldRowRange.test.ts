import { describe, expect, it } from 'vitest';
import { queueRangeWithHeldRow } from '@/features/queue/utils/queueHeldRowRange';

const range = { startIndex: 10, endIndex: 12, overscan: 1, count: 50 };

describe('queueRangeWithHeldRow', () => {
  it('without a held row it is the normal window', () => {
    expect(queueRangeWithHeldRow(range, null)).toEqual([9, 10, 11, 12, 13]);
  });

  it('adds a held row below the window, in order', () => {
    expect(queueRangeWithHeldRow(range, 40)).toEqual([9, 10, 11, 12, 13, 40]);
  });

  it('adds a held row above the window, in order', () => {
    expect(queueRangeWithHeldRow(range, 2)).toEqual([2, 9, 10, 11, 12, 13]);
  });

  it('does not list a held row twice when it is already in the window', () => {
    expect(queueRangeWithHeldRow(range, 11)).toEqual([9, 10, 11, 12, 13]);
  });

  it.each([-1, 50])('ignores an index outside the list (%i)', index => {
    expect(queueRangeWithHeldRow(range, index)).toEqual([9, 10, 11, 12, 13]);
  });
});
