/**
 * How the wall reads from where the audience actually stands.
 *
 * Pitch is the first number anyone is asked for and the one that moves the
 * price most, but nothing in the app knew how far away the viewer was, so it
 * could not say whether a pitch was right — or whether it was finer than
 * anyone in the room could resolve, which is the same money spent on nothing.
 *
 * Everything here is geometry over one published constant: a person with 20/20
 * vision resolves detail down to about one arcminute, one sixtieth of a degree.
 * That is the Snellen definition of 20/20 and it is what the trade's viewing
 * distance rules are all derived from. Planar's white paper on direct-view LED
 * states the same thing as a multiplier — pitch in mm × 3438 = the distance in
 * mm at which pixels stop being distinguishable — which is 1 / tan(1 arcmin)
 * rounded, and is the figure `ACUITY_SCALE` below reproduces exactly.
 *
 *   Planar, "Recommended Viewing Distance & Direct View LED"
 *   https://www.planar.com/media/439462/understanding-viewing-distance.pdf
 *
 * The rules of thumb built on top of it are labelled as such, because they
 * disagree with each other by 10–15% and nobody should read them as specified
 * figures. Where a rule is quoted here, the arcminute number it corresponds to
 * is given beside it so it can be checked rather than believed.
 */
import type { Layer } from './types';
import { layerRect, layerSizeMm } from './geometry';

/** One arcminute in radians — a sixtieth of a degree. */
const ARCMINUTE = Math.PI / (180 * 60);

/**
 * Distance per unit of pitch at which a pixel subtends exactly one arcminute.
 * 3437.75, which is the 3438 the trade quotes.
 */
export const ACUITY_SCALE = 1 / Math.tan(ARCMINUTE);

/** Metres in a foot, for the 10× rule, which is quoted in feet. */
const FOOT_M = 0.3048;

/**
 * The finest pitch anyone actually ships. Planar put the fine-pitch band at
 * 0.6 mm to about 2.5 mm, and nothing below it is a product you can hire, so
 * advice to "go finer than 0.3 mm" is arithmetic rather than a suggestion.
 * Below this the only lever left is where the barrier goes.
 */
const FINEST_SHIPPING_PITCH_MM = 0.6;

/**
 * Cinema's guideline for how much of the field of view a picture should fill.
 * SMPTE EG-18 puts the minimum horizontal angle at 30°; THX asks for 36°.
 *
 * Both are guidelines for a seated cinema audience watching a projected
 * picture, not standards for an LED wall at a gig, so they are carried here as
 * a reference line rather than a pass mark: a 25° IMAG screen is not wrong, it
 * is just smaller than a cinema would put in that room.
 */
export const SMPTE_MIN_ANGLE_DEG = 30;
export const THX_MIN_ANGLE_DEG = 36;

export interface AudienceSettings {
  /** Distance from the screen to the nearest viewer, metres. */
  nearestM: number;
  /** Distance to the furthest viewer, metres. */
  furthestM: number;
}

export const DEFAULT_AUDIENCE: AudienceSettings = {
  nearestM: 5,
  furthestM: 30,
};

/**
 * How the pixel structure reads, graded in multiples of the acuity limit.
 *
 * The boundaries are multiples of the one published number rather than
 * borrowed thresholds: at 1 arcminute the pixels are at the limit of 20/20
 * vision, at 2 they are twice it, at 4 they are four times it. The trade's
 * "closest viewer = pitch in mm, in metres" rule lands at 3.4 arcminutes,
 * inside `visible`, which is the cross-check that these bands are in the right
 * place.
 */
export type ViewingGrade = 'beyond-acuity' | 'clean' | 'visible' | 'coarse';

export const VIEWING_GRADES: Record<ViewingGrade, { label: string; meaning: string }> = {
  'beyond-acuity': {
    label: 'Beyond acuity',
    meaning: '20/20 vision cannot separate the pixels from here. Any finer pitch is spent on nothing.',
  },
  clean: {
    label: 'Clean',
    meaning: 'Pixel structure is at the edge of being detectable. Content reads as an image, not a grid.',
  },
  visible: {
    label: 'Structure visible',
    meaning: 'The grid can be seen but the picture holds. Normal for the front of a live audience.',
  },
  coarse: {
    label: 'Coarse',
    meaning: 'Pixels are plainly separate. Build the content for it — big type, no fine detail.',
  },
};

export function gradeFor(arcminutesPerPixel: number): ViewingGrade {
  if (arcminutesPerPixel < 1) return 'beyond-acuity';
  if (arcminutesPerPixel < 2) return 'clean';
  if (arcminutesPerPixel < 4) return 'visible';
  return 'coarse';
}

/** Angle one pixel subtends at a given distance, in arcminutes. */
export function arcminutesPerPixel(pitchMm: number, distanceM: number): number {
  if (!(pitchMm > 0) || !(distanceM > 0)) return Infinity;
  return Math.atan(pitchMm / (distanceM * 1000)) / ARCMINUTE;
}

/**
 * Visual acuity distance, also called retina distance: how far back 20/20
 * vision has to be before it stops distinguishing one pixel from the next.
 */
export function acuityDistanceM(pitchMm: number): number {
  return (pitchMm * ACUITY_SCALE) / 1000;
}

/**
 * The 10× rule — pitch in mm × 10 = distance in feet — which the trade uses as
 * shorthand for the acuity distance. It is about 11% short of it, so it is
 * carried as a cross-check rather than as the answer.
 */
export function tenXRuleDistanceM(pitchMm: number): number {
  return pitchMm * 10 * FOOT_M;
}

/**
 * The other common rule of thumb: the closest anyone should stand, in metres,
 * is the pitch in millimetres. It is not derived from anything — it puts a
 * pixel at 3.4 arcminutes, well inside visible — but it is what gets quoted
 * down a phone, so it is worth showing next to the number it approximates.
 */
export function frontRowRuleM(pitchMm: number): number {
  return pitchMm;
}

/** Smallest feature 20/20 vision separates at this distance, in millimetres. */
export function resolvableDetailMm(distanceM: number): number {
  return distanceM * 1000 * Math.tan(ARCMINUTE);
}

/** Horizontal angle a screen of this width subtends at this distance. */
export function horizontalAngleDeg(widthM: number, distanceM: number): number {
  if (!(widthM > 0) || !(distanceM > 0)) return 0;
  return (2 * Math.atan(widthM / 2 / distanceM) * 180) / Math.PI;
}

export interface Viewpoint {
  distanceM: number;
  arcminutesPerPixel: number;
  grade: ViewingGrade;
  /** Horizontal angle the screen subtends from here, degrees. */
  angleDeg: number;
  /** Horizontal pixels a 20/20 eye can tell apart across the screen from here. */
  resolvablePixels: number;
  /**
   * Share of the screen's own horizontal resolution that reaches the eye,
   * capped at 1 — a viewer standing close enough to resolve more detail than
   * the wall carries is still only seeing all of it.
   */
  resolvedFraction: number;
}

export interface ViewingResult {
  layerId: string;
  layerName: string;
  pitchMm: number;
  widthM: number;
  heightM: number;
  widthPx: number;
  /** Distance at which one pixel subtends one arcminute. */
  acuityDistanceM: number;
  tenXDistanceM: number;
  frontRowRuleM: number;
  near: Viewpoint;
  far: Viewpoint;
  /** Pitch that would just reach acuity at the nearest viewer, millimetres. */
  pitchForNearestMm: number;
  /**
   * True when the panel is finer than the nearest viewer can resolve, i.e. the
   * wall is carrying pixels nobody in the room will ever see.
   */
  finerThanNeeded: boolean;
  notes: string[];
}

function viewpoint(pitchMm: number, widthM: number, widthPx: number, distanceM: number): Viewpoint {
  const arcmin = arcminutesPerPixel(pitchMm, distanceM);
  const detail = resolvableDetailMm(distanceM);
  const resolvable = detail > 0 ? (widthM * 1000) / detail : 0;
  return {
    distanceM,
    arcminutesPerPixel: arcmin,
    grade: gradeFor(arcmin),
    angleDeg: horizontalAngleDeg(widthM, distanceM),
    resolvablePixels: resolvable,
    resolvedFraction: widthPx > 0 ? Math.min(1, resolvable / widthPx) : 0,
  };
}

export function viewingForLayer(layer: Layer, audience: AudienceSettings): ViewingResult {
  const mm = layerSizeMm(layer);
  const widthM = mm.width / 1000;
  const heightM = mm.height / 1000;
  const widthPx = layerRect(layer).width;
  const pitchMm = layer.spec.pixelPitch;

  // Whichever way round they were typed, the nearer one is the front row.
  const nearestM = Math.min(audience.nearestM, audience.furthestM);
  const furthestM = Math.max(audience.nearestM, audience.furthestM);

  const near = viewpoint(pitchMm, widthM, widthPx, nearestM);
  const far = viewpoint(pitchMm, widthM, widthPx, furthestM);
  const pitchForNearestMm = (nearestM * 1000) / ACUITY_SCALE;
  const finerThanNeeded = near.grade === 'beyond-acuity';

  const notes: string[] = [];

  if (finerThanNeeded) {
    notes.push(
      `Nobody at ${nearestM.toFixed(1)} m can separate these pixels. A ${pitchForNearestMm.toFixed(
        1
      )} mm panel would look the same from there, and everything finer is paid for and not seen.`
    );
  } else if (near.grade === 'coarse') {
    const howCoarse = `At ${nearestM.toFixed(1)} m a pixel subtends ${near.arcminutesPerPixel.toFixed(
      1
    )} arcminutes — over four times what 20/20 vision resolves.`;
    notes.push(
      pitchForNearestMm >= FINEST_SHIPPING_PITCH_MM
        ? `${howCoarse} Either move the barrier back to ${acuityDistanceM(pitchMm).toFixed(
            1
          )} m, or go to ${pitchForNearestMm.toFixed(1)} mm or finer.`
        : `${howCoarse} Hiding it would take ${pitchForNearestMm.toFixed(
            1
          )} mm, finer than anything that ships, so the barrier is the only lever: ${acuityDistanceM(
            pitchMm
          ).toFixed(1)} m back and the pixels are gone.`
    );
  }

  // Worth saying only when detail is actually being lost; a viewer close
  // enough to resolve every pixel needs no note about it.
  if (far.resolvedFraction < 0.95) {
    notes.push(
      `From ${furthestM.toFixed(0)} m the eye separates about ${Math.round(
        far.resolvablePixels
      ).toLocaleString('en-GB')} of the ${widthPx.toLocaleString(
        'en-GB'
      )} pixels across, ${Math.round(
        far.resolvedFraction * 100
      )}% of the detail. That is normal: the front row sets the pitch.`
    );
  }

  if (far.angleDeg < SMPTE_MIN_ANGLE_DEG) {
    notes.push(
      `From the back the screen fills ${far.angleDeg.toFixed(
        1
      )}° of view, under the ${SMPTE_MIN_ANGLE_DEG}° minimum SMPTE EG-18 recommends for cinema. That is a guideline for a seated picture, not a rule for a stage, but a screen this size will read as a panel in the room rather than as the thing being watched.`
    );
  }

  if (layer.spec.derivedResolution) {
    notes.push(
      'This panel publishes no resolution — its pitch is taken from the datasheet but the pixel count is derived, so check it before quoting on these numbers.'
    );
  }

  return {
    layerId: layer.id,
    layerName: layer.name,
    pitchMm,
    widthM,
    heightM,
    widthPx,
    acuityDistanceM: acuityDistanceM(pitchMm),
    tenXDistanceM: tenXRuleDistanceM(pitchMm),
    frontRowRuleM: frontRowRuleM(pitchMm),
    near,
    far,
    pitchForNearestMm,
    finerThanNeeded,
    notes,
  };
}

export const viewingForProject = (layers: Layer[], audience: AudienceSettings) =>
  layers.map((l) => viewingForLayer(l, audience));
