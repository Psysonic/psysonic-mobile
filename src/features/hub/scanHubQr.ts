import { useHubStore } from './hubStore';
import { parseHubConnectLink } from './hubConnectLink';

export type HubScanResult = 'connected' | 'invalid' | 'no-camera' | 'cancelled';

/** Set on `<html>` while the camera runs behind the (then transparent) web view. */
export const HUB_SCANNING_ATTR = 'data-hub-scanning';

/**
 * False on an Android device without any camera (the manifest lists the camera as optional,
 * so Play offers the app there too). iOS and older Android builds report nothing: true.
 */
export function deviceHasCamera(): boolean {
  return window.PsysonicAndroidShell?.hasCamera?.() !== false;
}

/** Camera permission, asked for when not granted yet. */
export async function ensureCameraPermission(): Promise<boolean> {
  const scanner = await import('@tauri-apps/plugin-barcode-scanner');
  let permission = await scanner.checkPermissions();
  if (permission !== 'granted') permission = await scanner.requestPermissions();
  return permission === 'granted';
}

/** Stops a running scan; its `scanHubQr` then answers 'cancelled'. */
export async function cancelHubScan(): Promise<void> {
  const scanner = await import('@tauri-apps/plugin-barcode-scanner');
  await scanner.cancel().catch(() => {});
}

/**
 * Reads the hub's QR code and fills in address and token; the hub connection is switched
 * on as well. The camera runs behind the web view (`windowed`), so the caller draws its own
 * frame and cancel button over it. The token goes straight into the hub store and is never
 * shown, returned or logged.
 */
export async function scanHubQr(): Promise<HubScanResult> {
  const scanner = await import('@tauri-apps/plugin-barcode-scanner');
  let content: string;
  try {
    content = (await scanner.scan({ windowed: true, formats: [scanner.Format.QRCode] })).content;
  } catch {
    // The plugin rejects when the scan is cancelled (cancel button, back key, leaving the app).
    return 'cancelled';
  }

  const link = parseHubConnectLink(content);
  if (!link) return 'invalid';
  const hub = useHubStore.getState();
  hub.setUrl(link.url);
  hub.setToken(link.token);
  hub.setEnabled(true);
  return 'connected';
}
