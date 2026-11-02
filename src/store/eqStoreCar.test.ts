import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn(async () => null as unknown) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import { eqActive, useEqStore } from './eqStore';

/** `enabled` of every `audio_set_eq` call so far. */
const sentEnabled = () => invokeMock.mock.calls
  .filter(call => (call as unknown[])[0] === 'audio_set_eq')
  .map(call => ((call as unknown[])[1] as { enabled: boolean }).enabled);

describe('eqStore in the car', () => {
  beforeEach(() => {
    useEqStore.setState({ enabled: true, carActive: false });
    invokeMock.mockClear();
  });

  it('keeps the EQ out while a car is connected and brings it back after', () => {
    useEqStore.getState().setCarActive(true);
    expect(sentEnabled()).toEqual([false]);
    expect(useEqStore.getState().enabled).toBe(true);

    // Changes made in the car are kept but not applied.
    useEqStore.getState().setBandGain(0, 4);
    expect(sentEnabled()).toEqual([false, false]);

    useEqStore.getState().setCarActive(false);
    expect(sentEnabled()).toEqual([false, false, true]);
  });

  it('sends nothing when the car state does not change', () => {
    useEqStore.getState().setCarActive(false);
    expect(sentEnabled()).toEqual([]);
  });

  it('an EQ switched off stays off when the car leaves', () => {
    useEqStore.setState({ enabled: false });
    useEqStore.getState().setCarActive(true);
    useEqStore.getState().setCarActive(false);
    expect(sentEnabled()).toEqual([false, false]);
  });

  it('eqActive needs the EQ on and no car', () => {
    expect(eqActive({ enabled: true, carActive: false })).toBe(true);
    expect(eqActive({ enabled: true, carActive: true })).toBe(false);
    expect(eqActive({ enabled: false, carActive: false })).toBe(false);
  });
});
