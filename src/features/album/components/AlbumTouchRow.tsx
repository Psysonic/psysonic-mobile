import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import { usePlayerStore } from '@/features/playback';
import { MobileTrackCheck } from '@/features/mobileShell';
import { useNavigateToAlbum } from '@/features/album/hooks/useNavigateToAlbum';
import { albumArtistDisplayName } from '@/features/album/utils/deriveAlbumHeaderArtistRefs';
import { formatAlbumYear } from '@/features/album/utils/albumYear';
import { useAlbumYearDisplay } from '@/features/album/store/albumYearDisplayStore';
import { CoverArtImage } from '@/cover/CoverArtImage';
import { useAlbumCoverRef } from '@/cover/useLibraryCoverRef';
import { coverServerScopeForServerId } from '@/cover/serverScope';
import { COVER_TRACK_ROW_CSS_PX } from '@/cover/layoutSizes';
import { appendServerQuery } from '@/lib/navigation/detailServerScope';
import { prepareTransientUiOpen } from '@/lib/dom/transientUi';

interface Props {
  album: SubsonicAlbum;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (opts?: { shiftKey?: boolean }) => void;
  selectedAlbums: SubsonicAlbum[];
  /** Appended to `/album/:id`, e.g. `lossless=1`. */
  linkQuery?: string;
  observeScrollRootId: string;
}

/**
 * An album in the touch shell's list layout, read like the touch song rows: cover,
 * title over "artist · year", "…" for the album menu. A tap opens the album (picks it
 * while the page is selecting); a long press opens the menu, as on the album tiles.
 */
function AlbumTouchRow({
  album, selectionMode, selected, onToggleSelect, selectedAlbums, linkQuery, observeScrollRootId,
}: Props) {
  const { t } = useTranslation();
  const navigateToAlbum = useNavigateToAlbum();
  const openContextMenu = usePlayerStore(s => s.openContextMenu);
  const albumYearDisplay = useAlbumYearDisplay();

  const coverServerScope = useMemo(() => coverServerScopeForServerId(album.serverId), [album.serverId]);
  // As the album tiles on these pages: the browse payload already carries a usable
  // `coverArt`, so no per-row library lookup.
  const coverRef = useAlbumCoverRef(album.id, album.coverArt, coverServerScope, { libraryResolve: false });
  const artistLabel = useMemo(() => albumArtistDisplayName(album), [album]);
  const year = formatAlbumYear(album, albumYearDisplay);
  const subline = [artistLabel, year].filter(Boolean).join(' · ');

  const openMenu = (x: number, y: number) => {
    prepareTransientUiOpen();
    if (selectionMode && selectedAlbums.length > 0) openContextMenu(x, y, selectedAlbums, 'multi-album');
    else openContextMenu(x, y, album, 'album');
  };

  return (
    <div
      className={`mobile-track${selected ? ' is-selected' : ''}`}
      data-virtual-track-row=""
      role="listitem"
      onContextMenu={e => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY);
      }}
    >
      <button
        type="button"
        className="mobile-track__main"
        aria-pressed={selectionMode ? selected : undefined}
        onClick={() => {
          if (selectionMode) { onToggleSelect(); return; }
          navigateToAlbum(album.id, { search: appendServerQuery(linkQuery, album.serverId) });
        }}
      >
        {selectionMode && <MobileTrackCheck selected={selected} />}
        <span className="mobile-track__cover">
          {coverRef && (
            <CoverArtImage
              coverRef={coverRef}
              displayCssPx={COVER_TRACK_ROW_CSS_PX}
              surface="dense"
              ensureOpts={{ artistName: artistLabel, albumTitle: album.name }}
              alt=""
              loading="lazy"
              decoding="async"
              observeScrollRootId={observeScrollRootId}
            />
          )}
        </span>
        <span className="mobile-track__text">
          <span className="mobile-track__title">{album.name}</span>
          {subline && <span className="mobile-track__artist">{subline}</span>}
        </span>
      </button>
      <button
        type="button"
        className="mobile-track__more"
        aria-label={`${t('player.moreOptions')}: ${album.name}`}
        aria-haspopup="menu"
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect();
          openMenu(r.right, r.bottom);
        }}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

export default memo(AlbumTouchRow);
