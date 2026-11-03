import { useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { startupQueueSettled } from '@/features/playback';
import { runWidgetCommand } from '@/features/mobileShell/widgets/widgetSnapshot';
import { watchWidgetSnapshot } from '@/features/mobileShell/widgets/watchWidgetSnapshot';

interface CommandRequest {
  action: string;
}

/**
 * iOS home and lock screen widgets, Control Center controls: what they show goes to the
 * native side (`widget:update`, `src-tauri/src/ios/widgets.rs`), their taps come back as
 * `widget:command`. `widget:ready` follows once the restored queue is back, so a tap that
 * started the app plays or resumes what was there.
 */
export function useIosWidgets(): void {
  useEffect(() => {
    let cancelled = false;
    const unlisten: Array<() => void> = [];

    const setup = async () => {
      const offCommand = await listen<CommandRequest>('widget:command', ({ payload }) => {
        void runWidgetCommand(payload.action).catch(() => {});
      });
      if (cancelled) { offCommand(); return; }
      unlisten.push(offCommand);

      unlisten.push(watchWidgetSnapshot(snapshot => { void emit('widget:update', snapshot); }));

      await startupQueueSettled;
      if (!cancelled) await emit('widget:ready');
    };
    void setup();

    return () => {
      cancelled = true;
      unlisten.forEach(off => off());
    };
  }, []);
}
