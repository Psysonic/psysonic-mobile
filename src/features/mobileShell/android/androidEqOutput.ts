/**
 * ⚠️ Android territory. Feeds the EQ per output (`mobileEqDevice`): `PsysonicMedia` calls
 * `__psyOutputChanged` when a device comes or goes, and the output at start is asked once.
 */
import { androidCurrentOutput } from '@/lib/api/androidMediaHost';
import { startMobileEqDevice } from '@/features/mobileShell/utils/mobileEqDevice';

declare global {
  interface Window {
    __psyOutputChanged?: (json: string) => void;
  }
}

/** Returns the cleanup. */
export function keepEqPerAndroidOutput(): () => void {
  const sync = startMobileEqDevice();
  window.__psyOutputChanged = json => sync.report(json);
  const atStart = androidCurrentOutput();
  if (atStart) sync.report(atStart);
  return () => {
    delete window.__psyOutputChanged;
    sync.stop();
  };
}
