import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

const held = vi.hoisted(() => ({ value: false }));
vi.mock('@/features/offline', () => ({ useDownloadKeyHeldForWifi: () => held.value }));

import MobileDownloadButton, { type MobileDownloadStatus } from './MobileDownloadButton';

function setup(status: MobileDownloadStatus, progress: { done: number; total: number } | null = null) {
  renderWithProviders(
    <MobileDownloadButton
      status={status}
      progress={progress}
      name="Taken by Storm"
      downloadKey="srv:al-1"
      onDownload={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  return screen.getByRole('button');
}

describe('MobileDownloadButton', () => {
  it('a queued download waits visibly: still, dashed ring with a clock, no progress', () => {
    held.value = false;
    const button = setup('queued');
    expect(button).toHaveAttribute('data-status', 'queued');
    expect(button).toHaveAccessibleName('Waiting to download. Tap to cancel.');
    expect(button.querySelector('.mobile-download-btn__waiting')).not.toBeNull();
    expect(button.querySelector('.mobile-download-btn__fill')).toBeNull();
    expect(button.querySelector('.mobile-download-btn__cancel')).toBeNull();
  });

  it('a running download shows its progress and the cross, no clock', () => {
    held.value = false;
    const button = setup('downloading', { done: 4, total: 9 });
    expect(button.querySelector('.mobile-download-btn__fill')).not.toBeNull();
    expect(button.querySelector('.mobile-download-btn__cancel')).not.toBeNull();
    expect(button.querySelector('.mobile-download-btn__waiting')).toBeNull();
  });

  it('waiting for Wi-Fi keeps its own look', () => {
    held.value = true;
    const button = setup('queued');
    expect(button).toHaveAttribute('data-status', 'held');
    expect(button).toHaveAccessibleName('Waiting for Wi-Fi');
    expect(button.querySelector('.mobile-download-btn__waiting')).toBeNull();
  });
});
