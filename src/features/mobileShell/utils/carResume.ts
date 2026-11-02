import { listen } from '@tauri-apps/api/event';
import { usePlayerStore } from '@/features/playback';
import { useEqStore } from '@/store/eqStore';
import { useMobilePlaybackStore } from '@/features/mobileShell/store/mobilePlaybackStore';

/** A pause this close before the car went away was caused by it (the lost route pauses first). */
const PAUSED_BY_CAR_MS = 5000;
/** Longest wait for the native side to settle the output on the car before playing. */
const OUTPUT_SETTLE_MS = 4000;

/**
 * Roadmap #27: with the setting on, music the car stopped (engine off, phone unplugged)
 * carries on when CarPlay or Android Auto connects again. Apple allows an app to start on
 * its own only to resume interrupted audio, so nothing plays that was not playing when the
 * car went away. The car state is eqStore `carActive`, set by both bridges. On connect the
 * native side first reopens (or, while paused, releases) the output; playing waits for that.
 * Only within one app run: after iOS or Android ended the app, the car starts it paused.
 * Returns the cleanup.
 */
export function resumeWhenCarReconnects(): () => void {
  let stoppedAt = -Infinity;
  let resumePending = false;
  let cancelSettle: (() => void) | null = null;

  const offPlayer = usePlayerStore.subscribe((state, prev) => {
    if (prev.isPlaying && !state.isPlaying) stoppedAt = performance.now();
    // Playing again by other means (the car's own play command, a tap): nothing left to do.
    // Played away from the car in between: what stops after that is not the car's doing.
    if (state.isPlaying) {
      cancelSettle?.();
      if (!useEqStore.getState().carActive) resumePending = false;
    }
  });

  const resumeOnceSettled = () => {
    let done = false;
    const unlisten: Array<() => void> = [];
    const finish = (play: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      unlisten.forEach(off => off());
      cancelSettle = null;
      if (play && !usePlayerStore.getState().isPlaying) usePlayerStore.getState().resume();
    };
    const timer = window.setTimeout(() => finish(true), OUTPUT_SETTLE_MS);
    cancelSettle = () => finish(false);
    for (const ev of ['audio:device-changed', 'audio:output-released'] as const) {
      void listen(ev, () => finish(true)).then(off => {
        if (done) off();
        else unlisten.push(off);
      });
    }
  };

  const offCar = useEqStore.subscribe((state, prev) => {
    if (state.carActive === prev.carActive) return;
    if (!state.carActive) {
      const player = usePlayerStore.getState();
      resumePending = player.isPlaying || performance.now() - stoppedAt < PAUSED_BY_CAR_MS;
      cancelSettle?.();
      return;
    }
    if (!resumePending) return;
    resumePending = false;
    const player = usePlayerStore.getState();
    if (!useMobilePlaybackStore.getState().resumeOnCarConnect || player.isPlaying) return;
    if (!player.currentTrack && !player.currentRadio) return;
    resumeOnceSettled();
  });

  return () => {
    offPlayer();
    offCar();
    cancelSettle?.();
  };
}
