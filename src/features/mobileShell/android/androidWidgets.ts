/**
 * ⚠️ Android territory. Home screen widgets and Quick Settings tiles, the counterpart of
 * `ios/useIosWidgets`: what they show goes to the native side as JSON
 * (`src-tauri/android/PsysonicWidgets.kt` keeps it and draws), their taps come back through
 * `window.__psyWidgetCommand`. `ready` follows once the restored queue is back, so a tap
 * that opened the app plays or resumes what was there.
 */
import { startupQueueSettled } from '@/features/playback';
import { runWidgetCommand } from '@/features/mobileShell/widgets/widgetSnapshot';
import { watchWidgetSnapshot } from '@/features/mobileShell/widgets/watchWidgetSnapshot';
import { IS_ANDROID } from '@/lib/util/platform';

interface WidgetHost {
  /** Older app builds lack them. */
  update?(json: string): void;
  ready?(): void;
}

type WidgetWindow = Window & {
  PsysonicAndroidWidgets?: WidgetHost;
  __psyWidgetCommand?: (action: string) => void;
};

const widgetWindow = () => window as WidgetWindow;

/** Keeps the widgets current and answers their taps; returns the cleanup. */
export function installAndroidWidgets(): () => void {
  if (!IS_ANDROID) return () => {};
  widgetWindow().__psyWidgetCommand = action => {
    void runWidgetCommand(action).catch(() => {});
  };
  const stop = watchWidgetSnapshot(snapshot => {
    widgetWindow().PsysonicAndroidWidgets?.update?.(JSON.stringify(snapshot));
  });
  let disposed = false;
  void startupQueueSettled.then(() => {
    if (!disposed) widgetWindow().PsysonicAndroidWidgets?.ready?.();
  });
  return () => {
    disposed = true;
    stop();
    delete widgetWindow().__psyWidgetCommand;
  };
}
