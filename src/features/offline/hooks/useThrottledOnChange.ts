import { useEffect, useRef } from 'react';

/**
 * Calls `run` when `value` changes, at most once per `intervalMs`; the last
 * change is always caught once the interval is up. For work that is too costly
 * for every change, such as measuring a folder while a download fills it.
 */
export function useThrottledOnChange(value: unknown, run: () => void, intervalMs: number): void {
  const lastRunRef = useRef(Number.NEGATIVE_INFINITY);
  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; });

  useEffect(() => {
    const wait = Math.max(0, intervalMs - (Date.now() - lastRunRef.current));
    const timer = window.setTimeout(() => {
      lastRunRef.current = Date.now();
      runRef.current();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [value, intervalMs]);
}
