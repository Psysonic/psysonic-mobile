import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';

const navigateToAlbum = vi.hoisted(() => vi.fn());
const openContextMenu = vi.hoisted(() => vi.fn());

vi.mock('@/cover/useLibraryCoverRef', () => ({
  useAlbumCoverRef: () => null,
}));
vi.mock('@/generated/bindings', () => ({
  commands: {
    libraryResolveArtistIds: vi.fn().mockResolvedValue({ status: 'ok', data: [] }),
    coverCachePeekBatch: vi.fn().mockResolvedValue({ status: 'ok', data: [] }),
  },
}));
vi.mock('@/features/album/hooks/useNavigateToAlbum', () => ({
  useNavigateToAlbum: () => navigateToAlbum,
}));
vi.mock('@/features/playback', () => ({
  usePlayerStore: (selector: (s: { openContextMenu: unknown }) => unknown) =>
    selector({ openContextMenu }),
}));

import AlbumTable from './AlbumTable';

function album(overrides: Partial<SubsonicAlbum> & Pick<SubsonicAlbum, 'id' | 'name'>): SubsonicAlbum {
  return { artist: 'Some Artist', artistId: 'ar-1', songCount: 0, duration: 0, ...overrides };
}

const ALBUMS: SubsonicAlbum[] = [
  album({ id: 'al-1', name: 'First Record', artist: 'Alpha', songCount: 12, duration: 3671, year: 1994 }),
  album({ id: 'al-2', name: 'Second Record', artist: 'Beta', songCount: 4, duration: 240 }),
];

function renderList(props: Partial<React.ComponentProps<typeof AlbumTable>> = {}) {
  return renderWithProviders(
    <AlbumTable
      albums={ALBUMS}
      itemKey={a => a.id}
      scrollRootId="test-viewport"
      disableVirtualization
      selectionMode={false}
      selectedIds={new Set()}
      onToggleSelect={() => {}}
      selectedAlbums={[]}
      {...props}
    />,
  );
}

describe('AlbumTable in the touch shell', () => {
  beforeEach(() => {
    navigateToAlbum.mockReset();
    openContextMenu.mockReset();
  });

  it('lists touch rows instead of the table: title over "artist · year", no column header', () => {
    renderList();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('columnheader')).toBeNull();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('First Record');
    expect(rows[0]).toHaveTextContent('Alpha · 1994');
    // No year on the server: the artist stands alone, without a dangling separator.
    expect(rows[1]).toHaveTextContent('Beta');
    expect(rows[1]).not.toHaveTextContent('·');
    expect(document.querySelector('.tl-viewport, .album-table__header')).toBeNull();
  });

  it('opens the album on a tap, keeping the page query', () => {
    renderList({ linkQuery: 'lossless=1' });
    fireEvent.click(screen.getByRole('button', { name: /^First Record/ }));
    expect(navigateToAlbum).toHaveBeenCalledWith('al-1', { search: 'lossless=1' });
  });

  it('opens the album menu from "…" and on a long press', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /More options: First Record/ }));
    expect(openContextMenu).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), ALBUMS[0], 'album');
    fireEvent.contextMenu(within(screen.getByRole('list')).getAllByRole('listitem')[1]);
    expect(openContextMenu).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), ALBUMS[1], 'album');
  });

  it('picks rows in selection mode and offers the menu for the whole selection', () => {
    const onToggleSelect = vi.fn();
    renderList({ selectionMode: true, selectedIds: new Set(['al-2']), selectedAlbums: [ALBUMS[1]], onToggleSelect });
    const first = screen.getByRole('button', { name: /^First Record/ });
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Second Record/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(first);
    expect(onToggleSelect).toHaveBeenCalledWith(ALBUMS[0], undefined);
    expect(navigateToAlbum).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /More options: First Record/ }));
    expect(openContextMenu).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), [ALBUMS[1]], 'multi-album');
  });
});
