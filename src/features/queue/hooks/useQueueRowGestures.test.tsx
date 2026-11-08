import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { dispatchTouch } from '@/test/helpers/touch';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { resetAllStores } from '@/test/helpers/storeReset';
import {
  RING_EXIT_MS,
  RING_HOLD_MS,
  SWIPE_OUT_MS,
  useQueueRowGestures,
  type QueueRowTarget,
} from '@/features/queue/hooks/useQueueRowGestures';
import type { QueueRingPick } from '@/features/queue/utils/queueRingGeometry';

const targetId = (target: QueueRowTarget) => {
  if (target.kind === 'queue') return target.idx;
  return target.kind === 'track' ? target.track.id : '';
};

function Harness({ onPick }: { onPick: (pick: QueueRingPick, id: number | string) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  const ring = useQueueRowGestures({ listRef, enabled: true, onPick: (p, target) => onPick(p, targetId(target)) });
  return (
    <>
      <div ref={listRef}>
        {[0, 1, 2, 3].map(i => (
          <div key={i}><div data-queue-idx={i} data-testid={`row-${i}`}>
            Row {i}
            <button type="button">grip {i}</button>
          </div></div>
        ))}
        <div><div data-timeline-kind="history" data-history-server="srv" data-history-track="h1" data-testid="history">
          Played before
        </div></div>
      </div>
      <output data-testid="ring">
        {ring ? `${targetId(ring.target)}:${ring.pick}${ring.leaving ? ':leaving' : ''}:${ring.actions.length}` : 'none'}
      </output>
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
    expect(screen.getByTestId('ring')).toHaveTextContent('2:menu:5');

    let moveEvent: Event | undefined;
    act(() => { moveEvent = dispatchTouch(row(2), 'touchmove', at(200, 320)); });
    expect(moveEvent?.defaultPrevented).toBe(true);
    expect(screen.getByTestId('ring')).toHaveTextContent('2:next:5');

    act(() => { dispatchTouch(row(2), 'touchend', at(200, 320)); });
    expect(onPick).toHaveBeenCalledWith('next', 2);
  });

  it('the picked piece lingers after letting go, then the ring is gone; the action runs at once', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    act(() => { dispatchTouch(row(2), 'touchstart', at(200, 400)); });
    hold();
    act(() => { dispatchTouch(row(2), 'touchmove', at(200, 320)); });
    act(() => { dispatchTouch(row(2), 'touchend', at(200, 320)); });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ring')).toHaveTextContent('2:next:leaving');
    act(() => { vi.advanceTimersByTime(RING_EXIT_MS); });
    expect(screen.getByTestId('ring')).toHaveTextContent('none');
  });

  it('the middle (full menu) leaves at once: the menu takes over', () => {
    render(<Harness onPick={vi.fn()} />);
    act(() => { dispatchTouch(row(2), 'touchstart', at(200, 400)); });
    hold();
    act(() => { dispatchTouch(row(2), 'touchend', at(200, 400)); });
    expect(screen.getByTestId('ring')).toHaveTextContent('none');
  });

  it('a new hold during the linger is not closed by the old timer', () => {
    render(<Harness onPick={vi.fn()} />);
    act(() => { dispatchTouch(row(2), 'touchstart', at(200, 400)); });
    hold();
    act(() => { dispatchTouch(row(2), 'touchmove', at(200, 320)); });
    act(() => { dispatchTouch(row(2), 'touchend', at(200, 320)); });
    act(() => { dispatchTouch(row(3), 'touchstart', at(200, 400)); });
    hold();
    act(() => { vi.advanceTimersByTime(RING_EXIT_MS); });
    expect(screen.getByTestId('ring')).toHaveTextContent('3:menu:5');
  });

  it('a track played before gets the ring without Remove', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const history = screen.getByTestId('history');
    act(() => { dispatchTouch(history, 'touchstart', at(200, 400)); });
    hold();
    expect(screen.getByTestId('ring')).toHaveTextContent('h1:menu:4');
    act(() => { dispatchTouch(history, 'touchmove', at(200, 320)); });
    act(() => { dispatchTouch(history, 'touchend', at(200, 320)); });
    expect(onPick).toHaveBeenCalledWith('next', 'h1');
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
      // The row runs all the way across first.
      expect(onPick).not.toHaveBeenCalled();
      expect(row(2).style.getPropertyValue('--swipe-dx')).toBe('-390px');
      expect(row(2).classList.contains('queue-item--swipe-out')).toBe(true);
      act(() => { vi.advanceTimersByTime(SWIPE_OUT_MS); });
      expect(onPick).toHaveBeenCalledWith('remove', 2);
      expect(row(2).classList.contains('queue-item--swiping')).toBe(false);
      expect(row(2).classList.contains('queue-item--swipe-out')).toBe(false);
      expect(track.dataset.swipe).toBeUndefined();
    });

    it('swiping right plays the row next', () => {
      const onPick = vi.fn();
      render(<Harness onPick={onPick} />);
      act(() => { dispatchTouch(row(3), 'touchstart', at(50, 400)); });
      act(() => { dispatchTouch(row(3), 'touchmove', at(100, 400)); });
      act(() => { dispatchTouch(row(3), 'touchmove', at(200, 400)); });
      act(() => { dispatchTouch(row(3), 'touchend', at(200, 400)); });
      act(() => { vi.advanceTimersByTime(SWIPE_OUT_MS); });
      expect(onPick).toHaveBeenCalledWith('next', 3);
    });

    it('a track played before swipes right to play next, never left', () => {
      const onPick = vi.fn();
      render(<Harness onPick={onPick} />);
      const history = screen.getByTestId('history');
      act(() => { dispatchTouch(history, 'touchstart', at(300, 400)); });
      act(() => { dispatchTouch(history, 'touchmove', at(150, 400)); });
      expect(history.classList.contains('queue-item--swiping')).toBe(false);
      act(() => { dispatchTouch(history, 'touchend', at(150, 400)); });
      expect(onPick).not.toHaveBeenCalled();

      act(() => { dispatchTouch(history, 'touchstart', at(50, 400)); });
      act(() => { dispatchTouch(history, 'touchmove', at(100, 400)); });
      act(() => { dispatchTouch(history, 'touchmove', at(250, 400)); });
      act(() => { dispatchTouch(history, 'touchend', at(250, 400)); });
      act(() => { vi.advanceTimersByTime(SWIPE_OUT_MS); });
      expect(onPick).toHaveBeenCalledWith('next', 'h1');
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
