import { create } from 'zustand';
import { useEqStore, type EqSnapshot } from '@/store/eqStore';

/** What the phone plays on: from Android's audio routing or the iOS audio session. */
export type MobileOutputKind = 'speaker' | 'wired' | 'bluetooth' | 'car' | 'usb' | 'other';

export interface MobileOutput {
  kind: MobileOutputKind;
  /** The device's own name (a headset, a car); empty for the phone's speaker. */
  name: string;
}

const KINDS: readonly MobileOutputKind[] = ['speaker', 'wired', 'bluetooth', 'car', 'usb', 'other'];

/** Reads what the native side reports; anything unknown counts as `other`. */
export function parseMobileOutput(raw: unknown): MobileOutput | null {
  const value = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) as unknown; } catch { return null; } })() : raw;
  if (!value || typeof value !== 'object') return null;
  const { kind, name } = value as { kind?: unknown; name?: unknown };
  if (typeof kind !== 'string') return null;
  return {
    kind: (KINDS as readonly string[]).includes(kind) ? kind as MobileOutputKind : 'other',
    name: typeof name === 'string' ? name.trim() : '',
  };
}

/** The `byDevice` key: one for the speaker, one for the car, one per named headset. */
export function mobileOutputKey(output: MobileOutput, carActive: boolean): string {
  if (carActive || output.kind === 'car') return 'car';
  if (output.kind === 'speaker') return 'speaker';
  return `${output.kind}:${output.name}`;
}

interface MobileOutputState {
  /** The output the EQ applies to now; `null` until the native side has answered. */
  output: MobileOutput | null;
}

export const useMobileOutputStore = create<MobileOutputState>(() => ({ output: null }));

/**
 * Roadmap #43: the EQ per output on the phone, the mobile counterpart of the desktop's
 * `eqDeviceSync` (which the touch shell does not start: the engine sees only "the default
 * output" there). Same opt-in (`rememberPerDevice`) and the same `byDevice` snapshots,
 * keyed by `mobileOutputKey`; the car counts as one device. A new device starts with the
 * EQ as it is. `report` is called by the platform bridge on every output change.
 * Returns `report` and the cleanup.
 */
export function startMobileEqDevice(): { report: (raw: unknown) => void; stop: () => void } {
  let currentKey: string | null = null;
  let lastOutput: MobileOutput | null = null;
  let applying = false;

  const apply = (snap: EqSnapshot) => {
    applying = true;
    try { useEqStore.getState().applySnapshot(snap); } finally { applying = false; }
  };

  const switchTo = (output: MobileOutput) => {
    const eq = useEqStore.getState();
    const key = mobileOutputKey(output, eq.carActive);
    const shown: MobileOutput = key === 'car' ? { kind: 'car', name: output.kind === 'car' ? output.name : '' } : output;
    useMobileOutputStore.setState({ output: shown });
    if (key === currentKey) return;
    const prevKey = currentKey;
    currentKey = key;
    if (!eq.rememberPerDevice) return;
    if (prevKey !== null) eq.saveSnapshotFor(prevKey);
    const snap = eq.byDevice[key];
    if (snap) apply(snap);
    else useEqStore.getState().saveSnapshotFor(key);
  };

  const report = (raw: unknown) => {
    const output = parseMobileOutput(raw);
    if (!output) return;
    lastOutput = output;
    switchTo(output);
  };

  const offEq = useEqStore.subscribe((state, prev) => {
    if (state.carActive !== prev.carActive) {
      if (lastOutput) switchTo(lastOutput);
      return;
    }
    if (applying || !state.rememberPerDevice || currentKey === null) return;
    const contentChanged = state.gains !== prev.gains
      || state.enabled !== prev.enabled
      || state.preGain !== prev.preGain
      || state.activePreset !== prev.activePreset;
    if (!prev.rememberPerDevice || contentChanged) state.saveSnapshotFor(currentKey);
  });

  return {
    report,
    stop: () => {
      offEq();
      useMobileOutputStore.setState({ output: null });
    },
  };
}
