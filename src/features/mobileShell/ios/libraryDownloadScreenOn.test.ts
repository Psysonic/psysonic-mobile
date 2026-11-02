import { beforeEach, describe, expect, it, vi } from 'vitest';

const { emitMock, downloads } = vi.hoisted(() => ({
  emitMock: vi.fn(async () => {}),
  downloads: { report: null as ((active: boolean) => void) | null },
}));
vi.mock('@tauri-apps/api/event', () => ({ emit: emitMock }));
vi.mock('@/features/mobileShell/utils/libraryDownloadActivity', () => ({
  watchLibraryDownloadActivity: (onChange: (active: boolean) => void) => {
    downloads.report = onChange;
    return () => { downloads.report = null; };
  },
}));

import { keepScreenOnForLibraryDownloads } from './libraryDownloadScreenOn';
import { useMobileScreenStore } from '@/features/mobileShell/store/mobileScreenStore';

const sent = () => emitMock.mock.calls.map(call => (call as unknown[])[1]);

describe('keepScreenOnForLibraryDownloads', () => {
  beforeEach(() => {
    emitMock.mockClear();
    useMobileScreenStore.setState({ keepScreenOn: false });
  });

  it('keeps the screen on while the setting is on or a library downloads', () => {
    const stop = keepScreenOnForLibraryDownloads();
    expect(sent()).toEqual([false]);

    useMobileScreenStore.getState().setKeepScreenOn(true);
    expect(sent()).toEqual([false, true]);

    // A download while the setting is on changes nothing; switching the setting off
    // during the download keeps the screen on until the download ends.
    downloads.report?.(true);
    useMobileScreenStore.getState().setKeepScreenOn(false);
    expect(sent()).toEqual([false, true]);
    downloads.report?.(false);
    expect(sent()).toEqual([false, true, false]);

    stop();
  });

  it('lets the screen lock again when it stops', () => {
    useMobileScreenStore.setState({ keepScreenOn: true });
    const stop = keepScreenOnForLibraryDownloads();
    stop();
    expect(sent()).toEqual([true, false]);
  });
});
