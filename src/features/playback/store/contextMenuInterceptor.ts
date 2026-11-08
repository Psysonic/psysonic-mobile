/** The arguments of `openContextMenu`, kept loose: the store imports this module. */
export type ContextMenuRequest = [x: number, y: number, item: unknown, type: string, ...rest: unknown[]];

let interceptor: ((request: ContextMenuRequest) => boolean) | null = null;

/**
 * Touch shell: lets a long press see what a row's menu would have shown, and show the ring
 * instead. Set only around that long press; on the desktop it is never set.
 */
export function setContextMenuInterceptor(next: ((request: ContextMenuRequest) => boolean) | null): void {
  interceptor = next;
}

/** True when the request was taken over and the menu must not open. */
export function interceptContextMenu(request: ContextMenuRequest): boolean {
  return interceptor?.(request) ?? false;
}
