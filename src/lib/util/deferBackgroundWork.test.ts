import { afterEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/lib/util/platform', () => ({
  get IS_MOBILE_SHELL() { return platform.mobile; },
}));

const { deferBackgroundWork, MOBILE_BACKGROUND_WORK_DELAY_MS } = await import('./deferBackgroundWork');

describe('deferBackgroundWork', () => {
  afterEach(() => {
    vi.useRealTimers();
    platform.mobile = false;
  });

  it('runs right away on the desktop', () => {
    const work = vi.fn();
    deferBackgroundWork(work);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('waits on a phone until the page settled', () => {
    vi.useFakeTimers();
    platform.mobile = true;
    const work = vi.fn();
    deferBackgroundWork(work);
    vi.advanceTimersByTime(MOBILE_BACKGROUND_WORK_DELAY_MS - 1);
    expect(work).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2100);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('drops the work when the page leaves first', () => {
    vi.useFakeTimers();
    platform.mobile = true;
    const work = vi.fn();
    const cancel = deferBackgroundWork(work);
    cancel();
    vi.advanceTimersByTime(MOBILE_BACKGROUND_WORK_DELAY_MS + 5000);
    expect(work).not.toHaveBeenCalled();
  });
});
