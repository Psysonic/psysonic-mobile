import type { OfflineLibraryCard } from './offlineLibraryHelpers';

/**
 * Shows the Downloaded cards from the index first, then again after the disk
 * check. The disk check waits until no download is running; with the cards
 * behind it, the page showed only its spinner for as long as a download ran.
 *
 * `show` returns false once the page no longer wants the cards; nothing further
 * runs then. A failed disk check keeps the cards already shown.
 */
export async function showCardsThenReconcile(
  readCards: () => Promise<OfflineLibraryCard[]>,
  reconcileWithDisk: () => Promise<unknown>,
  show: (cards: OfflineLibraryCard[]) => boolean,
): Promise<void> {
  if (!show(await readCards())) return;
  try {
    await reconcileWithDisk();
  } catch {
    return;
  }
  show(await readCards());
}
