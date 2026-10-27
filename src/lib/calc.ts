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

/**
 * A shape as the one number people quote for it: width over height.
 *
 * This used to reduce to a pair — 16:9, 4:3 — and only fall back to a decimal
 * when the pair came out as something nobody says out loud, like 427:240.
 * Two forms for one idea meant the tidy case and the awkward case could not
 * be compared at a glance, and a wall built from cabinets lands on the
 * awkward side more often than not: ten 176-pixel cabinets by six is 5:3,
 * which is true and tells you nothing about how close to 16:9 it is. The
 * decimal does, it is the form the trade writes anyway — 1.78:1, 2.39:1 —
 * and every shape now gets the same one.
 */
export function aspectRatio(w: number, h: number) {
  if (!w || !h) return '—';
  return `${(w / h).toFixed(2)}:1`;
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
