import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));

import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { EQ_BANDS, useEqStore } from '@/store/eqStore';
import MobileEqSheet from './MobileEqSheet';
import { curvePoint, nearestBand } from '@/features/mobileShell/utils/eqCurvePoints';

const WIDTH = 340;
const HEIGHT = 260;
const sheet = () => screen.getByRole('dialog', { name: 'Equalizer' });
const curve = () => sheet().querySelector('.mobile-eq__curve') as HTMLElement;

const isCurve = (el: HTMLElement) => el.classList.contains('mobile-eq__curve');

function render() {
  // The sheet measures the curve when it mounts; jsdom lays nothing out.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return isCurve(this) ? WIDTH : 0; });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return isCurve(this) ? HEIGHT : 0; });
  const result = renderWithProviders(<MobileEqSheet onClose={vi.fn()} />);
  const area = curve();
  area.getBoundingClientRect = () => ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT, x: 0, y: 0, toJSON: () => ({}) });
  area.setPointerCapture = () => {};
  return result;
}

describe('MobileEqSheet', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  beforeEach(() => {
    useEqStore.setState({
      enabled: true, carActive: false, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preGain: 0,
      activePreset: 'Flat', customPresets: [],
    });
  });

  it('places the bands left to right and finds the nearest one', () => {
    const xs = EQ_BANDS.map(b => curvePoint(b.freq, 0, WIDTH, HEIGHT).x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    xs.forEach((x, i) => expect(nearestBand(x + 1, WIDTH)).toBe(i));
    expect(curvePoint(1000, 12, WIDTH, HEIGHT).y).toBeLessThan(curvePoint(1000, 0, WIDTH, HEIGHT).y);
  });

  it('dragging up raises the band under the finger, relative to where it was', () => {
    render();
    const x = curvePoint(EQ_BANDS[8].freq, 0, WIDTH, HEIGHT).x;
    const pxPerDb = (HEIGHT - 8 - 1) / 26;
    fireEvent.pointerDown(curve(), { pointerId: 1, clientX: x, clientY: 200 });
    // Touching alone changes nothing, wherever the finger lands.
    expect(useEqStore.getState().gains[8]).toBe(0);
    fireEvent.pointerMove(curve(), { pointerId: 1, clientX: x, clientY: 200 - 4 * pxPerDb });
    expect(useEqStore.getState().gains[8]).toBe(4);
    expect(within(sheet()).getByText('8k Hz')).toBeInTheDocument();
    fireEvent.pointerMove(curve(), { pointerId: 1, clientX: x, clientY: 200 - 40 * pxPerDb });
    expect(useEqStore.getState().gains[8]).toBe(12);
    fireEvent.pointerUp(curve(), { pointerId: 1 });
    expect(useEqStore.getState().gains.filter((g, i) => i !== 8 && g !== 0)).toEqual([]);
    expect(useEqStore.getState().activePreset).toBeNull();
  });

  it('does not move bands while the EQ is off', () => {
    useEqStore.setState({ enabled: false });
    render();
    fireEvent.pointerDown(curve(), { pointerId: 1, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(curve(), { pointerId: 1, clientX: 100, clientY: 100 });
    expect(useEqStore.getState().gains.every(g => g === 0)).toBe(true);
  });

  it('a band also moves with the arrow keys', () => {
    render();
    const band = within(sheet()).getByRole('slider', { name: '1k Hz' });
    fireEvent.keyDown(band, { key: 'ArrowUp' });
    fireEvent.keyDown(band, { key: 'ArrowUp' });
    expect(useEqStore.getState().gains[5]).toBe(1);
  });

  it('the switch and the presets work on the store', () => {
    render();
    fireEvent.click(within(sheet()).getByRole('switch'));
    expect(useEqStore.getState().enabled).toBe(false);
    fireEvent.click(within(sheet()).getByRole('switch'));
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Rock' }));
    expect(useEqStore.getState().activePreset).toBe('Rock');
  });

  it('says the EQ is off in the car', () => {
    useEqStore.setState({ carActive: true });
    render();
    expect(within(sheet()).getByText(/Off in the car/)).toBeInTheDocument();
  });
});
