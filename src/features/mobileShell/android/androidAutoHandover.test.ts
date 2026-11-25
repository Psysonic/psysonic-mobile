import { beforeEach, describe, expect, it, vi } from 'vitest';

const playback = vi.hoisted(() => ({
  preparePausedRestoreOnStartup: vi.fn(),
  bindQueueServerId: vi.fn(),
  seedQueueResolver: vi.fn(),
  setSeekFallbackVisualTarget: vi.fn(),
  submitTrackScrobble: vi.fn(),
}));

vi.mock('@/features/playback', async importOriginal => ({
  ...(await importOriginal<object>()),
  ...playback,
  playbackCacheKeyForTrack: () => 'srv',
}));

import { usePlayerStore } from '@/features/playback/store/playerStore';
import { makeTrack } from '@/test/helpers/factories';
import { resetAllStores } from '@/test/helpers/storeReset';
import { applyCarHandover } from './androidAutoSnapshot';

const tracks = [makeTrack({ id: 't1', serverId: 'srv' }), makeTrack({ id: 't2', serverId: 'srv' })];

describe('applyCarHandover', () => {
  let playTrack: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetAllStores();
    vi.clearAllMocks();
    playTrack = vi.fn();
    usePlayerStore.setState({ playTrack, isPlaying: false } as never);
  });

  it('loads a queue paused in the car paused at its spot, without playing it', () => {
    applyCarHandover({ tracks, index: 1, positionSecs: 42, playing: false, played: [] });

    expect(playTrack).not.toHaveBeenCalled();
    expect(playback.preparePausedRestoreOnStartup).toHaveBeenCalledWith(
      tracks[1],
      expect.arrayContaining([expect.objectContaining({ trackId: 't2' })]),
      1,
      42,
    );
    const state = usePlayerStore.getState();
    expect(state.currentTrack?.id).toBe('t2');
    expect(state.queueIndex).toBe(1);
    expect(state.currentTime).toBe(42);
  });

  it('starts a queue playing in the car at its spot', () => {
    applyCarHandover({ tracks, index: 0, positionSecs: 42, playing: true, played: [] });

    expect(playback.setSeekFallbackVisualTarget).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: 't1', seconds: 42 }),
    );
    expect(playTrack).toHaveBeenCalledWith(tracks[0], tracks, true, false, 0);
    expect(playback.preparePausedRestoreOnStartup).not.toHaveBeenCalled();
  });

  it('scrobbles what the car player played', () => {
    applyCarHandover({ tracks, index: 0, positionSecs: 0, playing: true, played: [{ track: tracks[0], startedAtMs: 5 }] });
    expect(playback.submitTrackScrobble).toHaveBeenCalledWith(tracks[0], 'srv', 5);
  });
});
