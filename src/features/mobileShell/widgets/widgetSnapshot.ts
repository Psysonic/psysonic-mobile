import i18n from '@/lib/i18n';
import { usePlayerStore, resolveQueueTrack } from '@/features/playback';
import {
  carPlayMixItem,
  carPlayPlay,
  carPlayPlayList,
  carPlayRecentlyPlayedRows,
} from '@/features/mobileShell/car/carplayContent';
import { attachCarPlayCovers, type CarPlayCoverSource } from '@/features/mobileShell/car/carplayCovers';

/**
 * What the home and lock screen widgets show, built here for both phones: the native side
 * only copies the covers and draws (iOS `src-tauri/src/ios/widgets.rs`). `image` is a path in
 * the cover cache.
 */
export interface WidgetSnapshot {
  /** The theme's accent, `#rrggbb`. */
  accent?: string;
  now: WidgetNow | null;
  recent: WidgetAlbum[];
  next: WidgetSong[];
  mix: { title: string; hint?: string };
  labels: { nowPlaying: string; nothingPlaying: string; recentlyPlayed: string; upNext: string };
}

export interface WidgetNow {
  title: string;
  artist?: string;
  album?: string;
  playing: boolean;
  /** Seconds since 1970 at which the song would have started, playing without pauses. */
  startedAt?: number;
  elapsed: number;
  duration: number;
  image?: string;
  radio?: boolean;
}

export interface WidgetAlbum {
  /** The car lists' album node; `album:<node>` plays it. */
  node: string;
  title: string;
  artist?: string;
  image?: string;
}

export interface WidgetSong {
  title: string;
  artist?: string;
  image?: string;
}

interface WithCover {
  cover?: CarPlayCoverSource;
  image?: string;
}

/** Albums the medium widget shows. */
const RECENT_SIZE = 4;
/** Songs the large widget lists under up next. */
const NEXT_SIZE = 3;

const t = (key: string) => i18n.t(key);

/** `#rgb`, `#rrggbb` or `rgb(r, g, b)` as `#rrggbb`; anything else is dropped. */
export function cssColorToHex(raw: string): string | undefined {
  const value = raw.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(value);
  if (!rgb) return undefined;
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some(channel => channel > 255)) return undefined;
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function themeAccent(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return cssColorToHex(getComputedStyle(document.documentElement).getPropertyValue('--accent'));
}

/** Sets `image` on each item whose cover is on disk, downloading the missing ones first. */
async function attachImages(items: WithCover[]): Promise<void> {
  if (!items.some(item => item.cover)) return;
  const refresh = await attachCarPlayCovers([{ items }]).catch(() => null);
  if (!refresh) return;
  await refresh(updates => {
    for (const update of updates) items[update.row].image = update.image;
  }).catch(() => {});
}

function stripCover<T extends WithCover>({ cover: _cover, ...rest }: T): Omit<T, 'cover'> {
  return rest;
}

async function nowPlaying(): Promise<WidgetNow | null> {
  const { currentTrack, currentRadio, isPlaying, currentTime } = usePlayerStore.getState();
  if (currentRadio) {
    const station: WidgetNow & WithCover = {
      title: currentRadio.name,
      playing: isPlaying,
      elapsed: 0,
      duration: 0,
      radio: true,
      cover: currentRadio.coverArt && currentRadio.serverId
        ? { kind: 'playlist', id: currentRadio.id, coverArt: currentRadio.coverArt, serverId: currentRadio.serverId }
        : undefined,
    };
    await attachImages([station]);
    return stripCover(station);
  }
  if (!currentTrack) return null;
  const elapsed = Math.max(0, currentTime || 0);
  const song: WidgetNow & WithCover = {
    title: currentTrack.title,
    artist: currentTrack.artist || undefined,
    album: currentTrack.album || undefined,
    playing: isPlaying,
    startedAt: isPlaying ? Date.now() / 1000 - elapsed : undefined,
    elapsed,
    duration: currentTrack.duration || 0,
    cover: currentTrack.albumId && currentTrack.serverId
      ? { kind: 'album', id: currentTrack.albumId, coverArt: currentTrack.coverArt, serverId: currentTrack.serverId }
      : undefined,
  };
  await attachImages([song]);
  return stripCover(song);
}

async function upNext(): Promise<WidgetSong[]> {
  const { queueItems, queueIndex } = usePlayerStore.getState();
  const songs: Array<WidgetSong & WithCover> = queueItems
    .slice(queueIndex + 1, queueIndex + 1 + NEXT_SIZE)
    .map(ref => resolveQueueTrack(ref))
    .map(track => ({
      title: track.title,
      artist: track.artist || undefined,
      cover: track.albumId && track.serverId
        ? { kind: 'album' as const, id: track.albumId, coverArt: track.coverArt, serverId: track.serverId }
        : undefined,
    }));
  await attachImages(songs);
  return songs.map(stripCover);
}

/** Recently played albums with their covers. */
export async function loadWidgetRecentAlbums(): Promise<WidgetAlbum[]> {
  const rows = await carPlayRecentlyPlayedRows(RECENT_SIZE).catch(() => []);
  const albums: Array<WidgetAlbum & WithCover> = rows.slice(0, RECENT_SIZE).map(row => ({
    node: row.node,
    title: row.title,
    artist: row.subtitle,
    cover: row.cover,
  }));
  await attachImages(albums);
  return albums.map(stripCover);
}

/** The full snapshot; `recent` comes from the caller, it changes far less often. */
export async function buildWidgetSnapshot(recent: WidgetAlbum[]): Promise<WidgetSnapshot> {
  const [now, next] = await Promise.all([nowPlaying(), upNext()]);
  const mix = carPlayMixItem();
  return {
    accent: themeAccent(),
    now,
    recent,
    next,
    mix: { title: mix.title, hint: mix.subtitle },
    labels: {
      nowPlaying: t('queue.touchNowPlaying'),
      nothingPlaying: t('tray.nothingPlaying'),
      recentlyPlayed: t('home.recentlyPlayed'),
      upNext: t('queue.upNext'),
    },
  };
}

/** A widget button or control was tapped: `toggle`, `next`, `previous`, `mix`, `album:<node>`. */
export async function runWidgetCommand(action: string): Promise<void> {
  const player = usePlayerStore.getState();
  switch (action) {
    case 'toggle': player.togglePlay(); return;
    case 'next': player.next(true); return;
    case 'previous': player.previous(); return;
    case 'mix': await carPlayPlay(carPlayMixItem().node); return;
    default:
      if (action.startsWith('album:')) await carPlayPlayList(action.slice('album:'.length));
  }
}
