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
  host()?.setRadio?.(radio);
  const offRadio = usePlayerStore.subscribe((state, prev) => {
    // Only a station change or a stop: other updates arrive while a station is starting.
    if (state.currentRadio === prev.currentRadio && (state.isPlaying || !prev.isPlaying)) return;
    const next = state.currentRadio !== null;
    if (next === radio) return;
    radio = next;
    host()?.setRadio?.(radio);
  });
  // A station is starting: its focus request comes before `currentRadio` is set.
  const onRadioStarting = () => {
    radio = true;
    host()?.setRadio?.(true);
  };
  window.addEventListener(RADIO_STARTING_EVENT, onRadioStarting);
  return () => {
    offRadio();
    window.removeEventListener(RADIO_STARTING_EVENT, onRadioStarting);
    delete window.__psyAndroidMediaCommand;
  };
}
