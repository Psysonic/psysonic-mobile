import { useTranslation } from 'react-i18next';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import { VirtualCardGrid } from '@/ui/VirtualCardGrid';
import { albumGridWarmCovers, COVER_TRACK_ROW_CSS_PX } from '@/cover/layoutSizes';
import AlbumTouchRow from './AlbumTouchRow';

interface Props {
  albums: SubsonicAlbum[];
  itemKey: (album: SubsonicAlbum) => string;
  scrollRootId: string;
  disableVirtualization: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (album: SubsonicAlbum, opts?: { shiftKey?: boolean }) => void;
  selectedAlbums: SubsonicAlbum[];
  linkQuery?: string;
}

/**
 * The album pages' list layout in the touch shell (`AlbumTable` hands over to it):
 * one touch row per album, virtualised through the shared card grid like the table.
 * No column header; the pages sort from their own menu.
 */
export default function AlbumListTouch({
  albums, itemKey, scrollRootId, disableVirtualization,
  selectionMode, selectedIds, onToggleSelect, selectedAlbums, linkQuery,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="mobile-album-list" role="list" aria-label={t('albums.tableLabel')}>
      <VirtualCardGrid
        items={albums}
        itemKey={(a, _i) => itemKey(a)}
        rowVariant="albumTableRow"
        singleColumn
        presentationalWrappers
        gridGap="0"
        disableVirtualization={disableVirtualization}
        layoutSignal={albums.length}
        scrollRootId={scrollRootId}
        warmGridCovers={albumGridWarmCovers(COVER_TRACK_ROW_CSS_PX)}
        renderItem={a => (
          <AlbumTouchRow
            album={a}
            selectionMode={selectionMode}
            selected={selectedIds.has(itemKey(a))}
            onToggleSelect={opts => onToggleSelect(a, opts)}
            selectedAlbums={selectedAlbums}
            linkQuery={linkQuery}
            observeScrollRootId={scrollRootId}
          />
        )}
      />
    </div>
  );
}
