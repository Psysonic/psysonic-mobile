import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  player: {} as Record<string, unknown>,
  pause: vi.fn(),
  resume: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
  carPlayPlay: vi.fn(async () => {}),
  carPlayPlayList: vi.fn(async () => {}),
  recentRows: [] as Array<Record<string, unknown>>,
  /** Cover path per entity id; ids not listed have no cover on disk. */
  covers: {} as Record<string, string>,
}));

vi.mock('@/features/playback', () => ({
  usePlayerStore: {
    getState: () => ({
      pause: mocks.pause,
      resume: mocks.resume,
      next: mocks.next,
      previous: mocks.previous,
      queueItems: [],
      queueIndex: 0,
      currentTrack: null,
      currentRadio: null,
      isPlaying: false,
      currentTime: 0,
      ...mocks.player,
    }),
  },
  resolveQueueTrack: (ref: { trackId: string }) => ({
    id: ref.trackId, title: `Song ${ref.trackId}`, artist: 'Band', albumId: `al-${ref.trackId}`, serverId: 'srv',
  }),
}));
vi.mock('@/features/mobileShell/car/carplayContent', () => ({
  carPlayMixItem: () => ({ node: 'luckymix', title: 'Lucky Mix', subtitle: 'From your library', browse: false }),
  carPlayPlay: mocks.carPlayPlay,
  carPlayPlayList: mocks.carPlayPlayList,
  carPlayRecentlyPlayedRows: vi.fn(async () => mocks.recentRows),
}));
vi.mock('@/features/mobileShell/car/carplayCovers', () => ({
  attachCarPlayCovers: vi.fn(async (sections: Array<{ items: Array<{ cover?: { id: string }; image?: string }> }>) => {
    for (const item of sections[0].items) {
      if (item.cover && mocks.covers[item.cover.id]) item.image = mocks.covers[item.cover.id];
    }
    return null;
  }),
}));

import { buildWidgetSnapshot, cssColorToHex, loadWidgetRecentAlbums, runWidgetCommand } from './widgetSnapshot';

describe('cssColorToHex', () => {
  it('turns the theme colour forms into #rrggbb', () => {
    expect(cssColorToHex(' #CBA6F7 ')).toBe('#cba6f7');
    expect(cssColorToHex('#fa0')).toBe('#ffaa00');
    expect(cssColorToHex('rgb(203, 166, 247)')).toBe('#cba6f7');
    expect(cssColorToHex('rgba(1 2 3 / 0.5)')).toBe('#010203');
  });

  it('drops what it cannot read', () => {
    expect(cssColorToHex('')).toBeUndefined();
    expect(cssColorToHex('var(--x)')).toBeUndefined();
    expect(cssColorToHex('rgb(300, 0, 0)')).toBeUndefined();
  });
});

describe('buildWidgetSnapshot', () => {
  beforeEach(() => {
    mocks.player = {};
    mocks.covers = {};
    vi.useRealTimers();
  });

  it('nothing playing: no song, the mix and the labels still go out', async () => {
    const snapshot = await buildWidgetSnapshot([]);
    expect(snapshot.now).toBeNull();
    expect(snapshot.next).toEqual([]);
    expect(snapshot.mix).toEqual({ title: 'Lucky Mix', hint: 'From your library' });
    expect(Object.values(snapshot.labels).every(label => label.length > 0)).toBe(true);
  });

  it('a playing song carries its cover, position and where it would have started', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    mocks.covers = { 'al-1': '/covers/al-1/256.webp' };
    mocks.player = {
      currentTrack: { id: 't1', title: 'Tide', artist: 'Band', album: 'Harbor', albumId: 'al-1', serverId: 'srv', duration: 200 },
      isPlaying: true,
      currentTime: 30,
      queueItems: [{ trackId: 't1' }, { trackId: '2' }, { trackId: '3' }, { trackId: '4' }, { trackId: '5' }],
      queueIndex: 0,
    };
    const snapshot = await buildWidgetSnapshot([]);
    expect(snapshot.now).toEqual({
      title: 'Tide', artist: 'Band', album: 'Harbor', playing: true,
      startedAt: Date.parse('2026-11-03T12:00:00Z') / 1000 - 30,
      elapsed: 30, duration: 200, image: '/covers/al-1/256.webp',
    });
    // Up next: the three songs after the playing one, no `cover` field left for native.
    expect(snapshot.next.map(song => song.title)).toEqual(['Song 2', 'Song 3', 'Song 4']);
    expect(snapshot.next.every(song => !('cover' in song))).toBe(true);
  });

  it('a paused song has no start time, so the widgets show a still bar', async () => {
    mocks.player = {
      currentTrack: { id: 't1', title: 'Tide', artist: 'Band', album: 'Harbor', albumId: 'al-1', duration: 200 },
      isPlaying: false,
      currentTime: 50,
    };
    const snapshot = await buildWidgetSnapshot([]);
    expect(snapshot.now?.startedAt).toBeUndefined();
    expect(snapshot.now?.elapsed).toBe(50);
  });

  it('radio shows the station', async () => {
    mocks.player = {
      currentRadio: { id: 'r1', name: 'Night Waves', streamUrl: 'http://x', coverArt: 'ra-1', serverId: 'srv' },
      isPlaying: true,
    };
    const snapshot = await buildWidgetSnapshot([]);
    expect(snapshot.now).toMatchObject({ title: 'Night Waves', radio: true, playing: true, duration: 0 });
  });
});

describe('loadWidgetRecentAlbums', () => {
  it('keeps four albums with their nodes and covers', async () => {
    mocks.covers = { a1: '/covers/a1.webp' };
    mocks.recentRows = ['a1', 'a2', 'a3', 'a4', 'a5'].map(id => ({
      node: `album|srv|${id}`, title: `Album ${id}`, subtitle: 'Band', browse: true,
      cover: { kind: 'album', id, serverId: 'srv' },
    }));
    const albums = await loadWidgetRecentAlbums();
    expect(albums).toHaveLength(4);
    expect(albums[0]).toEqual({ node: 'album|srv|a1', title: 'Album a1', artist: 'Band', image: '/covers/a1.webp' });
    expect(albums[1].image).toBeUndefined();
  });
});

describe('runWidgetCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.player = {};
  });

  it('play/pause, next and previous go to the player', async () => {
    await runWidgetCommand('toggle');
    await runWidgetCommand('next');
    await runWidgetCommand('previous');
    expect(mocks.resume).toHaveBeenCalledTimes(1);
    expect(mocks.next).toHaveBeenCalledWith(true);
    expect(mocks.previous).toHaveBeenCalledTimes(1);
  });

  it('play/pause pauses a playing song, each tap again (no timer between taps)', async () => {
    mocks.player = { isPlaying: true };
    await runWidgetCommand('toggle');
    await runWidgetCommand('toggle');
    expect(mocks.pause).toHaveBeenCalledTimes(2);
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it('the mix button starts the mix the car lists would', async () => {
    await runWidgetCommand('mix');
    expect(mocks.carPlayPlay).toHaveBeenCalledWith('luckymix');
  });

  it('an album tile plays that album', async () => {
    await runWidgetCommand('album:album|srv|a1');
    expect(mocks.carPlayPlayList).toHaveBeenCalledWith('album|srv|a1');
  });

  it('an unknown action does nothing', async () => {
    await runWidgetCommand('rewind');
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.carPlayPlay).not.toHaveBeenCalled();
    expect(mocks.carPlayPlayList).not.toHaveBeenCalled();
  });
});
