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
    useEqStore.setState({ enabled: true, carActive: false, eqInCar: false });
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

  it('with the EQ wanted in the car, it stays in while the car is there', () => {
    useEqStore.getState().setEqInCar(true);
    useEqStore.getState().setCarActive(true);
    expect(sentEnabled()).toEqual([true, true]);
    useEqStore.getState().setEqInCar(false);
    expect(sentEnabled()).toEqual([true, true, false]);
  });

  it('eqActive needs the EQ on and no car, unless the EQ is wanted there', () => {
    expect(eqActive({ enabled: true, carActive: false, eqInCar: false })).toBe(true);
    expect(eqActive({ enabled: true, carActive: true, eqInCar: false })).toBe(false);
    expect(eqActive({ enabled: true, carActive: true, eqInCar: true })).toBe(true);
    expect(eqActive({ enabled: false, carActive: true, eqInCar: true })).toBe(false);
  });
});
