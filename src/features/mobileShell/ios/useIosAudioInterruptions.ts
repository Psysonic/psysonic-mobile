import { useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { usePlayerStore } from '@/features/playback';
import { reopenAudioOutput } from '@/features/mobileShell/utils/reopenAudioOutput';
import { RADIO_STARTING_EVENT } from '@/features/playback';

/** How long after a station starts an interruption is its own audio taking over (seen: 2 s). */
const RADIO_TAKEOVER_MS = 5000;

interface InterruptionPayload {
  began: boolean;
  shouldResume: boolean;
}

/**
 * iOS: a call, Siri or an alarm interrupts the audio session, and unplugged
 * headphones or a lost Bluetooth device drop its route. iOS stops the output but
 * not the player, so the native side (`src-tauri/src/ios/audio_session.rs`) reports both. The
 * player pauses with them; when the interruption ends the output is reopened and
 * the player resumes what was playing before, only when iOS allows it
 * (`shouldResume`), like Apple Music. A lost route pauses for good. If iOS never
 * reports the end, coming back to the app reopens the output without playing, and the next
 * play still asks the native side to turn the session on again (`ios-audio:reactivate`):
 * taking Bluetooth headphones off ends in an interruption that never ends (log 02.11.), and
 * everything played into silence until they came back.
 *
 * A station's own audio taking the session over shortly after it starts reports as an
 * interruption too. That one does not pause, but it is still remembered: if it was a real
 * call after all, its end reopens the output and resumes, and the next track played on the
 * engine asks for the session again.
 */
export function useIosAudioInterruptions(): void {
  useEffect(() => {
    let cancelled = false;
    /** The output has to be reopened (the interruption's end or coming back reopens it). */
    let interrupted = false;
    /** iOS turned the session off and has not reported it back on; the next play asks for it. */
    let sessionLost = false;
    /** The pending interruption came while a station was starting: its own audio, most likely. */
    let duringRadioStart = false;
    let resumeAfterInterruption = false;
    const unlisten: Array<() => void> = [];

    // A station plays through the page's own audio, which takes the audio session over from
    // the engine: iOS reports that as an interruption, and pausing then left the player
    // showing "paused" while the radio played (car test 21.10.).
    let radioStartedAt = -Infinity;
    const onRadioStarting = () => { radioStartedAt = performance.now(); };
    window.addEventListener(RADIO_STARTING_EVENT, onRadioStarting);

    const pauseIfPlaying = () => {
      const player = usePlayerStore.getState();
      if (player.isPlaying) player.pause();
    };

    const recover = async (resume: boolean) => {
      if (interrupted) {
        interrupted = false;
        await reopenAudioOutput();
      }
      if (resume && !cancelled) usePlayerStore.getState().resume();
    };

    const onVisible = () => {
      // A station that took the session over keeps playing; reopening the engine's output
      // under it would only fight it.
      if (document.visibilityState === 'visible' && interrupted && !duringRadioStart) {
        resumeAfterInterruption = false;
        void recover(false);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    const offPlay = usePlayerStore.subscribe((state, prev) => {
      // A station plays through the page's own audio, not the engine's session.
      if (!sessionLost || !state.isPlaying || prev.isPlaying || state.currentRadio) return;
      sessionLost = false;
      interrupted = false;
      duringRadioStart = false;
      resumeAfterInterruption = false;
      void emit('ios-audio:reactivate');
    });

    const setup = async () => {
      const offInterruption = await listen<InterruptionPayload>('ios-audio:interruption', ({ payload }) => {
        if (payload.began) {
          duringRadioStart = performance.now() - radioStartedAt < RADIO_TAKEOVER_MS;
          interrupted = true;
          sessionLost = true;
          resumeAfterInterruption = usePlayerStore.getState().isPlaying;
          if (!duringRadioStart) pauseIfPlaying();
          return;
        }
        // The native side has activated the session again before reporting the end.
        sessionLost = false;
        duringRadioStart = false;
        const resume = resumeAfterInterruption && payload.shouldResume;
        resumeAfterInterruption = false;
        void recover(resume);
      });
      if (cancelled) { offInterruption(); return; }
      unlisten.push(offInterruption);

      const offRouteLost = await listen('ios-audio:route-lost', () => {
        resumeAfterInterruption = false;
        pauseIfPlaying();
      });
      if (cancelled) { offRouteLost(); return; }
      unlisten.push(offRouteLost);
    };
    void setup();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      offPlay();
      window.removeEventListener(RADIO_STARTING_EVENT, onRadioStarting);
      unlisten.forEach(off => off());
    };
  }, []);
}
