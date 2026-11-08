import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { dispatchTouch } from '@/test/helpers/touch';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import MobileTouchContextMenu from './MobileTouchContextMenu';
import { useMobileSelectionStore } from '../store/mobileSelectionStore';

const offline = vi.hoisted(() => ({ active: false }));
vi.mock('@/features/offline', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline')>()),
  useOfflineBrowseContext: () => ({ active: offline.active }),
}));

function setup() {
  const onContextMenu = vi.fn((e: React.MouseEvent) => e.preventDefault());
  const onClick = vi.fn();
  renderWithProviders(
    <>
      <MobileTouchContextMenu />
      <button type="button" onContextMenu={onContextMenu} onClick={onClick}>row</button>
      <input aria-label="field" onContextMenu={onContextMenu} />
    </>,
  );
  return { onContextMenu, onClick, row: screen.getByText('row'), field: screen.getByLabelText('field') };
}

describe('MobileTouchContextMenu', () => {
  beforeEach(() => {
    resetAllStores();
    offline.active = false;
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('a long press opens the context menu at the finger', () => {
    const { onContextMenu, row } = setup();
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    const event = onContextMenu.mock.calls[0][0];
    expect([event.clientX, event.clientY]).toEqual([30, 40]);
  });

  it('swallows the click that follows the long press', () => {
    const { onClick, row } = setup();
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(500); });
    dispatchTouch(row, 'touchend', { x: 30, y: 40 });
    fireEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('a short tap stays a tap', () => {
    const { onContextMenu, onClick, row } = setup();
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(150); });
    dispatchTouch(row, 'touchend', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.click(row);
    expect(onContextMenu).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('moving the finger (scrolling) cancels the long press', () => {
    const { onContextMenu, row } = setup();
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    dispatchTouch(row, 'touchmove', { x: 30, y: 70 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it('leaves inputs alone', () => {
    const { onContextMenu, field } = setup();
    dispatchTouch(field, 'touchstart', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  describe('the ring', () => {
    const track = { id: 't1', title: 'Song', artist: 'Band', album: 'LP', albumId: 'a1', duration: 60 };
    function setupRow(type: 'song' | 'artist', item: unknown = track) {
      renderWithProviders(
        <>
          <MobileTouchContextMenu />
          <div
            data-testid="row"
            onContextMenu={e => {
              e.preventDefault();
              usePlayerStore.getState().openContextMenu(e.clientX, e.clientY, item, type);
            }}
          >
            row
          </div>
        </>,
      );
      return screen.getByTestId('row');
    }
    const hold = () => act(() => { vi.advanceTimersByTime(500); });
    const menuOpen = () => usePlayerStore.getState().contextMenu.isOpen;

    it('a song opens the ring instead of the menu', () => {
      const row = setupRow('song');
      act(() => { dispatchTouch(row, 'touchstart', { x: 200, y: 400 }); });
      hold();
      expect(document.querySelector('.queue-ring')).not.toBeNull();
      expect(menuOpen()).toBe(false);
    });

    it('letting go in the middle opens the full menu', () => {
      const row = setupRow('song');
      act(() => { dispatchTouch(row, 'touchstart', { x: 200, y: 400 }); });
      hold();
      act(() => { dispatchTouch(row, 'touchend', { x: 200, y: 400 }); });
      expect(menuOpen()).toBe(true);
      expect(document.querySelector('.queue-ring')).toBeNull();
    });

    it('sliding to a piece runs it and blocks scrolling meanwhile', () => {
      const row = setupRow('song');
      const playNext = vi.fn();
      usePlayerStore.setState({ playNext });
      act(() => { dispatchTouch(row, 'touchstart', { x: 200, y: 400 }); });
      hold();
      let moveEvent: Event | undefined;
      act(() => { moveEvent = dispatchTouch(row, 'touchmove', { x: 200, y: 320 }); });
      expect(moveEvent?.defaultPrevented).toBe(true);
      act(() => { dispatchTouch(row, 'touchend', { x: 200, y: 320 }); });
      expect(playNext).toHaveBeenCalledWith([track]);
      expect(menuOpen()).toBe(false);
    });

    const openRingOn = (extra: unknown[], item: unknown, type: 'song' | 'album', route = '/') => {
      renderWithProviders(
        <>
          <MobileTouchContextMenu />
          <div
            data-testid="row"
            onContextMenu={e => {
              e.preventDefault();
              const open = usePlayerStore.getState().openContextMenu as (...args: unknown[]) => void;
              open(e.clientX, e.clientY, item, type, ...extra);
            }}
          >
            row
          </div>
        </>,
        { route },
      );
      const row = screen.getByTestId('row');
      act(() => { dispatchTouch(row, 'touchstart', { x: 200, y: 400 }); });
      hold();
      return row;
    };
    const pieces = () => document.querySelectorAll('.queue-ring__slice').length;

    it('a song in an editable playlist gets a Remove piece that removes it', () => {
      const remove = vi.fn();
      const row = openRingOn([undefined, 'pl1', 3, undefined, undefined, remove], track, 'song');
      expect(pieces()).toBe(5);
      // Remove is the last of five pieces, clockwise from the top: towards the upper left.
      act(() => { dispatchTouch(row, 'touchmove', { x: 120, y: 370 }); });
      act(() => { dispatchTouch(row, 'touchend', { x: 120, y: 370 }); });
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('a song in a selectable list gets a Select piece that starts the selection', () => {
      renderWithProviders(
        <>
          <MobileTouchContextMenu />
          <div
            data-ring-select=""
            data-testid="selectable"
            onContextMenu={e => {
              e.preventDefault();
              usePlayerStore.getState().openContextMenu(e.clientX, e.clientY, track, 'song');
            }}
          >
            row
          </div>
        </>,
      );
      const row = screen.getByTestId('selectable');
      act(() => { dispatchTouch(row, 'touchstart', { x: 200, y: 400 }); });
      hold();
      expect(pieces()).toBe(5);
      // Select is the last of five pieces, clockwise from the top: towards the upper left.
      act(() => { dispatchTouch(row, 'touchmove', { x: 120, y: 370 }); });
      act(() => { dispatchTouch(row, 'touchend', { x: 120, y: 370 }); });
      expect(useMobileSelectionStore.getState().selected.map(t => t.id)).toEqual(['t1']);
      act(() => useMobileSelectionStore.getState().clear());
    });

    it('a song elsewhere has no Remove piece', () => {
      openRingOn([], track, 'song');
      expect(pieces()).toBe(4);
    });

    it('offline, nothing that changes the server is offered', () => {
      offline.active = true;
      openRingOn([undefined, 'pl1', 3, undefined, undefined, vi.fn()], track, 'song');
      expect(pieces()).toBe(3);
    });

    const album = { id: 'al1', name: 'LP', artist: 'Band', artistId: 'ar1', songCount: 1, duration: 60 };

    it('an album offers its artist', () => {
      openRingOn([], album, 'album');
      expect(pieces()).toBe(4);
    });

    it('an album on the page of its artist does not', () => {
      openRingOn([], album, 'album', '/artist/ar1');
      expect(pieces()).toBe(3);
    });

    it('a row that asks for its menu a moment later still gets the ring while the finger is down', () => {
      renderWithProviders(
        <>
          <MobileTouchContextMenu />
          <div
            data-testid="late"
            onContextMenu={e => {
              e.preventDefault();
              const { clientX, clientY } = e;
              window.setTimeout(() => usePlayerStore.getState().openContextMenu(clientX, clientY, track, 'song'), 20);
            }}
          >
            late
          </div>
        </>,
      );
      act(() => { dispatchTouch(screen.getByTestId('late'), 'touchstart', { x: 200, y: 400 }); });
      hold();
      act(() => { vi.advanceTimersByTime(30); });
      expect(document.querySelector('.queue-ring')).not.toBeNull();
      expect(menuOpen()).toBe(false);
    });

    it('an artist keeps the plain menu', () => {
      const row = setupRow('artist', { id: 'x', name: 'Band' });
      act(() => { dispatchTouch(row, 'touchstart', { x: 200, y: 400 }); });
      hold();
      expect(document.querySelector('.queue-ring')).toBeNull();
      expect(menuOpen()).toBe(true);
    });

    it('never leaves the takeover behind for later menus', () => {
      const row = setupRow('song');
      act(() => { dispatchTouch(row, 'touchstart', { x: 200, y: 400 }); });
      hold();
      act(() => { dispatchTouch(row, 'touchcancel', { x: 200, y: 400 }); });
      act(() => { usePlayerStore.getState().openContextMenu(1, 2, track, 'song'); });
      expect(menuOpen()).toBe(true);
    });
  });

  it('the next tap after a long press is a normal click again', () => {
    const { onClick, row } = setup();
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(500); });
    dispatchTouch(row, 'touchend', { x: 30, y: 40 });
    // No click arrived after the long press; the next touch clears the swallow.
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    dispatchTouch(row, 'touchend', { x: 30, y: 40 });
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
