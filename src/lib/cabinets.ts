import raw from '../../data/cabinets.json';
import type { CabinetSpec } from './types';

interface Library {
  generatedAt: string;
  count: number;
  cabinets: CabinetSpec[];
}

const library = raw as unknown as Library;

export const CABINETS: CabinetSpec[] = library.cabinets;
export const LIBRARY_GENERATED_AT = library.generatedAt;

export const BRANDS = [...new Set(CABINETS.map((c) => c.brand))].sort();
export const CATEGORIES = [...new Set(CABINETS.map((c) => c.category))].sort();

export interface CabinetFilter {
  query: string;
  brand: string | null;
  category: string | null;
  environment: 'indoor' | 'outdoor' | null;
  minPitch: number | null;
  maxPitch: number | null;
}

export const EMPTY_FILTER: CabinetFilter = {
  query: '',
  brand: null,
  category: null,
  environment: null,
  minPitch: null,
  maxPitch: null,
};

export function filterCabinets(cabinets: CabinetSpec[], filter: CabinetFilter) {
  const terms = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return cabinets.filter((c) => {
    if (filter.brand && c.brand !== filter.brand) return false;
    if (filter.category && c.category !== filter.category) return false;
    if (filter.environment && c.environment !== filter.environment) return false;
    if (filter.minPitch != null && c.pixelPitch < filter.minPitch) return false;
    if (filter.maxPitch != null && c.pixelPitch > filter.maxPitch) return false;
    if (!terms.length) return true;
    const haystack = `${c.brand} ${c.series} ${c.model} ${c.pixelPitch}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

/** Build a spec for a panel the user entered by hand. */
export function customCabinet(input: {
  model: string;
  pixelPitch: number;
  width: number;
  height: number;
  resW: number;
  resH: number;
  weightKg: number | null;
  powerMaxW: number | null;
  maxCurveAngle: number | null;
}): CabinetSpec {
  const areaM2 = (input.width / 1000) * (input.height / 1000);
  return {
    id: `custom-${Date.now().toString(36)}`,
    brand: 'Custom',
    series: 'User panel',
    model: input.model || 'Custom panel',
    pixelPitch: input.pixelPitch,
    cabinet: { width: input.width, height: input.height, depth: null },
    resolution: { w: input.resW, h: input.resH },
    weightKg: input.weightKg,
    power: input.powerMaxW != null ? { max: input.powerMaxW, avg: Math.round(input.powerMaxW / 2) } : null,
    brightnessNits: null,
    refreshHz: null,
    ipRating: null,
    maxCurveAngle: input.maxCurveAngle,
    environment: 'indoor',
    category: 'rental',
    sourceUrl: '',
    aspect: Number((input.width / input.height).toFixed(4)),
    areaM2: Number(areaM2.toFixed(4)),
    pixelsPerCabinet: input.resW * input.resH,
    weightPerM2: input.weightKg ? Number((input.weightKg / areaM2).toFixed(1)) : null,
    powerPerM2: input.powerMaxW ? Number((input.powerMaxW / areaM2).toFixed(0)) : null,
    custom: true,
  };
}

/** Pitch implied by a custom panel's size and resolution, for validation. */
export const impliedPitch = (mm: number, px: number) => (px > 0 ? mm / px : 0);
