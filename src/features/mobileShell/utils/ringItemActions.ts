import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router';
import { resolveAlbum, resolveMediaServerId } from '@/features/offline';
import { usePlayerStore, withQueueSource } from '@/features/playback';
import { resolvePlaylistTracks } from '@/features/playlist';
import type { QueueRingPick } from '@/features/queue';
import { star, unstar } from '@/lib/api/subsonicStarRating';
import type { SubsonicAlbum, SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import { showToast } from '@/lib/dom/toast';
import { songToTrack } from '@/lib/media/songToTrack';
import { buildArtistDetailPath } from '@/lib/navigation/detailServerScope';
import { ownedEntityKey, ownedOverrideValue } from '@/lib/util/ownedEntityKey';

async function albumTracks(album: SubsonicAlbum) {
  const serverId = resolveMediaServerId(album.serverId);
  if (!serverId) return [];
  const data = await resolveAlbum(serverId, album.id);
  return data ? data.songs.map(songToTrack) : [];
}

/** The ring's "remove" on a song in a playlist; the same step as the menu entry. */
export async function removeSongFromPlaylist(remove: () => void | Promise<void>, t: TFunction): Promise<void> {
  try {
    await remove();
    showToast(t('playlists.removeSuccess'), 3000, 'info');
  } catch {
    showToast(t('playlists.removeError'), 4000, 'error');
  }
}

/** What the ring on an album does; the same steps as the album's menu entries. */
export async function runAlbumRingAction(
  pick: QueueRingPick,
  album: SubsonicAlbum,
  navigate: NavigateFunction,
  t: TFunction,
): Promise<void> {
  const s = usePlayerStore.getState();
  switch (pick) {
    case 'next': {
      const tracks = await albumTracks(album);
      if (tracks.length === 0) return;
      s.playNext(tracks);
      showToast(t('queue.touchPlaysNext', { title: album.name }), 2200, 'info');
      return;
    }
    case 'queue': {
      const tracks = await albumTracks(album);
      if (tracks.length === 0) return;
      s.enqueue(tracks);
      showToast(t('search.addedToQueueToast', { title: album.name }), 2200, 'info');
      return;
    }
    case 'like': {
      const starred = ownedOverrideValue(s.starredOverrides, album) ?? !!album.starred;
      s.setStarredOverride(ownedEntityKey(album), !starred);
      const meta = {
        serverId: album.serverId,
        name: album.name,
        artist: album.artist,
        artistId: album.artistId,
        coverArtId: album.coverArt,
        year: album.year,
      };
      await (starred ? unstar(album.id, 'album', meta) : star(album.id, 'album', meta));
      return;
    }
    case 'artist':
      navigate(buildArtistDetailPath(album.artistId, { serverId: album.serverId }));
      return;
  }
}

/** What the ring on a playlist does; the same steps as the playlist's menu entries. */
export async function runPlaylistRingAction(
  pick: QueueRingPick,
  playlist: SubsonicPlaylist,
  t: TFunction,
): Promise<void> {
  const s = usePlayerStore.getState();
  const tracks = await resolvePlaylistTracks(playlist.id, playlist.serverId);
  if (tracks.length === 0) return;
  switch (pick) {
    case 'play':
      withQueueSource(
        { kind: 'playlist', id: playlist.id, serverId: playlist.serverId },
        () => s.playTrack(tracks[0], tracks),
      );
      return;
    case 'next':
      s.playNext(tracks);
      showToast(t('queue.touchPlaysNext', { title: playlist.name }), 2200, 'info');
      return;
    case 'queue':
      s.enqueue(tracks);
      showToast(t('search.addedToQueueToast', { title: playlist.name }), 2200, 'info');
      return;
  }
}
