import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { QrCode, X } from 'lucide-react';
import { showToast } from '@/lib/dom/toast';
import { cancelHubScan, deviceHasCamera, ensureCameraPermission, HUB_SCANNING_ATTR, scanHubQr } from './scanHubQr';

/**
 * Full-screen frame over the camera while a scan runs: the page itself is hidden and
 * transparent so the camera behind it shows. Cancel (button, Escape, the Android back key
 * through `androidBack.ts`) stops the scan.
 */
function HubQrScanner() {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute(HUB_SCANNING_ATTR, '');
    ref.current?.focus();
    return () => html.removeAttribute(HUB_SCANNING_ATTR);
  }, []);

  return createPortal(
    <div
      ref={ref}
      className="mobile-hub-scanner"
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.hubScanQr')}
      tabIndex={-1}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); void cancelHubScan(); } }}
    >
      <p className="mobile-hub-scanner__hint">{t('settings.hubScanQrDescription')}</p>
      <div className="mobile-hub-scanner__frame" aria-hidden="true" />
      <button type="button" className="mobile-hub-scanner__cancel" onClick={() => void cancelHubScan()}>
        <X size={20} aria-hidden="true" />
        {t('common.cancel')}
      </button>
    </div>,
    document.body,
  );
}

/**
 * Settings → Integrations → Hub, phones only (`IS_MOBILE_SHELL`): scan the QR code the hub's
 * web page shows (Settings, after "show token") instead of typing address and token.
 */
export function HubQrScanButton() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await ensureCameraPermission())) {
        showToast(t('settings.hubScanQrNoCamera'), 5000, 'error');
        return;
      }
      setScanning(true);
      const result = await scanHubQr();
      if (result === 'connected') showToast(t('settings.hubScanQrDone'), 3000, 'success');
      else if (result === 'invalid') showToast(t('settings.hubScanQrInvalid'), 5000, 'error');
    } catch {
      showToast(t('settings.hubScanQrInvalid'), 5000, 'error');
    } finally {
      setScanning(false);
      setBusy(false);
    }
  };

  // No camera: address and token are typed in, as on the desktop.
  if (!deviceHasCamera()) return null;

  return (
    <div className="mobile-hub-qr">
      <button type="button" className="btn btn-primary mobile-hub-qr__btn" onClick={() => void scan()} disabled={busy}>
        <QrCode size={18} aria-hidden="true" />
        {t('settings.hubScanQr')}
      </button>
      <p className="mobile-hub-qr__hint">{t('settings.hubScanQrDescription')}</p>
      {scanning && <HubQrScanner />}
    </div>
  );
}
