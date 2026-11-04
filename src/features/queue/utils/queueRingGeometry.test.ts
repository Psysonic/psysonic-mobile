import { describe, expect, it } from 'vitest';
import { RING_OUTER_PX, queueRingCenter, queueRingPick } from '@/features/queue/utils/queueRingGeometry';

describe('queueRingPick', () => {
  it('reads the finger travel like a stick, clockwise from the top', () => {
    expect(queueRingPick(0, -80)).toBe('next');
    expect(queueRingPick(80, -20)).toBe('like');
    expect(queueRingPick(60, 60)).toBe('info');
    expect(queueRingPick(-60, 60)).toBe('radio');
    expect(queueRingPick(-80, -20)).toBe('remove');
  });

  it('a finger that stays in the middle means the full menu', () => {
    expect(queueRingPick(0, 0)).toBe('menu');
    expect(queueRingPick(10, -10)).toBe('menu');
  });

  it('a finger far outside the ring picks nothing', () => {
    expect(queueRingPick(0, -(RING_OUTER_PX + 60))).toBeNull();
  });
});

describe('queueRingCenter', () => {
  const viewport = { width: 390, height: 844, top: 64, bottom: 34 };

  it('stays on the finger when the ring fits', () => {
    expect(queueRingCenter(195, 420, viewport)).toEqual({ x: 195, y: 420 });
  });

  it('pushes the ring inwards near the edges', () => {
    const c = queueRingCenter(20, 830, viewport);
    expect(c.x).toBe(RING_OUTER_PX + 8);
    expect(c.y).toBe(844 - 34 - RING_OUTER_PX - 8);
  });
});
