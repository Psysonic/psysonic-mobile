import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useThrottledOnChange } from './useThrottledOnChange';

describe('useThrottledOnChange', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('runs once at the start', () => {
    const run = vi.fn();
    renderHook(() => useThrottledOnChange(1, run, 5000));
    vi.advanceTimersByTime(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs at most once per interval while the value keeps changing', () => {
    const run = vi.fn();
    const view = renderHook(({ value }) => useThrottledOnChange(value, run, 5000), {
      initialProps: { value: 0 },
    });
    vi.advanceTimersByTime(0);
    for (let i = 1; i <= 9; i++) {
      view.rerender({ value: i });
      vi.advanceTimersByTime(1000);
    }
    // A change every second: runs at the start and at 5 s; the next one waits until 10 s.
    expect(run).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('catches the last change once the value settles', () => {
    const run = vi.fn();
    const view = renderHook(({ value }) => useThrottledOnChange(value, run, 5000), {
      initialProps: { value: 0 },
    });
    vi.advanceTimersByTime(0);
    view.rerender({ value: 1 });
    vi.advanceTimersByTime(4999);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not run again without a change', () => {
    const run = vi.fn();
    renderHook(() => useThrottledOnChange(1, run, 5000));
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
