import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';

const ensure = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/coverCache', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api/coverCache')>()),
  coverCacheEnsure: ensure,
}));

import { keepCoversForDownload } from './offlineCoverKeep';

function song(id: string, albumId: string, coverArt = `al-${albumId}`): SubsonicSong {
  return { id, title: id, albumId, coverArt, artist: '', album: '', duration: 1 } as SubsonicSong;
}

describe('keepCoversForDownload', () => {
  beforeEach(() => { ensure.mockReset().mockResolvedValue({ hit: true, path: '' }); });

  it('stores the album cover once for all its tracks', async () => {
    await keepCoversForDownload([song('t1', 'a1'), song('t2', 'a1'), song('t3', 'a1')], 'srv');
    expect(ensure).toHaveBeenCalledTimes(1);
    const [ref, tier] = ensure.mock.calls[0]!;
    expect(ref).toMatchObject({ cacheKind: 'album', fetchCoverArtId: 'al-a1' });
    expect(ref.serverScope).toMatchObject({ kind: 'server', serverId: 'srv' });
    // 800 also writes 128, 256 and 512, the sizes of the player bar and the lists.
    expect(tier).toBe(800);
  });

  it('stores one cover per album for a playlist', async () => {
    await keepCoversForDownload([song('t1', 'a1'), song('t2', 'a2'), song('t3', 'a1')], 'srv');
    expect(ensure.mock.calls.map(c => c[0].fetchCoverArtId).sort()).toEqual(['al-a1', 'al-a2']);
  });

  it('keeps going when one cover fails', async () => {
    ensure.mockRejectedValueOnce(new Error('offline'));
    await expect(keepCoversForDownload([song('t1', 'a1'), song('t2', 'a2')], 'srv')).resolves.toBeUndefined();
    expect(ensure).toHaveBeenCalledTimes(2);
  });

  it('skips tracks without an album', async () => {
    await keepCoversForDownload([{ ...song('t1', ''), albumId: undefined } as unknown as SubsonicSong], 'srv');
    expect(ensure).not.toHaveBeenCalled();
  });
});
