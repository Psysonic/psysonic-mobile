import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));

import { useEqStore } from '@/store/eqStore';
import { mobileOutputKey, parseMobileOutput, startMobileEqDevice, useMobileOutputStore } from './mobileEqDevice';

const BUDS = JSON.stringify({ kind: 'bluetooth', name: 'Galaxy Buds2 Pro' });
const SPEAKER = JSON.stringify({ kind: 'speaker', name: 'SM-S901B' });
const flat = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const bass = [6, 5, 4, 2, 0, 0, 0, 0, 0, 0];

describe('mobileEqDevice', () => {
  let sync: ReturnType<typeof startMobileEqDevice> | undefined;

  beforeEach(() => {
    useEqStore.setState({
      gains: flat, enabled: true, preGain: 0, activePreset: 'Flat',
      rememberPerDevice: true, byDevice: {}, carActive: false, eqInCar: false,
    });
  });

  afterEach(() => { sync?.stop(); sync = undefined; });

  it('reads what the native side reports and keys it', () => {
    expect(parseMobileOutput(BUDS)).toEqual({ kind: 'bluetooth', name: 'Galaxy Buds2 Pro' });
    expect(parseMobileOutput({ kind: 'hdmi', name: 'TV' })).toEqual({ kind: 'other', name: 'TV' });
    expect(parseMobileOutput('not json')).toBeNull();
    expect(parseMobileOutput({})).toBeNull();
    expect(mobileOutputKey({ kind: 'speaker', name: 'SM-S901B' }, false)).toBe('speaker');
    expect(mobileOutputKey({ kind: 'bluetooth', name: 'Galaxy Buds2 Pro' }, false)).toBe('bluetooth:Galaxy Buds2 Pro');
    expect(mobileOutputKey({ kind: 'bluetooth', name: 'Galaxy Buds2 Pro' }, true)).toBe('car');
    expect(mobileOutputKey({ kind: 'car', name: 'VW' }, false)).toBe('car');
  });

  it('keeps one EQ per output and brings it back on return', () => {
    sync = startMobileEqDevice();
    sync.report(SPEAKER);
    expect(useMobileOutputStore.getState().output).toEqual({ kind: 'speaker', name: 'SM-S901B' });

    sync.report(BUDS);
    // A new device starts with the EQ as it is; changes there stay with it.
    useEqStore.getState().applyPreset('Bass Boost');
    expect(useEqStore.getState().byDevice['bluetooth:Galaxy Buds2 Pro'].gains).toEqual(bass);

    sync.report(SPEAKER);
    expect(useEqStore.getState().gains).toEqual(flat);
    expect(useEqStore.getState().activePreset).toBe('Flat');

    sync.report(BUDS);
    expect(useEqStore.getState().gains).toEqual(bass);
  });

  it('the car is a device of its own while it is connected', () => {
    sync = startMobileEqDevice();
    sync.report(BUDS);
    useEqStore.getState().setCarActive(true);
    expect(useMobileOutputStore.getState().output).toEqual({ kind: 'car', name: '' });
    useEqStore.getState().applyPreset('Bass Boost');
    useEqStore.getState().setCarActive(false);
    expect(useEqStore.getState().gains).toEqual(flat);
    expect(useEqStore.getState().byDevice.car.gains).toEqual(bass);
  });

  it('with the setting off it only tracks the output', () => {
    useEqStore.setState({ rememberPerDevice: false });
    sync = startMobileEqDevice();
    sync.report(SPEAKER);
    useEqStore.getState().applyPreset('Bass Boost');
    sync.report(BUDS);
    expect(useEqStore.getState().gains).toEqual(bass);
    expect(useEqStore.getState().byDevice).toEqual({});
  });

  it('switching the setting on saves the EQ for the output in use', () => {
    useEqStore.setState({ rememberPerDevice: false });
    sync = startMobileEqDevice();
    sync.report(BUDS);
    useEqStore.getState().setRememberPerDevice(true);
    expect(Object.keys(useEqStore.getState().byDevice)).toEqual(['bluetooth:Galaxy Buds2 Pro']);
  });
});
