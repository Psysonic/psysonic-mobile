import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const events = vi.hoisted(() => ({ handlers: new Map<string, () => void>() }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: () => void) => {
    events.handlers.set(name, handler);
    return () => { events.handlers.delete(name); };
  }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));

import { usePlayerStore } from '@/features/playback/store/playerStore';
import type { Track } from '@/lib/media/trackTypes';
import { useEqStore } from '@/store/eqStore';
import { useMobilePlaybackStore } from '@/features/mobileShell/store/mobilePlaybackStore';
import { resetAllStores } from '@/test/helpers/storeReset';
import { resumeWhenCarReconnects } from './carResume';

const track: Track = { id: 't1', title: 'Song', artist: 'Artist', album: 'Album', albumId: 'a1', duration: 200, serverId: 's1' };
const resume = vi.fn();
const flush = () => vi.advanceTimersByTimeAsync(0);
const setCar = (connected: boolean) => useEqStore.setState({ carActive: connected });
const setPlaying = (isPlaying: boolean) => usePlayerStore.setState({ isPlaying });

describe('resumeWhenCarReconnects', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    resetAllStores();
    events.handlers.clear();
    resume.mockReset();
    usePlayerStore.setState({ currentTrack: track, currentRadio: null, isPlaying: true, resume });
    useEqStore.setState({ carActive: true });
    useMobilePlaybackStore.setState({ resumeOnCarConnect: true });
    stop = resumeWhenCarReconnects();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  /** Engine off: the lost route pauses the player, then the car reports it is gone. */
  const carLeaves = () => {
    setPlaying(false);
    setCar(false);
  };

  it('resumes once the native side has settled the output on the car', async () => {
    carLeaves();
    setCar(true);
    await flush();
    expect(resume).not.toHaveBeenCalled();
    events.handlers.get('audio:output-released')?.();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('resumes after a while when no output event comes', async () => {
    carLeaves();
    setCar(true);
    await vi.advanceTimersByTimeAsync(4000);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('does nothing with the setting off', async () => {
    useMobilePlaybackStore.setState({ resumeOnCarConnect: false });
    carLeaves();
    setCar(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(resume).not.toHaveBeenCalled();
  });

  it('does not start what was paused well before the car went away', async () => {
    setPlaying(false);
    await vi.advanceTimersByTimeAsync(10_000);
    setCar(false);
    setCar(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(resume).not.toHaveBeenCalled();
  });

  it('forgets the car once music played and stopped away from it', async () => {
    carLeaves();
    setPlaying(true);
    setPlaying(false);
    setCar(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(resume).not.toHaveBeenCalled();
  });

  it('leaves it to the car when the car starts playback itself', async () => {
    carLeaves();
    setCar(true);
    setPlaying(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(resume).not.toHaveBeenCalled();
  });
});
