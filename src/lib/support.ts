/**
 * Support structure for a screen.
 *
 * Ballasted-upright cases are handed to the solver vendored from the
 * tipping-point project; flown screens are a different question and are worked
 * out here from the panel's own hanging limit.
 */
import LedWall, { type LedWallResult } from './vendor/ledwall';
import type { Layer } from './types';
import { layerSizeMm } from './geometry';
import { layerTotals } from './calc';

export type SupportMode = 'truss-baseplates' | 'ground-support' | 'hanging';

export interface SupportSettings {
  mode: SupportMode;
  /** Height of the bottom of the screen above the floor, metres. */
  wallBottom: number;
  /** Upright height, metres. */
  trussHeight: number;
  /** Truss cross-section, metres, and mass per metre. */
  trussDepth: number;
  trussLinearMass: number;
  /** Baseplate reach in front of and behind the upright centre, metres. */
  plateFront: number;
  plateBack: number;
  plateWidth: number;
  plateMass: number;
  /** Ballast already on each plate, kg. */
  ballastMass: number;
  windSpeed: number;
  safetyFactor: number;
  forceCoefficient: number;
  maxSpacing: number;
  maxLoadPerUpright: number;
  /** Hanging mode: rated capacity of one hang point, kg. */
  pointCapacityKg: number;
  /** Hanging mode: how far apart hang points may sit, metres. */
  maxPointSpacing: number;
}

export const DEFAULT_SUPPORT: SupportSettings = {
  mode: 'truss-baseplates',
  wallBottom: 0.5,
  trussHeight: 6,
  trussDepth: 0.3,
  trussLinearMass: 6.5,
  plateFront: 0.6,
  plateBack: 0.6,
  plateWidth: 1.2,
  plateMass: 30,
  ballastMass: 200,
  windSpeed: 15,
  safetyFactor: 1.5,
  forceCoefficient: 1.3,
  maxSpacing: 3,
  maxLoadPerUpright: 500,
  pointCapacityKg: 500,
  maxPointSpacing: 3,
};

export interface HangingResult {
  /** Columns of cabinets the panel's own rating allows to hang together. */
  panelsPerColumn: number;
  columnsExceedingRating: boolean;
  points: number;
  loadPerPointKg: number;
  totalMassKg: number;
  widthM: number;
  heightM: number;
  warnings: string[];
}

export interface SupportResult {
  layerId: string;
  layerName: string;
  mode: SupportMode;
  widthM: number;
  heightM: number;
  massKg: number | null;
  /** Present for the two ballasted modes. */
  ground?: LedWallResult;
  hanging?: HangingResult;
  /** Set when the screen cannot be assessed, e.g. no published panel weight. */
  unavailable?: string;
}

/** Areal mass of the built screen, kg/m² — what the solver needs. */
function arealMass(layer: Layer) {
  const { weightKg, cabinet } = layer.spec;
  if (weightKg == null) return null;
  const areaM2 = (cabinet.width / 1000) * (cabinet.height / 1000);
  return areaM2 > 0 ? weightKg / areaM2 : null;
}

function solveGround(layer: Layer, s: SupportSettings): SupportResult {
  const mm = layerSizeMm(layer);
  const widthM = mm.width / 1000;
  const heightM = mm.height / 1000;
  const areal = arealMass(layer);

  if (areal == null) {
    return {
      layerId: layer.id,
      layerName: layer.name,
      mode: s.mode,
      widthM,
      heightM,
      massKg: null,
      unavailable:
        'This panel publishes no weight, so the overturning check cannot be run. Enter a weight on a custom panel to assess it.',
    };
  }

  const ground = LedWall.solve({
    wallWidth: widthM,
    wallHeight: heightM,
    wallBottom: s.wallBottom,
    wallDepth: (layer.spec.cabinet.depth ?? 100) / 1000,
    wallArealMass: areal,
    trussHeight: Math.max(s.trussHeight, heightM + s.wallBottom),
    trussDepth: s.trussDepth,
    trussLinearMass: s.trussLinearMass,
    plateFront: s.plateFront,
    plateBack: s.plateBack,
    plateWidth: s.plateWidth,
    plateMass: s.plateMass,
    ballastMass: s.ballastMass,
    windSpeed: s.windSpeed,
    safetyFactor: s.safetyFactor,
    forceCoefficient: s.forceCoefficient,
    maxSpacing: s.maxSpacing,
    maxLoadPerUpright: s.maxLoadPerUpright,
  });

  return {
    layerId: layer.id,
    layerName: layer.name,
    mode: s.mode,
    widthM,
    heightM,
    massKg: layerTotals(layer).weightKg,
    ground,
  };
}

function solveHanging(layer: Layer, s: SupportSettings): SupportResult {
  const mm = layerSizeMm(layer);
  const widthM = mm.width / 1000;
  const heightM = mm.height / 1000;
  const totals = layerTotals(layer);
  const warnings: string[] = [];

  // The panel's own rating caps how many can hang from one another.
  const rated = layer.spec.maxHanging ?? null;
  if (rated == null) {
    warnings.push(
      'This panel publishes no maximum hanging count, so the column height is unchecked against it.'
    );
  } else if (layer.rows > rated) {
    warnings.push(
      `The screen is ${layer.rows} panels tall but the manufacturer rates ${rated} hanging. Split it or take the load out at an intermediate level.`
    );
  }

  const byWidth = Math.max(2, Math.ceil(widthM / s.maxPointSpacing) + 1);
  const massKg = totals.weightKg;
  if (massKg == null) {
    return {
      layerId: layer.id,
      layerName: layer.name,
      mode: 'hanging',
      widthM,
      heightM,
      massKg: null,
      unavailable: 'This panel publishes no weight, so hang-point loads cannot be worked out.',
    };
  }

  const byCapacity = Math.ceil(massKg / Math.max(1, s.pointCapacityKg));
  const points = Math.max(byWidth, byCapacity);
  const loadPerPointKg = massKg / points;

  if (byCapacity > byWidth) {
    warnings.push(
      `Point capacity, not spacing, sets the count: ${byCapacity} points at ${s.pointCapacityKg} kg each.`
    );
  }

  return {
    layerId: layer.id,
    layerName: layer.name,
    mode: 'hanging',
    widthM,
    heightM,
    massKg,
    hanging: {
      panelsPerColumn: layer.rows,
      columnsExceedingRating: rated != null && layer.rows > rated,
      points,
      loadPerPointKg,
      totalMassKg: massKg,
      widthM,
      heightM,
      warnings,
    },
  };
}

export function supportForLayer(layer: Layer, settings: SupportSettings): SupportResult {
  return settings.mode === 'hanging' ? solveHanging(layer, settings) : solveGround(layer, settings);
}

export const supportForProject = (layers: Layer[], settings: SupportSettings) =>
  layers.map((l) => supportForLayer(l, settings));

export const TRUSS_PRESETS = LedWall.TRUSS_PRESETS;
export const CF_PRESETS = LedWall.CF_PRESETS;
