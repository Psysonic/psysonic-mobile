/**
 * ⚠️ Android territory. The web view's calls into the native media bridge
 * (`src-tauri/android/PsysonicMedia.kt`): what plays goes to the MediaSession (lock screen,
 * media notification, headset buttons, foreground service). Lives in `lib` because the
 * MPRIS facade (`mpris.ts`) feeds it; the buttons coming back are wired up in
 * `features/mobileShell/android/androidMedia.ts`.
 */
import { IS_ANDROID } from '@/lib/util/platform';

/** Injected by `PsysonicMedia.attach` (Android only). */
interface AndroidMediaHost {
  setMetadata(json: string): void;
  setPlayback(playing: boolean, positionSecs: number): void;
  /** Older app builds lack it. */
  setRadio?(radio: boolean): void;
  /** Keeps the web view and the process running while a whole library downloads. */
  setBackgroundWork?(active: boolean, title: string, text: string): void;
  /** Settings → System → "Keep the screen on". Older app builds lack it. */
  setKeepScreenOn?(keepOn: boolean): void;
  /** Android Auto is connected right now. Older app builds lack it. */
  isCarConnected?(): boolean;
}

declare global {
  interface Window {
    PsysonicAndroidMedia?: AndroidMediaHost;
  }
}

export function androidMediaHost(): AndroidMediaHost | undefined {
  return IS_ANDROID ? window.PsysonicAndroidMedia : undefined;
}

/** Only a cover file from the app's own cache: a remote cover URL carries the server login. */
export function coverPathFromUrl(coverUrl: string | null | undefined): string | null {
  if (!coverUrl?.startsWith('file://')) return null;
  try {
    return decodeURI(coverUrl.slice('file://'.length));
  } catch {
    return null;
  }
}

export function androidMediaSetMetadata(args: {
  title: string | null;
  artist: string | null;
  album: string | null;
  coverUrl?: string | null;
  durationSecs: number | null;
}): void {
  androidMediaHost()?.setMetadata(JSON.stringify({
    title: args.title ?? '',
    artist: args.artist ?? '',
    album: args.album ?? '',
    coverPath: coverPathFromUrl(args.coverUrl) ?? '',
    durationSecs: args.durationSecs ?? 0,
  }));
}

export function androidMediaSetPlayback(args: { playing: boolean; positionSecs: number | null }): void {
  androidMediaHost()?.setPlayback(args.playing, args.positionSecs ?? 0);
}

export function androidSetBackgroundWork(active: boolean, title: string, text: string): void {
  androidMediaHost()?.setBackgroundWork?.(active, title, text);
}

export function androidIsCarConnected(): boolean {
  return androidMediaHost()?.isCarConnected?.() === true;
}

/** The screen stays on while the app is in front. */
export function androidSetKeepScreenOn(keepOn: boolean): void {
  androidMediaHost()?.setKeepScreenOn?.(keepOn);
}
