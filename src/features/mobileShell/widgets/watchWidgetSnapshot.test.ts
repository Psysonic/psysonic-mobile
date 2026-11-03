import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    state: {} as Record<string, unknown>,
    listeners,
    build: vi.fn(),
    recent: vi.fn(async () => [] as unknown[]),
  };
});

vi.mock('@/features/playback', () => ({
  usePlayerStore: {
    getState: () => mocks.state,
    subscribe: (listener: () => void) => {
      mocks.listeners.add(listener);
      return () => mocks.listeners.delete(listener);
    },
  },
  resolveQueueTrack: (ref: { trackId: string }) => ({ id: ref.trackId }),
}));
vi.mock('./widgetSnapshot', () => ({
  buildWidgetSnapshot: mocks.build,
  loadWidgetRecentAlbums: mocks.recent,
}));

import { watchWidgetSnapshot } from './watchWidgetSnapshot';

/** The player store changes: a position tick, a new song, a seek. */
function change(patch: Record<string, unknown>) {
  Object.assign(mocks.state, patch);
  for (const listener of mocks.listeners) listener();
}

/** Lets pending flushes (a timer, then promise chains) run through. */
async function settle(ms = 700) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('watchWidgetSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    mocks.listeners.clear();
    mocks.state = {
      currentTrack: { id: 't1', albumId: 'al-1' },
      currentRadio: null,
      isPlaying: true,
      currentTime: 10,
      queueItems: [{ trackId: 't1' }, { trackId: 't2' }],
      queueIndex: 0,
    };
    // The snapshot follows the song, like the real one.
    mocks.build.mockReset().mockImplementation(async () => ({
      now: { title: (mocks.state.currentTrack as { id: string }).id, playing: mocks.state.isPlaying, startedAt: Date.now() / 1000 },
    }));
    mocks.recent.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends once at the start', async () => {
    const send = vi.fn();
    const stop = watchWidgetSnapshot(send);
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(mocks.recent).toHaveBeenCalledTimes(1);
    stop();
  });

  it('position ticks of a playing song send nothing more', async () => {
    const send = vi.fn();
    const stop = watchWidgetSnapshot(send);
    await settle();
    for (let second = 1; second <= 10; second += 1) {
      vi.setSystemTime(Date.parse('2026-11-03T12:00:00Z') + second * 1000);
      change({ currentTime: 10 + second });
      await settle(300);
    }
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a new song, a pause and a seek each send once more', async () => {
    const send = vi.fn();
    const stop = watchWidgetSnapshot(send);
    await settle();

    change({ currentTrack: { id: 't2', albumId: 'al-1' }, queueIndex: 1, currentTime: 0 });
    await settle();
    expect(send).toHaveBeenCalledTimes(2);

    change({ isPlaying: false });
    await settle();
    expect(send).toHaveBeenCalledTimes(3);

    change({ isPlaying: true });
    await settle();
    change({ currentTime: 120 });
    await settle();
    expect(send).toHaveBeenCalledTimes(5);
    stop();
  });

  it('skipping quickly through songs sends the last one, not each', async () => {
    const send = vi.fn();
    const stop = watchWidgetSnapshot(send);
    await settle();
    for (const id of ['t2', 't3', 't4']) {
      change({ currentTrack: { id, albumId: 'al-1' } });
      await settle(100);
    }
    await settle();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].now.title).toBe('t4');
    stop();
  });

  it('a new album reloads the recently played albums, at most once a minute', async () => {
    const stop = watchWidgetSnapshot(vi.fn());
    await settle();
    change({ currentTrack: { id: 't2', albumId: 'al-2' } });
    await settle();
    expect(mocks.recent).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.parse('2026-11-03T12:01:30Z'));
    change({ currentTrack: { id: 't3', albumId: 'al-3' } });
    await settle();
    expect(mocks.recent).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a hidden page sends at once, without waiting for a timer', async () => {
    const send = vi.fn();
    const stop = watchWidgetSnapshot(send);
    await settle();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    change({ isPlaying: false });
    // Promise chains only, no timer: a paused Android web view runs no timers.
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].now.playing).toBe(false);
    visibility.mockRestore();
    stop();
  });

  it('nothing goes out after stop', async () => {
    const send = vi.fn();
    const stop = watchWidgetSnapshot(send);
    await settle();
    stop();
    change({ currentTrack: { id: 't9', albumId: 'al-9' } });
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
