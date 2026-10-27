import type { Layer } from './types';
import { layerRect, layerSizeMm } from './geometry';

export interface LayerTotals {
  cabinets: number;
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  megapixels: number;
  areaM2: number;
  weightKg: number | null;
  powerMaxW: number | null;
  powerAvgW: number | null;
  /** Single-phase 230 V and 120 V current at maximum draw. */
  amps230: number | null;
  amps120: number | null;
  /** Heat load at maximum draw. */
  btuPerHour: number | null;
  aspectRatio: string;
}

/** Greatest common divisor, for reducing a pixel count to a pair. */
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Above this on either side, a reduced pair has stopped being a name.
 * 16:9 and 5:3 are things people say; 427:240 is just the fraction again.
 */
const PAIR_LIMIT = 40;

function reducedPair(w: number, h: number) {
  const d = gcd(Math.round(w), Math.round(h));
  const rw = Math.round(w) / d;
  const rh = Math.round(h) / d;
  return rw > PAIR_LIMIT || rh > PAIR_LIMIT ? null : `${rw}:${rh}`;
}

/**
 * A shape, given first as the number you can compare and then as the name it
 * goes by, when it has one.
 *
 * Width over height is the form the trade writes — 1.78:1, 2.39:1 — and it
 * is the half that answers the question actually being asked, which is
 * usually how close to 16:9 something is. The reduced pair is the half people
 * recognise, so it comes along in brackets. It is dropped rather than forced
 * when reducing leads nowhere: a 10 x 6 wall of 176-pixel cabinets is 5:3 and
 * worth saying, 854 x 480 is 427:240 and is not.
 */
export function aspectRatio(w: number, h: number) {
  if (!w || !h) return '—';
  const decimal = `${(w / h).toFixed(2)}:1`;
  const pair = reducedPair(w, h);
  return pair ? `${decimal} (${pair})` : decimal;
}

export function layerTotals(layer: Layer): LayerTotals {
  const rect = layerRect(layer);
  const mm = layerSizeMm(layer);
  const cabinets = layer.cols * layer.rows;
  const areaM2 = (mm.width / 1000) * (mm.height / 1000);
  const { weightKg, power } = layer.spec;
  const powerMaxW = power?.max != null ? power.max * cabinets : null;
  const powerAvgW = power?.avg != null ? power.avg * cabinets : null;

  return {
    cabinets,
    widthMm: mm.width,
    heightMm: mm.height,
    widthPx: rect.width,
    heightPx: rect.height,
    megapixels: (rect.width * rect.height) / 1_000_000,
    areaM2,
    weightKg: weightKg != null ? weightKg * cabinets : null,
    powerMaxW,
    powerAvgW,
    amps230: powerMaxW != null ? powerMaxW / 230 : null,
    amps120: powerMaxW != null ? powerMaxW / 120 : null,
    btuPerHour: powerMaxW != null ? powerMaxW * 3.412 : null,
    aspectRatio: aspectRatio(rect.width, rect.height),
  };
}

/** Sum of every layer, treating unknown values as unknown rather than zero. */
export function projectTotals(layers: Layer[]) {
  const per = layers.map(layerTotals);
  const sum = (pick: (t: LayerTotals) => number | null) => {
    const values = per.map(pick).filter((v): v is number => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const anyUnknown = (pick: (t: LayerTotals) => number | null) => per.some((t) => pick(t) == null);

  return {
    layers: layers.length,
    cabinets: per.reduce((a, t) => a + t.cabinets, 0),
    areaM2: per.reduce((a, t) => a + t.areaM2, 0),
    megapixels: per.reduce((a, t) => a + t.megapixels, 0),
    weightKg: sum((t) => t.weightKg),
    weightIncomplete: anyUnknown((t) => t.weightKg),
    powerMaxW: sum((t) => t.powerMaxW),
    powerAvgW: sum((t) => t.powerAvgW),
    powerIncomplete: anyUnknown((t) => t.powerMaxW),
    btuPerHour: sum((t) => t.btuPerHour),
  };
}

export const mmToFeetInches = (mm: number) => {
  const totalInches = mm / 25.4;
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches - feet * 12;
  return `${feet}' ${inches.toFixed(1)}"`;
};

export const kgToLbs = (kg: number) => kg * 2.2046226218;

/**
 * How many cabinets a processor port can carry, given a pixel budget.
 * Used for the port-count estimate in the spec sheet.
 */
export function portsRequired(totalPixels: number, pixelsPerPort: number) {
  if (!pixelsPerPort) return null;
  return Math.ceil(totalPixels / pixelsPerPort);
}
