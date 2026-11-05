import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { resetAllStores } from '@/test/helpers/storeReset';
import type { ColDef } from '@/lib/hooks/useTracklistColumns';
import PlaylistTracklist from '@/features/playlist/components/PlaylistTracklist';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { songToTrack } from '@/lib/media/songToTrack';

vi.mock('@/lib/dnd/DragDropContext', () => ({
  useDragDrop: () => ({ isDragging: false, startDrag: vi.fn(), payload: null }),
}));

// jsdom has no layout, so the real virtualizer would render no rows at all.
const virtualOpts = vi.hoisted(() => ({ last: null as null | { scrollPaddingStart?: number } }));
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; getItemKey: (index: number) => string; scrollPaddingStart?: number }) => (virtualOpts.last = opts, {
    getVirtualItems: () => Array.from({ length: opts.count }, (_, index) => ({
      index, key: opts.getItemKey(index), start: index * 53, size: 53,
    })),
    getTotalSize: () => opts.count * 53,
    measureElement: () => {},
  }),
}));

const columns: ColDef[] = [
  { key: 'num', i18nKey: null, minWidth: 60, defaultWidth: 60, required: true },
  { key: 'title', i18nKey: 'trackTitle', minWidth: 80, defaultWidth: 180, required: true },
];
const songs = [makeSubsonicSong({ id: 's1', title: 'One' }), makeSubsonicSong({ id: 's2', title: 'Two' })];

function renderList() {
  return renderWithProviders(
    <PlaylistTracklist
      allColumns={columns} visibleCols={columns} gridStyle={{ gridTemplateColumns: '60px 180px' }}
      colWidths={{ num: 60, title: 180 }} contentWidth={240} setColumnWidth={vi.fn()} moveColumn={vi.fn()}
      colVisible={new Set(['num', 'title'])} toggleColumn={vi.fn()} resetColumns={vi.fn()}
      pickerOpen={false} setPickerOpen={vi.fn()} pickerRef={{ current: null }} startResize={vi.fn()}
      tracklistRef={{ current: null }} songs={songs} displayedSongs={songs} displayedTracks={songs.map(songToTrack)}
      isFiltered={false} hasActiveFilter={false} id="pl-1" serverId="srv-a"
      sortKey="natural" setSortKey={vi.fn()} sortDir="asc" setSortDir={vi.fn()} sortClickCount={0} setSortClickCount={vi.fn()}
      selectedIds={new Set()} setSelectedIds={vi.fn()} allSelected={false} toggleAll={vi.fn()} toggleSelect={vi.fn()}
      showBulkPlPicker={false} setShowBulkPlPicker={vi.fn()} bulkRemove={vi.fn()}
      contextMenuSongId={null} setContextMenuSongId={vi.fn()} dropTargetIdx={null}
      ratings={{}} starredSongs={new Set()} handleRate={vi.fn()} handleToggleStar={vi.fn()}
      handleRowMouseDown={vi.fn()} handleRowMouseEnter={vi.fn()} removeSong={vi.fn()} setSearchOpen={vi.fn()}
    />,
  );
}

describe('PlaylistTracklist in the touch shell', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
  });

  it('keeps the touch rows without the desktop table frame, header or sideways bar', () => {
    const { container } = renderList();
    expect(container.querySelectorAll('[data-playlist-touch-row]')).toHaveLength(2);
    expect(container.querySelector('.tl-viewport, .tl-header, .tl-hbar, .tracklist--model-a')).toBeNull();
  });

  it('leaves the sticky-header scroll padding to the desktop table', () => {
    renderList();
    expect(virtualOpts.last?.scrollPaddingStart).toBeUndefined();
  });
});
