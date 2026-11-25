import { beforeEach, describe, expect, it, vi } from 'vitest';

const covers = vi.hoisted(() => ({
  peek: vi.fn(),
  ensure: vi.fn(async () => {}),
}));

vi.mock('@/lib/api/coverCache', () => ({
  coverCachePeekBatch: covers.peek,
  coverCacheEnsureBatch: covers.ensure,
}));
vi.mock('@/cover', () => ({
  albumCoverRef: (_albumId: string, coverArt: string) => ({ fetchCoverArtId: `pl-${coverArt}` }),
  coverServerScopeForServerId: () => ({ kind: 'active' }),
  coverStorageKeyFromRef: (ref: { fetchCoverArtId: string }, tier: number) => `${ref.fetchCoverArtId}:${tier}`,
  resolveAlbumCoverRefsFromLibrary: async (albums: Array<{ id: string }>) =>
    albums.map(album => ({ fetchCoverArtId: `al-${album.id}` })),
  resolveArtistCoverRefsFromLibrary: async (artists: Array<{ id: string }>) =>
    artists.map(artist => ({ fetchCoverArtId: `ar-${artist.id}` })),
}));

import { attachCarPlayCovers, _resetCarPlayCoversForTest } from './carplayCovers';

const row = (id: string, kind: 'album' | 'artist' = 'album') => ({
  cover: { kind, id, serverId: 'srv' },
}) as { cover: { kind: 'album' | 'artist'; id: string; serverId: string }; image?: string };

describe('attachCarPlayCovers', () => {
  beforeEach(() => {
    covers.peek.mockReset();
    covers.ensure.mockClear();
    _resetCarPlayCoversForTest();
  });

  it('puts covers already on disk straight onto the rows, without the version suffix', async () => {
    covers.peek.mockResolvedValue({ 'al-a:256': '/covers/a/256.webp|17', 'ar-b:256': '/covers/b/256.webp' });
    const sections = [{ items: [row('a'), row('b', 'artist')] }];
    const refresh = await attachCarPlayCovers(sections);
    expect(sections[0].items.map(item => item.image)).toEqual(['/covers/a/256.webp', '/covers/b/256.webp']);
    expect(refresh).toBeNull();
    expect(covers.ensure).not.toHaveBeenCalled();
  });

  it('gives a playlist row the playlist cover by its cover id, without a library lookup', async () => {
    covers.peek.mockResolvedValue({ 'pl-p1:256': '/covers/p1/256.webp' });
    const sections = [{
      items: [
        { cover: { kind: 'playlist' as const, id: 'p', coverArt: 'p1', serverId: 'srv' } } as { cover: { kind: 'playlist'; id: string; coverArt: string; serverId: string }; image?: string },
        { cover: { kind: 'playlist' as const, id: 'q', serverId: 'srv' } } as { cover: { kind: 'playlist'; id: string; serverId: string }; image?: string },
      ],
    }];
    const refresh = await attachCarPlayCovers(sections);
    expect(sections[0].items.map(item => item.image)).toEqual(['/covers/p1/256.webp', undefined]);
    expect(refresh).toBeNull();
  });

  it('downloads the missing covers afterwards and reports where they belong', async () => {
    covers.peek
      .mockResolvedValueOnce({ 'al-a:256': '/covers/a/256.webp' })
      .mockResolvedValueOnce({ 'al-c:256': '/covers/c/256.webp' });
    const sections = [{ items: [row('a')] }, { items: [{}, row('c')] }];
    const refresh = await attachCarPlayCovers(sections);
    expect(refresh).not.toBeNull();
    const updates: unknown[] = [];
    await refresh!(chunk => updates.push(...chunk));
    expect(covers.ensure).toHaveBeenCalledWith([{ fetchCoverArtId: 'al-c' }], 256);
    expect(updates).toEqual([{ section: 1, row: 1, image: '/covers/c/256.webp' }]);
  });

  it('covers rows far down a long list, in chunks from the top', async () => {
    covers.peek.mockImplementation(async (refs: Array<{ fetchCoverArtId: string }>) =>
      // Nothing on disk until the first download.
      Object.fromEntries(covers.ensure.mock.calls.length === 0 ? [] : refs
        .map(ref => [`${ref.fetchCoverArtId}:256`, `/covers/${ref.fetchCoverArtId}/256.webp`])));
    const sections = [{ items: Array.from({ length: 100 }, (_, i) => row(String(i))) }];
    const refresh = await attachCarPlayCovers(sections);
    const chunks: number[][] = [];
    await refresh!(chunk => chunks.push(chunk.map(update => update.row)));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0][0]).toBe(0);
    expect(chunks.flat()).toContain(99);
  });

  it('tells covers it downloaded apart from covers that were already on disk', async () => {
    // Every cover is on disk; rows past the first 60 are only looked up in the follow-up.
    covers.peek.mockImplementation(async (refs: Array<{ fetchCoverArtId: string }>) =>
      Object.fromEntries(refs.map(ref => [`${ref.fetchCoverArtId}:256`, `/covers/${ref.fetchCoverArtId}/256.webp`])));
    const sections = [{ items: Array.from({ length: 100 }, (_, i) => row(String(i))) }];
    const refresh = await attachCarPlayCovers(sections);
    const reports: boolean[] = [];
    await refresh!((_chunk, downloaded) => reports.push(downloaded));
    expect(covers.ensure).not.toHaveBeenCalled();
    expect(reports).toEqual([false]);
  });

  it('marks a chunk it had to download as downloaded', async () => {
    covers.peek
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ 'al-a:256': '/covers/a/256.webp' });
    const refresh = await attachCarPlayCovers([{ items: [row('a')] }]);
    const reports: boolean[] = [];
    await refresh!((_chunk, downloaded) => reports.push(downloaded));
    expect(reports).toEqual([true]);
  });
  it('carries covers from a follow-up on the rows of the next answer, and reports them only once', async () => {
    // Android Auto reloads a list for every follow-up report: without this it never saw covers
    // past row 60, or reloaded the list forever.
    covers.peek.mockImplementation(async (refs: Array<{ fetchCoverArtId: string }>) =>
      Object.fromEntries(refs.map(ref => [`${ref.fetchCoverArtId}:256`, `/covers/${ref.fetchCoverArtId}/256.webp`])));
    const build = () => [{ items: Array.from({ length: 100 }, (_, i) => row(String(i))) }];
    const firstAnswer = build();
    const refresh = await attachCarPlayCovers(firstAnswer);
    expect(firstAnswer[0].items[70].image).toBeUndefined();
    await refresh!(() => {});

    const secondAnswer = build();
    const again = await attachCarPlayCovers(secondAnswer);
    expect(secondAnswer[0].items.every(item => item.image)).toBe(true);
    expect(secondAnswer[0].items[70].image).toBe('/covers/al-70/256.webp');
    expect(again).toBeNull();
  });

  it('remembers downloaded covers too', async () => {
    covers.peek
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ 'al-a:256': '/covers/a/256.webp' });
    const refresh = await attachCarPlayCovers([{ items: [row('a')] }]);
    await refresh!(() => {});
    covers.peek.mockResolvedValue({});
    const next = [{ items: [row('a')] }];
    expect(await attachCarPlayCovers(next)).toBeNull();
    expect(next[0].items[0].image).toBe('/covers/a/256.webp');
  });
});
