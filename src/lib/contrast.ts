/**
 * Whether the wall holds a picture in the light it is standing in.
 *
 * Brightness is quoted as a single nit figure and read as though it were a
 * quality score, but on its own it says nothing. What decides whether an image
 * survives is the light bouncing off the screen face, because that lands under
 * the blacks and there is nothing the panel can do about it: a wall cannot emit
 * negative light. 20,000 lux of daylight on a 5% face puts a 318 nit floor
 * under every black pixel, and a 5,000 nit panel is then running 16.7:1 rather
 * than the thousands it is sold with.
 *
 * The physics is one equation and it is textbook rather than contested:
 *
 *     reflected luminance (cd/m²) = ambient illuminance (lux) × reflectance / π
 *     contrast = (peak + reflected) / (black + reflected)
 *
 * The divide by π is the Lambertian conversion from illuminance falling on a
 * diffuse surface to the luminance coming back off it. It is the standard
 * ambient-contrast relation in display metrology, and it is quoted with a
 * worked example on several manufacturers' sites; no vendor page is cited here
 * because the ones found were not readable to check the example against.
 *
 * An LED panel's own black is taken as zero here. It is not quite, but it is
 * far below the reflected floor in any room with light in it, and saying so is
 * honest in a way that inventing an off-state luminance the datasheet does not
 * publish would not be. It errs optimistic: a real panel reads slightly worse
 * than this says, never better.
 *
 * What is deliberately *not* here is a table of required contrast ratios.
 * ANSI/AVIXA V201.01:2021 Image System Contrast Ratio defines four of them, by
 * viewing category, and it covers direct-view LED rather than only projection —
 * but the figures sit behind the standard, and the numbers floating around the
 * trade for them disagree with each other. So the requirement is the user's to
 * set and the physics is ours to compute. See `AmbientSettings.targetContrast`.
 */
import type { CabinetSpec, Layer } from './types';

/** Lambertian conversion from lux falling on a surface to cd/m² coming back. */
export const reflectedNits = (lux: number, reflectance: number) =>
  !(lux > 0) || !(reflectance > 0) ? 0 : (lux * reflectance) / Math.PI;

/**
 * Brightness figures a panel could actually have.
 *
 * The shipped library has carried outdoor panels at 5 and 50 nits, which is a
 * PDF that broke "5000" across two text runs rather than a panel you could
 * stand in front of. Computing a contrast ratio from one of those produces a
 * confident, wrong answer, so a figure outside this band is treated as not
 * published and said so — the same way a missing weight stays missing rather
 * than being summed as zero.
 *
 * The dimmest panel in the library that is real is 600 nits and the brightest
 * is 10,000, so the band is wide enough to be about obvious corruption only.
 */
export const PLAUSIBLE_NITS = { min: 100, max: 15_000 };

export const isPlausibleBrightness = (nits: number | null | undefined): nits is number =>
  nits != null && Number.isFinite(nits) && nits >= PLAUSIBLE_NITS.min && nits <= PLAUSIBLE_NITS.max;

export interface AmbientSettings {
  /** Light falling on the screen face, lux. */
  lux: number;
  /** Fraction of it the face reflects back. Assumed; nobody publishes it. */
  reflectance: number;
  /**
   * Contrast ratio the content needs, which the app does not presume to know.
   * ANSI/AVIXA V201.01:2021 is where a real figure comes from, or the client's
   * own spec. The default below is a starting point, not a standard.
   */
  targetContrast: number;
}

export const DEFAULT_AMBIENT: AmbientSettings = {
  lux: 200,
  reflectance: 0.05,
  targetContrast: 15,
};

/**
 * Light levels to pick from, so nobody has to guess a lux figure.
 *
 * Only the office line comes from a standard — EN 12464-1 puts 500 lux on the
 * task area for ordinary office work. The daylight figures are the long-settled
 * ones (overcast around 1,000 lux, full daylight out of the sun 10,000–25,000,
 * direct sun 32,000–100,000). The venue figures are typical rather than
 * specified, and are the ones to measure rather than trust.
 *
 * Every level is distinct, because the picker matches on the level rather than
 * the label: two presets sharing a lux figure would make one of them
 * unselectable.
 */
export const AMBIENT_PRESETS: Array<{ label: string; lux: number; note: string }> = [
  { label: 'Blackout', lux: 5, note: 'house dark, a show on' },
  { label: 'House lights down', lux: 50, note: 'typical for a gig' },
  { label: 'House lights up', lux: 200, note: 'indoor event, walk-in' },
  { label: 'Office or conference room', lux: 500, note: 'EN 12464-1 task lighting' },
  { label: 'Bright interior', lux: 750, note: 'atrium, shop window, glazed foyer' },
  { label: 'Overcast outdoors', lux: 1_000, note: 'the usual Irish afternoon' },
  { label: 'Daylight, out of the sun', lux: 15_000, note: 'shaded or north-facing' },
  { label: 'Direct sunlight', lux: 50_000, note: 'sun on the screen face' },
];

export interface ContrastResult {
  layerId: string;
  layerName: string;
  /** Published peak brightness, or null when it is missing or implausible. */
  peakNits: number | null;
  /** Set when a figure was published but could not be believed. */
  implausibleNits: number | null;
  /** The floor the room puts under every black pixel, cd/m². */
  floorNits: number;
  /** Contrast actually achieved, or null without a believable brightness. */
  contrast: number | null;
  meetsTarget: boolean | null;
  /** Peak brightness that would hold the target in this light. */
  nitsForTarget: number;
  /**
   * Brightest ambient this panel holds the target in, lux. Null when the
   * brightness is unknown, Infinity when the target is 1:1 or below.
   */
  luxAtTarget: number | null;
  notes: string[];
}

/** Peak brightness needed to reach a contrast ratio over a given floor. */
export const nitsForContrast = (target: number, floor: number) =>
  Math.max(0, (target - 1) * floor);

/** The ambient level at which a panel falls to a contrast ratio. */
export function luxForContrast(target: number, peakNits: number, reflectance: number) {
  if (target <= 1) return Infinity;
  if (!(peakNits > 0) || !(reflectance > 0)) return 0;
  // Invert reflectedNits() at the floor that leaves exactly `target`.
  const floor = peakNits / (target - 1);
  return (floor * Math.PI) / reflectance;
}

export function contrastForLayer(layer: Layer, ambient: AmbientSettings): ContrastResult {
  const spec: CabinetSpec = layer.spec;
  const floorNits = reflectedNits(ambient.lux, ambient.reflectance);
  const published = spec.brightnessNits;
  const believable = isPlausibleBrightness(published);
  const peakNits = believable ? published : null;
  const notes: string[] = [];

  const contrast = peakNits != null && floorNits > 0 ? (peakNits + floorNits) / floorNits : null;
  const nitsForTarget = nitsForContrast(ambient.targetContrast, floorNits);
  const meetsTarget = contrast == null ? null : contrast >= ambient.targetContrast;
  const luxAtTarget =
    peakNits == null ? null : luxForContrast(ambient.targetContrast, peakNits, ambient.reflectance);

  if (published == null) {
    notes.push(
      'This panel publishes no brightness, so there is nothing to work the contrast out from. Enter one on a custom panel, or take it off the current datasheet.'
    );
  } else if (!believable) {
    notes.push(
      `The library has this panel at ${published} nits, which is not a figure a panel has — it is a scraped number that lost its zeros. Treated as not published rather than used. Check the datasheet.`
    );
  }

  if (contrast != null && meetsTarget === false) {
    notes.push(
      `${Math.round(floorNits).toLocaleString('en-GB')} nits of reflected light sits under the blacks here, so ${Math.round(
        peakNits!
      ).toLocaleString('en-GB')} nits only reaches ${contrast.toFixed(
        1
      )}:1. Holding ${ambient.targetContrast}:1 needs ${Math.round(
        nitsForTarget
      ).toLocaleString('en-GB')} nits, or the light off the screen face brought down.`
    );
  }

  if (luxAtTarget != null && Number.isFinite(luxAtTarget) && luxAtTarget < ambient.lux) {
    notes.push(
      `It holds ${ambient.targetContrast}:1 up to about ${Math.round(
        luxAtTarget
      ).toLocaleString('en-GB')} lux. Past that the room is brighter than the panel.`
    );
  }

  return {
    layerId: layer.id,
    layerName: layer.name,
    peakNits,
    implausibleNits: published != null && !believable ? published : null,
    floorNits,
    contrast,
    meetsTarget,
    nitsForTarget,
    luxAtTarget,
    notes,
  };
}

export const contrastForProject = (layers: Layer[], ambient: AmbientSettings) =>
  layers.map((l) => contrastForLayer(l, ambient));
