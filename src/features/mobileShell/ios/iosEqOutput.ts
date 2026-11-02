import { emit, listen } from '@tauri-apps/api/event';
import { startMobileEqDevice } from '@/features/mobileShell/utils/mobileEqDevice';

/**
 * Feeds the EQ per output (`mobileEqDevice`): the audio session reports the output on every
 * route change (`ios-audio:output`, `src-tauri/src/ios/audio_session.rs`) and answers
 * `ios-audio:output-request`, sent once the listener is in place. Returns the cleanup.
 */
export function keepEqPerIosOutput(): () => void {
  const sync = startMobileEqDevice();
  let cancelled = false;
  let off: (() => void) | undefined;
  void listen('ios-audio:output', ({ payload }) => sync.report(payload)).then(unlisten => {
    if (cancelled) { unlisten(); return; }
    off = unlisten;
    void emit('ios-audio:output-request');
  });
  return () => {
    cancelled = true;
    off?.();
    sync.stop();
  };
}
