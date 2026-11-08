import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/lib/api/subsonic', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/subsonic')>('@/lib/api/subsonic');
  return {
    ...actual,
    savePlayQueue: vi.fn(async () => undefined),
    getPlayQueue: vi.fn(async () => ({ songs: [], current: undefined, position: 0 })),
  };
});

import { usePlayerStore } from '@/features/playback/store/playerStore';
import { resetPlayerStore } from '@/test/helpers/storeReset';
import { makeTracks, seedQueue } from '@/test/helpers/factories';
import { onInvoke } from '@/test/mocks/tauri';
import { useQueueTouchRowActions } from '@/features/queue/hooks/useQueueTouchRowActions';

const tracks = makeTracks(4);
const order = () => usePlayerStore.getState().queueItems.map(r => r.trackId);
const ids = (...i: number[]) => i.map(n => tracks[n].id);

describe('useQueueTouchRowActions', () => {
  beforeEach(() => {
    resetPlayerStore();
    onInvoke('audio_stop', () => undefined);
    onInvoke('audio_play', () => undefined);
    onInvoke('audio_update_replay_gain', () => undefined);
    seedQueue(tracks, { index: 0, currentTrack: tracks[0] });
  });

  const setup = () => renderHook(() => useQueueTouchRowActions({ current: false }));

  it('"play next" moves the row right behind the playing track, with undo', () => {
    const { result } = setup();
    act(() => result.current.run('next', { kind: 'queue', idx: 3 }, { x: 0, y: 0 }));
    expect(order()).toEqual(ids(0, 3, 1, 2));
    expect(result.current.notice?.undoable).toBe(true);

    act(() => result.current.undo());
    expect(order()).toEqual(ids(0, 1, 2, 3));
    expect(result.current.notice).toBeNull();
  });

  it('"remove" takes the row out and undo brings it back in place', () => {
    const { result } = setup();
    act(() => result.current.run('remove', { kind: 'queue', idx: 2 }, { x: 0, y: 0 }));
    expect(order()).toEqual(ids(0, 1, 3));
    expect(result.current.notice?.undoable).toBe(true);

    act(() => result.current.undo());
    expect(order()).toEqual(ids(0, 1, 2, 3));
  });

  it('never touches the playing row, and a pick of nothing does nothing', () => {
    const { result } = setup();
    act(() => result.current.run('remove', { kind: 'queue', idx: 0 }, { x: 0, y: 0 }));
    act(() => result.current.run(null, { kind: 'queue', idx: 2 }, { x: 0, y: 0 }));
    expect(order()).toEqual(ids(0, 1, 2, 3));
    expect(result.current.notice).toBeNull();
  });

  it('a track outside the queue plays next as a new row, with undo', () => {
    const { result } = setup();
    const other = makeTracks(5)[4];
    const row = document.createElement('div');
    act(() => result.current.run('next', { kind: 'track', track: other, row }, { x: 0, y: 0 }));
    expect(order()).toEqual([tracks[0].id, other.id, tracks[1].id, tracks[2].id, tracks[3].id]);
    expect(result.current.notice?.undoable).toBe(true);

    act(() => result.current.undo());
    expect(order()).toEqual(ids(0, 1, 2, 3));
  });

  it('the full menu of a track outside the queue comes from its own row', () => {
    const { result } = setup();
    const row = document.createElement('div');
    const onMenu = vi.fn();
    row.addEventListener('contextmenu', onMenu);
    act(() => result.current.run('menu', { kind: 'track', track: tracks[0], row }, { x: 10, y: 20 }));
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it('the row already next stays put and offers no undo', () => {
    const { result } = setup();
    act(() => result.current.run('next', { kind: 'queue', idx: 1 }, { x: 0, y: 0 }));
    expect(order()).toEqual(ids(0, 1, 2, 3));
    expect(result.current.notice?.undoable).toBe(false);
  });
});
