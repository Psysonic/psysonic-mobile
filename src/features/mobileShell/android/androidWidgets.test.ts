import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let settle: () => void = () => {};
  return {
    settled: new Promise<void>(resolve => { settle = resolve; }),
    settle: () => settle(),
    send: undefined as undefined | ((snapshot: unknown) => void),
    stop: vi.fn(),
    run: vi.fn(async () => {}),
  };
});

vi.mock('@/lib/util/platform', () => ({ IS_ANDROID: true }));
vi.mock('@/features/playback', () => ({ startupQueueSettled: mocks.settled }));
vi.mock('@/features/mobileShell/widgets/widgetSnapshot', () => ({ runWidgetCommand: mocks.run }));
vi.mock('@/features/mobileShell/widgets/watchWidgetSnapshot', () => ({
  watchWidgetSnapshot: (send: (snapshot: unknown) => void) => {
    mocks.send = send;
    return mocks.stop;
  },
}));

import { installAndroidWidgets } from './androidWidgets';

type TestWindow = Window & {
  PsysonicAndroidWidgets?: { update: (json: string) => void; ready: () => void };
  __psyWidgetCommand?: (action: string) => void;
};
const testWindow = () => window as TestWindow;

describe('installAndroidWidgets', () => {
  afterEach(() => {
    delete testWindow().PsysonicAndroidWidgets;
  });

  it('sends each snapshot to the native side as JSON', () => {
    const update = vi.fn();
    testWindow().PsysonicAndroidWidgets = { update, ready: vi.fn() };
    const stop = installAndroidWidgets();
    mocks.send?.({ now: null, recent: [] });
    expect(update).toHaveBeenCalledWith('{"now":null,"recent":[]}');
    stop();
    expect(mocks.stop).toHaveBeenCalled();
  });

  it('runs a tapped action and reports ready once the restored queue is back', async () => {
    const ready = vi.fn();
    testWindow().PsysonicAndroidWidgets = { update: vi.fn(), ready };
    const stop = installAndroidWidgets();
    testWindow().__psyWidgetCommand?.('toggle');
    expect(mocks.run).toHaveBeenCalledWith('toggle');
    expect(ready).not.toHaveBeenCalled();
    mocks.settle();
    await mocks.settled;
    await Promise.resolve();
    expect(ready).toHaveBeenCalledTimes(1);
    stop();
    expect(testWindow().__psyWidgetCommand).toBeUndefined();
  });
});
