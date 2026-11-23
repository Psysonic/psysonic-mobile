import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/lib/media/trackTypes';

const lists: Record<string, unknown> = {};
const shown: Record<string, Track[]> = {};

vi.mock('@/features/mobileShell/android/androidAuto', () => ({
  carListJson: vi.fn(async (node: string) => JSON.stringify(lists[node] ?? { sections: [] })),
}));
vi.mock('@/features/mobileShell/car/carplayContent', () => ({
  carPlayShownTracks: (node: string) => shown[node],
  carPlayRandomMixTracks: async () => [track('r1')],
  carPlayFavoriteTracks: async () => [],
  carPlayOfflineTracks: async () => null,
  carPlayShownStation: (index: number) => (index === 0 ? { id: 's', name: 'Station', streamUrl: 'https://radio/s' } : undefined),
}));
vi.mock('@/features/playback/utils/playback/resolvePlaybackUrl', () => ({
  resolvePlaybackUrl: (id: string) => (id === 'local' ? 'psysonic-local:///files/local.flac' : `https://srv/stream?id=${id}`),
}));
vi.mock('@/lib/api/subsonicStreamUrl', () => ({
  buildStreamUrlForServer: (_sid: string, id: string) => `https://srv/stream?id=${id}&raw`,
}));
vi.mock('@/features/playback/utils/playback/playbackServer', () => ({ playbackCacheKeyForTrack: () => 'srv' }));
const coverPaths = vi.fn(async (_albums: Array<{ albumId: string }>) => new Map([['a1', '/covers/a1.jpg']]));
vi.mock('@/features/mobileShell/car/carplayCovers', () => ({
  carAlbumCoverPaths: (albums: Array<{ albumId: string }>) => coverPaths(albums),
}));
vi.mock('@/features/playback/store/queueTrackView', () => ({
  resolveQueueTrack: (ref: { trackId: string }) => track(ref.trackId, ref.trackId === 't3' ? 'a2' : 'a1'),
}));

const { buildCarSnapshot, buildCarResume } = await import('./androidAutoSnapshot');
const { usePlayerStore } = await import('@/features/playback');

function track(id: string, albumId = 'a1'): Track {
  return { id, title: `Song ${id}`, artist: 'Artist', album: 'Album', albumId, duration: 200, serverId: 'srv' };
}

const row = (node: string, browse: boolean, image = '') => ({ node, title: node, subtitle: '', browse, image });

describe('buildCarSnapshot', () => {
  beforeEach(() => {
    for (const key of Object.keys(lists)) delete lists[key];
    for (const key of Object.keys(shown)) delete shown[key];
  });

  it('walks the lists the car opens, keeps the tracks they play and drops rows the copy cannot answer', async () => {
    lists.tabs = { sections: [{ header: '', grid: false, items: [row('home', true), row('library', true)] }] };
    lists.home = {
      sections: [
        { header: 'Quick', grid: false, items: [row('random', false), row('favplay', false), row('resume', false)] },
        { header: 'Recent', grid: true, items: [row('album|srv|a1', true, '/covers/a1.jpg'), row('feed|recentlyPlayed', true)] },
      ],
    };
    lists.library = { sections: [{ header: '', grid: false, items: [row('artists', true), row('radio', true)] }] };
    lists['feed|recentlyPlayed'] = { sections: [] };
    lists.radio = { sections: [{ header: '', grid: false, items: [row('radio|0', false), row('radio|1', false)] }] };
    lists['album|srv|a1'] = {
      sections: [
        { header: '', grid: false, items: [row('playall|album%7Csrv%7Ca1', false)] },
        { header: '', grid: false, items: [row('track|album%7Csrv%7Ca1|0', false)] },
      ],
    };
    shown['album|srv|a1'] = [track('t1'), track('local')];

    const snapshot = await buildCarSnapshot();

    expect(Object.keys(snapshot.lists).sort()).toEqual(
      ['album|srv|a1', 'feed|recentlyPlayed', 'home', 'library', 'radio', 'tabs'],
    );
    // The whole-library catalogues are not copied, so their rows go.
    expect(snapshot.lists.library.sections[0].items.map(item => item.node)).toEqual(['radio']);
    // No favourites to play: that row goes, the mix and resume stay.
    expect(snapshot.lists.home.sections[0].items.map(item => item.node)).toEqual(['random', 'resume']);
    expect(snapshot.lists.radio.sections[0].items.map(item => item.node)).toEqual(['radio|0']);
    expect(snapshot.stations['0']).toEqual({ name: 'Station', url: 'https://radio/s', image: '' });
    expect(snapshot.plays.random.map(entry => entry.track.id)).toEqual(['r1']);

    const album = snapshot.plays['album|srv|a1'];
    expect(album.map(entry => entry.track.id)).toEqual(['t1', 'local']);
    expect(album[0]).toMatchObject({ url: 'https://srv/stream?id=t1', stream: 'https://srv/stream?id=t1', cover: '/covers/a1.jpg' });
    // A downloaded song keeps a stream to fall back on.
    expect(album[1]).toMatchObject({ url: 'psysonic-local:///files/local.flac', stream: 'https://srv/stream?id=local&raw' });
  });
});

describe('buildCarResume', () => {
  it('carries each track\'s album cover, so the car shows covers when it resumes with the app closed', async () => {
    usePlayerStore.setState({
      queueItems: ['t0', 't1', 't2', 't3'].map(trackId => ({ serverId: 'srv', trackId })),
      queueIndex: 1,
      currentTime: 42,
      currentRadio: null,
    });

    const resume = await buildCarResume();

    expect(resume?.positionSecs).toBe(42);
    expect(resume?.tracks.map(entry => [entry.track.id, entry.cover])).toEqual([
      ['t1', '/covers/a1.jpg'],
      ['t2', '/covers/a1.jpg'],
      // No cover on disk and none to fetch: the car shows none, as before.
      ['t3', ''],
    ]);
    expect(coverPaths).toHaveBeenCalledWith([
      { albumId: 'a1', coverArt: undefined, serverId: 'srv' },
      { albumId: 'a1', coverArt: undefined, serverId: 'srv' },
      { albumId: 'a2', coverArt: undefined, serverId: 'srv' },
    ]);
  });

  it('keeps no queue for radio', async () => {
    usePlayerStore.setState({ currentRadio: { id: 's', name: 'Station', streamUrl: 'https://radio/s' } as never });
    expect(await buildCarResume()).toBeNull();
  });
});
