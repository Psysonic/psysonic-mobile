import { EQ_BANDS } from '@/store/eqStore';
import { EQ_CURVE_GEOMETRY as G } from '@/features/playback';

/** Where band `freq` at `db` sits on a curve of `width` × `height`, as `drawCurve` places it. */
export function curvePoint(freq: number, db: number, width: number, height: number): { x: number; y: number } {
  const innerW = width - G.padL - G.padR;
  const innerH = height - G.padT - G.padB;
  return {
    x: G.padL + (Math.log10(freq / G.fMin) / Math.log10(G.fMax / G.fMin)) * innerW,
    y: G.padT + ((G.dbMax - db) / (G.dbMax - G.dbMin)) * innerH,
  };
}

/** Index of the band nearest to `x` on a curve `width` wide. */
export function nearestBand(x: number, width: number): number {
  let best = 0;
  let bestDist = Infinity;
  EQ_BANDS.forEach((band, i) => {
    const dist = Math.abs(curvePoint(band.freq, 0, width, 1).x - x);
    if (dist < bestDist) { best = i; bestDist = dist; }
  });
  return best;
}
