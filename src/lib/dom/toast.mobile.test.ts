import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast } from './toast';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('showToast on the touch shell', () => {
  it('stays inside a phone-wide window instead of the 480 px desktop cap', () => {
    showToast("Couldn't play track. track-stream: format probe failed", 1000, 'error');
    const toast = document.querySelector<HTMLElement>('.psysonic-toast');

    expect(toast?.style.maxWidth).toBe('calc(100vw - 32px)');
  });
});
