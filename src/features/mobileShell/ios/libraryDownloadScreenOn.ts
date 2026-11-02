import { emit } from '@tauri-apps/api/event';
import { watchLibraryDownloadActivity } from '@/features/mobileShell/utils/libraryDownloadActivity';
import { watchKeepScreenOnSetting } from '@/features/mobileShell/store/mobileScreenStore';

/**
 * iPhone: the screen stays on (`src-tauri/src/ios/screen.rs`) while Settings → System →
 * "Keep the screen on" is set, and always while a whole-library download runs: such a
 * download only runs while Psysonic is open, and the auto-lock would suspend the app.
 * Returns the cleanup.
 */
export function keepScreenOnForLibraryDownloads(): () => void {
  let downloading = false;
  let setting = false;
  let sent: boolean | null = null;
  const send = () => {
    const keepOn = downloading || setting;
    if (keepOn === sent) return;
    sent = keepOn;
    void emit('ios:keep-screen-on', keepOn).catch(() => {});
  };
  const offSetting = watchKeepScreenOnSetting(on => {
    setting = on;
    send();
  });
  const offDownloads = watchLibraryDownloadActivity(active => {
    downloading = active;
    send();
  });
  return () => {
    offSetting();
    offDownloads();
    if (sent) void emit('ios:keep-screen-on', false).catch(() => {});
  };
}
