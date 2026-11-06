import type { SubsonicSong } from '@/lib/api/subsonicTypes';

type DownloadCoverKeeper = (songs: SubsonicSong[], serverId: string) => Promise<void>;

let keeper: DownloadCoverKeeper | null = null;

/**
 * Seam for storing a download's covers. The offline store cannot import the
 * cover code itself: it reaches the player store, which imports the offline
 * store back. `src/app/downloadCoverKeepBridge` registers the real keeper at boot.
 */
export function registerDownloadCoverKeeper(fn: DownloadCoverKeeper): void {
  keeper = fn;
}

export function isDownloadCoverKeeperRegistered(): boolean {
  return keeper !== null;
}

/** Starts storing the covers beside the tracks; never throws, never waits. */
export function keepDownloadCovers(songs: SubsonicSong[], serverId: string): void {
  if (!keeper) return;
  void keeper(songs, serverId).catch(() => {});
}
