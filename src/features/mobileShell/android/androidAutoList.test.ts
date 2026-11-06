import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  carPlayCommand: vi.fn(),
  state: { shuffle: false, repeat: 'off', starred: false, infinite: false, hasTrack: true, upNextTitle: '', albumTitle: '' },
  playerListeners: [] as Array<() => void>,
}));

vi.mock('@/lib/util/platform', async importOriginal => ({ ...(await importOriginal<object>()), IS_ANDROID: true }));
vi.mock('@/features/mobileShell/car/carplayContent', () => ({
  carPlayPlay: vi.fn(),
  watchCarSongTabs: () => () => {},
  carPlayCommand: mocks.carPlayCommand,
  carPlayState: () => mocks.state,
  carPlayList: vi.fn(async (): Promise<unknown> => ({
    sections: [
      { header: 'Quick play', items: [{ node: 'random', title: 'Random mix', browse: false }] },
      {
        header: 'Recently played',
        more: 'feed|recentlyPlayed',
        items: [{ node: 'album|srv|al1', title: 'Record', subtitle: 'Band', browse: true, image: '/c/al1.jpg' }],
      },
    ],
  })),
}));
vi.mock('@/features/playback', () => ({
  usePlayerStore: {
    subscribe: (listener: () => void) => {
      mocks.playerListeners.push(listener);
      return () => { mocks.playerListeners = mocks.playerListeners.filter(l => l !== listener); };
    },
  },
}));
vi.mock('@/store/authStore', () => ({ useAuthStore: { subscribe: () => () => {} } }));

import { carPlayList } from '@/features/mobileShell/car/carplayContent';
import type { CarPlayCoverUpdate } from '@/features/mobileShell/car/carplayCovers';
import { carListJson, installAndroidAuto } from './androidAuto';

describe('carListJson', () => {
  it('marks a cover row as a grid, at most eight albums, with a last "show all" row that opens the full list', async () => {
    const { sections } = JSON.parse(await carListJson('home'));
    expect(sections[0]).toMatchObject({ header: 'Quick play', grid: false });
    expect(sections[1].grid).toBe(true);
    expect(sections[1].items).toEqual([
      { node: 'album|srv|al1', title: 'Record', subtitle: 'Band', browse: true, image: '/c/al1.jpg' },
      expect.objectContaining({ node: 'feed|recentlyPlayed', browse: true }),
    ]);
  });
});

describe('carListJson cover follow-up', () => {
  afterEach(() => {
    delete (window as unknown as { PsysonicAndroidMedia?: unknown }).PsysonicAndroidMedia;
  });

  const listWithRefresh = (downloaded: boolean) => {
    vi.mocked(carPlayList).mockResolvedValueOnce({
      sections: [{ items: [{ node: 'playlist|srv|p1', title: 'Mix', browse: true }] }],
      refreshCovers: async (onImages: (updates: CarPlayCoverUpdate[], downloaded: boolean) => void) => {
        onImages([{ section: 0, row: 70, image: '/c/p70.jpg' }], downloaded);
      },
    });
  };

  it('asks the car to reload the list once covers were downloaded', async () => {
    const carListsChanged = vi.fn();
    (window as unknown as { PsysonicAndroidMedia: unknown }).PsysonicAndroidMedia = { carListsChanged };
    listWithRefresh(true);
    await carListJson('playlists');
    await vi.waitFor(() => expect(carListsChanged).toHaveBeenCalledWith(JSON.stringify(['playlists'])));
  });

  it('does not reload the list for covers that were already on disk (the reload would loop)', async () => {
    const carListsChanged = vi.fn();
    (window as unknown as { PsysonicAndroidMedia: unknown }).PsysonicAndroidMedia = { carListsChanged };
    listWithRefresh(false);
    await carListJson('playlists');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(carListsChanged).not.toHaveBeenCalled();
  });
});

describe('Android Auto player buttons', () => {
  afterEach(() => {
    delete (window as unknown as { PsysonicAndroidMedia?: unknown }).PsysonicAndroidMedia;
  });

  it('reports the button state when it changes and hands presses on as CarPlay commands', () => {
    const setCarState = vi.fn();
    (window as unknown as { PsysonicAndroidMedia: unknown }).PsysonicAndroidMedia = { carListResult: vi.fn(), setCarState };
    const stop = installAndroidAuto();
    expect(JSON.parse(setCarState.mock.calls[0][0])).toEqual({ shuffle: false, repeat: 'off', starred: false, infinite: false });

    mocks.playerListeners.forEach(listener => listener());
    expect(setCarState).toHaveBeenCalledOnce();
    mocks.state = { ...mocks.state, infinite: true };
    mocks.playerListeners.forEach(listener => listener());
    expect(JSON.parse(setCarState.mock.calls[1][0]).infinite).toBe(true);

    window.__psyAutoCommand?.('infinite');
    expect(mocks.carPlayCommand).toHaveBeenCalledWith('infinite');
    stop();
    expect(window.__psyAutoCommand).toBeUndefined();
  });
});
