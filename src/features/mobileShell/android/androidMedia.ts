/**
 * ⚠️ Android territory. The buttons of the Android media bridge
 * (`src-tauri/android/PsysonicMedia.kt`) come back as the same `media:*` events the desktop
 * and iOS controls send, so every rule those follow (Orbit guests, previews) applies
 * unchanged. What plays goes out through `lib/api/androidMediaHost.ts`.
 */
import { emit } from '@tauri-apps/api/event';
import { RADIO_STARTING_EVENT, usePlayerStore } from '@/features/playback';
import { androidMediaHost as host } from '@/lib/api/androidMediaHost';

declare global {
  interface Window {
    __psyAndroidMediaCommand?: (name: string, seconds: number) => void;
  }
}

/** How long a station start may take before the radio flag lets go (a stream that never came). */
const RADIO_START_LIMIT_MS = 15000;

const COMMAND_EVENTS: Record<string, string> = {
  play: 'media:play',
  pause: 'media:pause',
  next: 'media:next',
  prev: 'media:prev',
};

/** Native buttons → the shared `media:*` events. Returns the cleanup. */
export function installAndroidMediaCommands(): () => void {
  window.__psyAndroidMediaCommand = (name, seconds) => {
    if (name === 'seek') {
      void emit('media:seek-absolute', seconds);
      return;
    }
    const event = COMMAND_EVENTS[name];
    if (event) void emit(event);
  };
  // Radio plays through the web view's own audio element, which asks for audio focus
  // itself: the native side must not answer that loss of focus with a pause.
  let radio = usePlayerStore.getState().currentRadio !== null;
  // A station is starting: its focus request comes before `currentRadio` is set.
  let starting = false;
  let startingTimer: ReturnType<typeof setTimeout> | undefined;
  const endStarting = () => {
    starting = false;
    clearTimeout(startingTimer);
  };
  const report = (next: boolean) => {
    if (next === radio) return;
    radio = next;
    host()?.setRadio?.(radio);
  };
  host()?.setRadio?.(radio);
  const offRadio = usePlayerStore.subscribe((state, prev) => {
    if (state.currentRadio !== prev.currentRadio) endStarting();
    // A song plays instead of the station that was starting (picked before the stream came,
    // or the start failed): without this the song played without audio focus.
    const songStarted = state.currentRadio === null && state.currentTrack !== null && state.isPlaying
      && (state.currentTrack !== prev.currentTrack || !prev.isPlaying);
    if (starting && songStarted) {
      endStarting();
      report(false);
      return;
    }
    // Only a station change or a stop: other updates arrive while a station is starting.
    if (state.currentRadio === prev.currentRadio && (state.isPlaying || !prev.isPlaying)) return;
    endStarting();
    report(state.currentRadio !== null);
  });
  const onRadioStarting = () => {
    endStarting();
    starting = true;
    // A start that never reaches the store (stream unreachable) lets go after a while.
    startingTimer = setTimeout(() => {
      starting = false;
      report(usePlayerStore.getState().currentRadio !== null);
    }, RADIO_START_LIMIT_MS);
    report(true);
  };
  window.addEventListener(RADIO_STARTING_EVENT, onRadioStarting);
  return () => {
    offRadio();
    endStarting();
    window.removeEventListener(RADIO_STARTING_EVENT, onRadioStarting);
    delete window.__psyAndroidMediaCommand;
  };
}
