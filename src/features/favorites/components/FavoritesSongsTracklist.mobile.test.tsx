import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { resetAllStores } from '@/test/helpers/storeReset';
import type { ColDef } from '@/lib/hooks/useTracklistColumns';
import FavoritesSongsTracklist from '@/features/favorites/components/FavoritesSongsTracklist';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeSubsonicSong } from '@/test/helpers/factories';

vi.mock('@/lib/dnd/DragDropContext', () => ({
  useDragDrop: () => ({ isDragging: false, startDrag: vi.fn(), payload: null }),
}));

// jsdom has no layout, so the real virtualizer would render no rows at all.
const virtualOpts = vi.hoisted(() => ({ last: null as null | { scrollPaddingStart?: number } }));
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; getItemKey?: (index: number) => string; scrollPaddingStart?: number }) => (virtualOpts.last = opts, {
    getVirtualItems: () => Array.from({ length: opts.count }, (_, index) => ({
      index, key: opts.getItemKey ? opts.getItemKey(index) : String(index), start: index * 60, size: 60,
    })),
    getTotalSize: () => opts.count * 60,
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}));

const columns: ColDef[] = [
  { key: 'num', i18nKey: 'trackRowNumber', minWidth: 60, defaultWidth: 60, required: false, align: 'end' },
  { key: 'title', i18nKey: 'trackTitle', minWidth: 240, defaultWidth: 340, required: true },
];
const songs = [makeSubsonicSong({ id: 'fav-1', title: 'First' }), makeSubsonicSong({ id: 'fav-2', title: 'Second' })];

function renderList() {
  return renderWithProviders(
    <FavoritesSongsTracklist
      visibleSongs={songs} selectedIds={new Set()} selectedCount={0} inSelectMode={false} toggleSelect={vi.fn()}
      allColumns={columns} visibleCols={columns} gridStyle={{ gridTemplateColumns: '60px 340px' }}
      colWidths={{ num: 60, title: 340 }} contentWidth={400} setColumnWidth={vi.fn()} moveColumn={vi.fn()}
      colVisible={new Set(['num', 'title'])} toggleColumn={vi.fn()} resetColumns={vi.fn()}
      pickerOpen={false} setPickerOpen={vi.fn()} pickerRef={{ current: null }} tracklistRef={{ current: null }}
      startResize={vi.fn()} handleSortClick={vi.fn()} sort={null} ratings={{}} handleRate={vi.fn()}
      removeSong={vi.fn()} hasFilters={false}
    />,
  );
}

describe('FavoritesSongsTracklist in the touch shell', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
  });

  it('keeps the touch song rows without the desktop table frame, header or sideways bar', () => {
    const { container } = renderList();
    expect(container.querySelectorAll('.mobile-favorite-tracks [data-virtual-track-row]')).toHaveLength(2);
    expect(container.querySelector('.tl-viewport, .tl-header, .tl-hbar, .tracklist')).toBeNull();
  });

  it('leaves the sticky-header scroll padding to the desktop table', () => {
    renderList();
    expect(virtualOpts.last?.scrollPaddingStart).toBeUndefined();
  });
});
