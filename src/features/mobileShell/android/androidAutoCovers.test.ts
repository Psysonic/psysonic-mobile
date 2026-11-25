import { describe, expect, it, vi } from 'vitest';

const refreshCovers = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/lib/util/platform', async importOriginal => ({ ...(await importOriginal<object>()), IS_ANDROID: true }));
vi.mock('@/features/mobileShell/car/carplayContent', () => ({
  carPlayPlay: vi.fn(),
  watchCarSongTabs: () => () => {},
  carPlayCommand: vi.fn(),
  carPlayState: vi.fn(),
  carPlayList: vi.fn(async () => ({
    sections: [{ items: [{ node: 'playlist|srv|p1', title: 'Mix', browse: true }] }],
    refreshCovers,
  })),
}));

import { carListJson } from './androidAuto';

describe('carListJson covers', () => {
  it('fetches missing covers for the car', async () => {
    refreshCovers.mockClear();
    await carListJson('playlists');
    expect(refreshCovers).toHaveBeenCalledOnce();
  });

  it('downloads no covers for the copy of the car lists (built on the way to the background)', async () => {
    refreshCovers.mockClear();
    const json = JSON.parse(await carListJson('playlists', { fetchCovers: false }));
    expect(json.sections[0].items[0].node).toBe('playlist|srv|p1');
    expect(refreshCovers).not.toHaveBeenCalled();
  });
});
