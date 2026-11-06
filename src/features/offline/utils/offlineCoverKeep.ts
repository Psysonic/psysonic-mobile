import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { coverCacheEnsure } from '@/lib/api/coverCache';
// Not `@/cover/ref`: it pulls in the player store, which imports this feature back.
import { coverEntryToRef, resolveTrackCoverEntry } from '@/cover/resolveEntry';
import { coverServerScopeForOwnerServerId } from '@/cover/serverScope';
import type { CoverArtRef } from '@/cover/types';

/** The largest derived size; Rust writes 128, 256 and 512 alongside it. */
const KEPT_COVER_TIER = 800;

function refKey(ref: CoverArtRef): string {
  return `${ref.cacheKind}:${ref.cacheEntityId}`;
}

/**
 * Stores the covers of a download's albums on disk, so the album page and the
 * player bar have them offline. Downloads used to keep only the tracks: a cover
 * was on disk only if the album had been looked at before, which an album from
 * a library download usually had not. One cover per album; a cover that fails is
 * left to the next look.
 */
export async function keepCoversForDownload(songs: SubsonicSong[], serverId: string): Promise<void> {
  const scope = coverServerScopeForOwnerServerId(serverId);
  const refs = new Map<string, CoverArtRef>();
  for (const song of songs) {
    // The album cover; separate disc art is only known once the album page has been opened.
    const entry = resolveTrackCoverEntry(song);
    if (!entry) continue;
    const ref = coverEntryToRef(entry, scope);
    refs.set(refKey(ref), ref);
  }
  for (const ref of refs.values()) {
    try {
      await coverCacheEnsure(ref, KEPT_COVER_TIER);
    } catch {
      // Offline or a server without art: the cover loads the next time it is shown.
    }
  }
}
