import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BUILTIN_PRESETS, EQ_BANDS, useEqStore } from '@/store/eqStore';
import { useThemeStore } from '@/store/themeStore';
import { useThemeRevision } from '@/lib/themes/themeRevision';
import { drawCurve, EQ_CURVE_GEOMETRY as G } from '@/features/playback';
import { curvePoint, nearestBand } from '@/features/mobileShell/utils/eqCurvePoints';
import { useMobileOutputStore, type MobileOutput } from '@/features/mobileShell/utils/mobileEqDevice';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';

/** Band gains are kept in steps of this many dB. */
const STEP_DB = 0.5;
const MAX_DB = 12;

const clampGain = (db: number) => Math.max(-MAX_DB, Math.min(MAX_DB, Math.round(db / STEP_DB) * STEP_DB));
const formatDb = (db: number) => `${db > 0 ? '+' : ''}${db.toFixed(1)}`;

/** How an output is named in the sheet: its own name where it has one. */
function outputLabel(output: MobileOutput, t: (key: string) => string): string {
  if (output.kind === 'speaker') return t('settings.eqOutputSpeaker');
  if (output.name) return output.name;
  if (output.kind === 'car') return t('settings.eqOutputCar');
  if (output.kind === 'wired') return t('settings.eqOutputWired');
  return t('settings.eqOutputOther');
}

function SwitchRow({ id, label, sub, checked, onToggle }: {
  id: string; label: string; sub?: string; checked: boolean; onToggle: () => void;
}) {
  return (
    <div className="mobile-list-row mobile-eq__toggle">
      <span className="mobile-list-row__text">
        <span className="mobile-list-row__label" id={id}>{label}</span>
        {sub && <span className="mobile-list-row__sub">{sub}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} className="mobile-switch" onClick={onToggle}>
        <span className="mobile-switch__thumb" />
      </button>
    </div>
  );
}

interface Props {
  onClose: () => void;
}

/**
 * Roadmap #44: the EQ from the full-screen player, made for a finger. One point per band on
 * the response curve; touch anywhere above or below a band and drag up or down. The drag is
 * relative, so touching does not make the band jump. Same store as the desktop EQ, which
 * stays the full editor in Settings → Audio (AutoEQ lookup, saving presets).
 */
export default function MobileEqSheet({ onClose }: Props) {
  const { t } = useTranslation();
  const gains = useEqStore(s => s.gains);
  const enabled = useEqStore(s => s.enabled);
  const preGain = useEqStore(s => s.preGain);
  const activePreset = useEqStore(s => s.activePreset);
  const customPresets = useEqStore(s => s.customPresets);
  const carActive = useEqStore(s => s.carActive);
  const eqInCar = useEqStore(s => s.eqInCar);
  const perDevice = useEqStore(s => s.rememberPerDevice);
  const output = useMobileOutputStore(s => s.output);
  const { setBandGain, setEnabled, setPreGain, applyPreset, setEqInCar, setRememberPerDevice } = useEqStore.getState();

  const theme = useThemeStore(s => s.theme);
  const themeRev = useThemeRevision();
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [active, setActive] = useState<number | null>(null);
  const dragRef = useRef<{ band: number; startY: number; startDb: number; pointerId: number } | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--accent').trim() || 'rgb(203, 166, 247)';
    const bg = style.getPropertyValue('--bg-card').trim() || style.getPropertyValue('--bg-app').trim() || '#1e1e2e';
    const text = style.getPropertyValue('--text-muted').trim() || 'rgba(255,255,255,0.4)';
    drawCurve(canvas, gains, accent, bg, text);
    // Theme and its revision only trigger the redraw; the colours are read live above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gains, theme, themeRev]);

  useEffect(() => { redraw(); }, [redraw, size]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return undefined;
    const measure = () => setSize({ width: area.clientWidth, height: area.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    // The sheet closes when its content is pulled down at the top; on the curve that pull
    // moves a band instead.
    const stop = (e: TouchEvent) => e.stopPropagation();
    area.addEventListener('touchstart', stop, { passive: true });
    area.addEventListener('touchmove', stop, { passive: true });
    return () => {
      ro.disconnect();
      area.removeEventListener('touchstart', stop);
      area.removeEventListener('touchmove', stop);
    };
  }, []);

  const pxPerDb = (size.height - G.padT - G.padB) / (G.dbMax - G.dbMin);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!enabled || !areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const band = nearestBand(e.clientX - rect.left, rect.width);
    dragRef.current = { band, startY: e.clientY, startDb: gains[band], pointerId: e.pointerId };
    setActive(band);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || pxPerDb <= 0) return;
    const next = clampGain(drag.startDb + (drag.startY - e.clientY) / pxPerDb);
    if (next !== useEqStore.getState().gains[drag.band]) setBandGain(drag.band, next);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setActive(null);
  };

  const onBandKey = (band: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? STEP_DB
      : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -STEP_DB : 0;
    if (!delta) return;
    e.preventDefault();
    setBandGain(band, clampGain(gains[band] + delta));
  };

  const isBuiltin = activePreset !== null && BUILTIN_PRESETS.some(p => p.name === activePreset);
  const isCustom = activePreset !== null && customPresets.some(p => p.name === activePreset);
  // An AutoEQ profile keeps the headphone name as the preset; show it so it stays visible.
  const autoEqName = activePreset !== null && !isBuiltin && !isCustom ? activePreset : null;
  const presets = [...BUILTIN_PRESETS, ...customPresets];

  return (
    <MobileSheet title={t('settings.eqTitle')} onClose={onClose} className="mobile-eq-sheet">
      <div className="mobile-eq">
        <div className="mobile-eq__switches">
          <SwitchRow id="mobile-eq-enabled-label" label={t('settings.eqEnabled')} checked={enabled} onToggle={() => setEnabled(!enabled)} />
          <SwitchRow
            id="mobile-eq-per-device-label"
            label={t('settings.audioOutputDeviceRememberEq')}
            sub={perDevice && output ? t('settings.eqAppliesTo', { device: outputLabel(output, t) }) : undefined}
            checked={perDevice}
            onToggle={() => setRememberPerDevice(!perDevice)}
          />
          {carActive && (
            <SwitchRow
              id="mobile-eq-in-car-label"
              label={t('settings.eqInCar')}
              sub={eqInCar ? undefined : t('settings.eqCarOff')}
              checked={eqInCar}
              onToggle={() => setEqInCar(!eqInCar)}
            />
          )}
        </div>

        <div className="mobile-chip-row mobile-eq__presets" role="group" aria-label={t('settings.eqPreset')}>
          {autoEqName && (
            <button type="button" className="mobile-chip is-active" aria-pressed="true">
              <span>{autoEqName}</span>
            </button>
          )}
          {activePreset === null && (
            <button type="button" className="mobile-chip is-active" aria-pressed="true">
              <span>{t('settings.eqPresetCustom')}</span>
            </button>
          )}
          {presets.map(p => {
            const on = p.name === activePreset;
            return (
              <button
                key={p.name}
                type="button"
                className={`mobile-chip${on ? ' is-active' : ''}`}
                aria-pressed={on}
                disabled={!enabled}
                onClick={() => applyPreset(p.name)}
              >
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>

        <p className="mobile-eq__readout" aria-live="polite">
          {active === null
            ? t('settings.eqDragHint')
            : <><b>{EQ_BANDS[active].label} Hz</b> {formatDb(gains[active])} dB</>}
        </p>

        <div
          ref={areaRef}
          className={`mobile-eq__curve${enabled ? '' : ' is-off'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <canvas ref={canvasRef} className="mobile-eq__canvas" aria-hidden="true" />
          {size.width > 0 && EQ_BANDS.map((band, i) => {
            const { x, y } = curvePoint(band.freq, gains[i], size.width, size.height);
            const isActive = active === i;
            return (
              <div
                key={band.freq}
                role="slider"
                tabIndex={enabled ? 0 : -1}
                aria-label={`${band.label} Hz`}
                aria-valuemin={-MAX_DB}
                aria-valuemax={MAX_DB}
                aria-valuenow={gains[i]}
                aria-valuetext={`${formatDb(gains[i])} dB`}
                aria-disabled={!enabled}
                className={`mobile-eq__point${isActive ? ' is-active' : ''}`}
                style={{ left: x, top: y }}
                onKeyDown={onBandKey(i)}
              />
            );
          })}
          <div className="mobile-eq__freqs" aria-hidden="true">
            {size.width > 0 && EQ_BANDS.map(band => (
              <span key={band.freq} style={{ left: curvePoint(band.freq, 0, size.width, size.height).x }}>{band.label}</span>
            ))}
          </div>
        </div>

        <label className="mobile-eq__pregain">
          <span>{t('settings.eqPreGain')}</span>
          <input
            type="range"
            min={-30}
            max={6}
            step={0.5}
            value={preGain}
            disabled={!enabled}
            onChange={e => setPreGain(parseFloat(e.target.value))}
          />
          <output>{formatDb(preGain)} dB</output>
        </label>
      </div>
    </MobileSheet>
  );
}
