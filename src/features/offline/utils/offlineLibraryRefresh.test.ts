import { describe, expect, it, vi } from 'vitest';
import type { OfflineLibraryCard } from './offlineLibraryHelpers';
import { showCardsThenReconcile } from './offlineLibraryRefresh';

const card = (sourceId: string): OfflineLibraryCard => ({
  serverIndexKey: 'srv', pinSource: { kind: 'album', sourceId }, trackIds: ['t1'],
  name: sourceId, artist: '',
});

describe('showCardsThenReconcile', () => {
  it('shows the cards before the disk check finishes', async () => {
    const show = vi.fn(() => true);
    // A disk check that waits on a running download and never comes back here.
    void showCardsThenReconcile(
      async () => [card('a')],
      () => new Promise(() => {}),
      show,
    );
    await vi.waitFor(() => expect(show).toHaveBeenCalledWith([card('a')]));
  });

  it('reads the cards again once the disk check is done', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce([card('a')])
      .mockResolvedValueOnce([card('a'), card('b')]);
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const show = vi.fn(() => true);
    await showCardsThenReconcile(read, reconcile, show);
    expect(show.mock.calls).toEqual([[[card('a')]], [[card('a'), card('b')]]]);
    expect(reconcile.mock.invocationCallOrder[0])
      .toBeLessThan(read.mock.invocationCallOrder[1]);
  });

  it('stops when the page no longer wants the cards', async () => {
    const read = vi.fn().mockResolvedValue([card('a')]);
    const reconcile = vi.fn().mockResolvedValue(undefined);
    await showCardsThenReconcile(read, reconcile, () => false);
    expect(reconcile).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('keeps the first cards when the disk check fails', async () => {
    const read = vi.fn().mockResolvedValue([card('a')]);
    const show = vi.fn(() => true);
    await showCardsThenReconcile(read, () => Promise.reject(new Error('disk')), show);
    expect(show).toHaveBeenCalledTimes(1);
  });
});
