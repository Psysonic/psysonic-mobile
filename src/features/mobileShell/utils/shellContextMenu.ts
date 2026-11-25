const EDITABLE = 'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

/**
 * The touch shell drops the WebView's own context menu: long presses open the shell's
 * menus instead. Text fields keep it, because Android's WebView shows its Cut / Copy /
 * Paste toolbar only when the long press's `contextmenu` is left alone (without it a
 * key could not be pasted into a settings field).
 */
export function preventShellContextMenu(e: { target: EventTarget | null; preventDefault(): void }): void {
  const target = e.target;
  if (target instanceof Element && target.closest(EDITABLE)) return;
  e.preventDefault();
}
