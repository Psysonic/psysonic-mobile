import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  showToast: vi.fn(),
  reportFailure: vi.fn(),
}));

vi.mock('@/lib/dom/toast', () => ({ showToast: mocks.showToast }));
vi.mock('@/features/playback/store/playbackAlternativeStore', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/playback/store/playbackAlternativeStore')>()),
  reportPlaybackSourceFailure: mocks.reportFailure,
}));
vi.mock('@/features/playback/store/playbackReportSession', () => ({
  playbackReportPlaying: vi.fn(),
  playbackReportStopped: vi.fn(() => Promise.resolve()),
}));

import { handleAudioError } from './audioEventHandlers';

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
});

describe('handleAudioError', () => {
  it('leaves the message to the dialog when the dialog shows it', () => {
    mocks.reportFailure.mockReturnValue(true);

    handleAudioError('track-stream: format probe failed');

    expect(mocks.reportFailure).toHaveBeenCalledOnce();
    expect(mocks.showToast).not.toHaveBeenCalled();
  });

  it('falls back to a toast when no dialog shows the failure', () => {
    mocks.reportFailure.mockReturnValue(false);

    handleAudioError('track-stream: format probe failed');

    expect(mocks.showToast).toHaveBeenCalledWith(
      "Couldn't play track. track-stream: format probe failed",
      8000,
      'error',
    );
  });
});
