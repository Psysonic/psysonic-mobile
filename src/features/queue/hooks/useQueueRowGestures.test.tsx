import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { dispatchTouch } from '@/test/helpers/touch';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { resetAllStores } from '@/test/helpers/storeReset';
import { RING_HOLD_MS, useQueueRowGestures } from '@/features/queue/hooks/useQueueRowGestures';
import type { QueueRingPick } from '@/features/queue/utils/queueRingGeometry';

function Harness({ onPick }: { onPick: (pick: QueueRingPick, idx: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const ring = useQueueRowGestures({ listRef, enabled: true, onPick: (p, i) => onPick(p, i) });
  return (
    <>
      <div ref={listRef}>
        {[0, 1, 2, 3].map(i => (
          <div key={i}><div data-queue-idx={i} data-testid={`row-${i}`}>
            Row {i}
            <button type="button">grip {i}</button>
          </div></div>
        ))}
      </div>
      <output data-testid="ring">{ring ? `${ring.idx}:${ring.pick}` : 'none'}</output>
    </>
  );
}

const row = (i: number) => screen.getByTestId(`row-${i}`);
const at = (x: number, y: number) => ({ x, y });
const hold = () => act(() => { vi.advanceTimersByTime(RING_HOLD_MS); });

describe('useQueueRowGestures (ring menu)', () => {
  beforeEach(() => {
    resetAllStores();
    usePlayerStore.setState({ queueIndex: 0 });
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('holding a row opens the ring; sliding up and letting go picks "play next"', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    act(() => { dispatchTouch(row(2), 'touchstart', at(200, 400)); });
    hold();
    expect(screen.getByTestId('ring')).toHaveTextContent('2:menu');

    let moveEvent: Event | undefined;
    act(() => { moveEvent = dispatchTouch(row(2), 'touchmove', at(200, 320)); });
    expect(moveEvent?.defaultPrevented).toBe(true);
    expect(screen.getByTestId('ring')).toHaveTextContent('2:next');

    act(() => { dispatchTouch(row(2), 'touchend', at(200, 320)); });
    expect(onPick).toHaveBeenCalledWith('next', 2);
    expect(screen.getByTestId('ring')).toHaveTextContent('none');
  });

  it('letting go in the middle asks for the full menu, far outside for nothing', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    act(() => { dispatchTouch(row(1), 'touchstart', at(200, 400)); });
    hold();
    act(() => { dispatchTouch(row(1), 'touchend', at(200, 400)); });
    expect(onPick).toHaveBeenLastCalledWith('menu', 1);

    act(() => { dispatchTouch(row(1), 'touchstart', at(200, 400)); });
    hold();
    act(() => { dispatchTouch(row(1), 'touchmove', at(200, 100)); });
    act(() => { dispatchTouch(row(1), 'touchend', at(200, 100)); });
    expect(onPick).toHaveBeenLastCalledWith(null, 1);
  });

  it('scrolling before the hold time opens nothing', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    act(() => { dispatchTouch(row(2), 'touchstart', at(200, 400)); });
    act(() => { dispatchTouch(row(2), 'touchmove', at(200, 430)); });
    hold();
    expect(screen.getByTestId('ring')).toHaveTextContent('none');
    act(() => { dispatchTouch(row(2), 'touchend', at(200, 430)); });
    expect(onPick).not.toHaveBeenCalled();
  });

  describe('row swipes', () => {
    let layout: { mockRestore: () => void };
    beforeEach(() => {
      layout = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(() => new DOMRect(0, 0, 390, 56));
    });
    afterEach(() => layout.mockRestore());

    it('swiping left past a third of the row removes it; the stripe turns solid on the way', () => {
      const onPick = vi.fn();
      render(<Harness onPick={onPick} />);
      act(() => { dispatchTouch(row(2), 'touchstart', at(300, 400)); });
      let moveEvent: Event | undefined;
      act(() => { moveEvent = dispatchTouch(row(2), 'touchmove', at(260, 402)); });
      expect(moveEvent?.defaultPrevented).toBe(true);
      expect(row(2).classList.contains('queue-item--swiping')).toBe(true);
      const track = row(2).parentElement!;
      expect(track.dataset.swipe).toBe('remove');
      expect(track.hasAttribute('data-swipe-armed')).toBe(false);

      act(() => { dispatchTouch(row(2), 'touchmove', at(150, 404)); });
      expect(track.hasAttribute('data-swipe-armed')).toBe(true);
      act(() => { dispatchTouch(row(2), 'touchend', at(150, 404)); });
      expect(onPick).toHaveBeenCalledWith('remove', 2);
      expect(row(2).classList.contains('queue-item--swiping')).toBe(false);
      expect(track.dataset.swipe).toBeUndefined();
    });

    it('swiping right plays the row next', () => {
      const onPick = vi.fn();
      render(<Harness onPick={onPick} />);
      act(() => { dispatchTouch(row(3), 'touchstart', at(50, 400)); });
      act(() => { dispatchTouch(row(3), 'touchmove', at(100, 400)); });
      act(() => { dispatchTouch(row(3), 'touchmove', at(200, 400)); });
      act(() => { dispatchTouch(row(3), 'touchend', at(200, 400)); });
      expect(onPick).toHaveBeenCalledWith('next', 3);
    });

    it('a short swipe snaps back and does nothing; a swipe never turns into the ring', () => {
      const onPick = vi.fn();
      render(<Harness onPick={onPick} />);
      act(() => { dispatchTouch(row(1), 'touchstart', at(300, 400)); });
      act(() => { dispatchTouch(row(1), 'touchmove', at(250, 400)); });
      hold();
      expect(screen.getByTestId('ring')).toHaveTextContent('none');
      act(() => { dispatchTouch(row(1), 'touchend', at(250, 400)); });
      expect(onPick).not.toHaveBeenCalled();
      expect(row(1).classList.contains('queue-item--swiping')).toBe(false);
    });

    it('a mostly vertical move scrolls the list instead', () => {
      const onPick = vi.fn();
      render(<Harness onPick={onPick} />);
      act(() => { dispatchTouch(row(1), 'touchstart', at(300, 400)); });
      let moveEvent: Event | undefined;
      act(() => { moveEvent = dispatchTouch(row(1), 'touchmove', at(280, 440)); });
      expect(moveEvent?.defaultPrevented).toBe(false);
      act(() => { dispatchTouch(row(1), 'touchmove', at(150, 445)); });
      act(() => { dispatchTouch(row(1), 'touchend', at(150, 445)); });
      expect(onPick).not.toHaveBeenCalled();
    });
  });

  // The WebView's own (trusted) long-press `contextmenu` is dropped during a hold; jsdom
  // cannot create a trusted event, so this pins the other half: the grip's synthetic one
  // still gets through.
  it('lets a synthetic menu event through during a hold', () => {
    render(<Harness onPick={vi.fn()} />);
    const onMenu = vi.fn();
    document.addEventListener('contextmenu', onMenu);
    act(() => { dispatchTouch(row(2), 'touchstart', at(200, 400)); });
    act(() => { row(2).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
    expect(onMenu).toHaveBeenCalledTimes(1);
    document.removeEventListener('contextmenu', onMenu);
  });

  it('leaves the playing row and the row buttons (grip) alone', () => {
    render(<Harness onPick={vi.fn()} />);
    act(() => { dispatchTouch(row(0), 'touchstart', at(200, 400)); });
    hold();
    expect(screen.getByTestId('ring')).toHaveTextContent('none');
    act(() => { dispatchTouch(screen.getByText('grip 3'), 'touchstart', at(380, 400)); });
    hold();
    expect(screen.getByTestId('ring')).toHaveTextContent('none');
  });
});
