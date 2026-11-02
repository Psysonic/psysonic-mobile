/**
 * ⚠️ Android territory. The car has its own EQ, so ours stays out while Android Auto is
 * connected (eqStore `carActive`; the car player with the app closed has no EQ either, so
 * the car sounds the same either way). `PsysonicMedia.onCarConnected` reports changes; the
 * state at start is asked once, since the car can connect before the web view runs.
 */
import { useEqStore } from '@/store/eqStore';
import { androidIsCarConnected } from '@/lib/api/androidMediaHost';

declare global {
  interface Window {
    __psyCarConnected?: (connected: boolean) => void;
  }
}

/** Returns the cleanup. */
export function keepEqOutOfAndroidAuto(): () => void {
  const setCar = (connected: boolean) => useEqStore.getState().setCarActive(connected);
  window.__psyCarConnected = connected => setCar(connected === true);
  setCar(androidIsCarConnected());
  return () => {
    delete window.__psyCarConnected;
  };
}
