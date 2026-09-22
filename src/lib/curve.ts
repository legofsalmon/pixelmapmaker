/**
 * Curved and angled walls, in plan.
 *
 * The thing to hold on to is that a curve changes nothing about the pixel map.
 * A wall built on a radius still unrolls a flat rectangle of pixels — the
 * cabinets are flat, the content is flat, and any warping is done downstream in
 * the media server. So none of this touches `layerRect`, the renderer, the
 * signal order, the cabinet count or the exported PNG. What a curve changes is
 * where the wall physically stands: how much floor it takes, how far it reaches
 * toward the audience, and what the wind sees.
 *
 * Everything here is worked in millimetres, looking down on the wall, with +y
 * pointing at the audience. A positive bend is concave — the ends come toward
 * the audience and the middle sits back, which is how a wrap-around wall is
 * nearly always set. A negative bend is convex.
 *
 * The wall is a polygon of flat cabinets hinged at their joints, not a true
 * arc, because that is what gets built: a 500 mm cabinet on curve-locks is a
 * 500 mm chord, never a 500 mm piece of a circle.
 */
import type { CabinetSpec, Layer, WallShape } from './types';

export const FLAT_SHAPE: WallShape = { kind: 'flat', anglePerJoint: 0, folds: [] };

/**
 * Bend allowed at one joint. A right-angle return is the sharpest corner
 * anybody builds, and the sharpest one the flat-cabinet model still describes
 * honestly — past 90° the cabinets would have to pass through each other.
 */
export const MAX_JOINT_ANGLE = 90;

export interface PlanPoint {
  x: number;
  y: number;
}

export interface WallPlan {
  /**
   * The wall's footprint, one point per cabinet joint plus both ends, in
   * millimetres. Rotated so the two ends sit on the x axis and centred on the
   * midpoint between them, so it can be drawn without further arithmetic.
   */
  points: PlanPoint[];
  /** Bend at each joint, degrees. One shorter than the column count. */
  jointAngles: number[];
  /** Screen width measured along the wall — cols × cabinet width, curve or no. */
  developedWidthMm: number;
  /** Straight-line distance between the two ends. */
  spanMm: number;
  /** Floor the wall stands on, measured square to the line between its ends. */
  footprintMm: { width: number; depth: number };
  /** Turn from the first cabinet's face to the last, degrees. */
  includedAngleDeg: number;
  /** Radius the wall is set to, when every joint carries the same bend. */
  radiusMm: number | null;
  /** Largest bend at any one joint — the figure a panel is rated against. */
  maxJointAngleDeg: number;
  /** True when nothing is bent, so callers can take the cheap path. */
  flat: boolean;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

const clampAngle = (deg: number) =>
  Number.isFinite(deg) ? Math.max(-MAX_JOINT_ANGLE, Math.min(MAX_JOINT_ANGLE, deg)) : 0;

/** Fill in a shape that a project saved before shapes existed, or a partial one. */
export function normaliseShape(shape: WallShape | undefined | null): WallShape {
  if (!shape) return FLAT_SHAPE;
  return {
    kind: shape.kind === 'arc' || shape.kind === 'fold' ? shape.kind : 'flat',
    anglePerJoint: clampAngle(shape.anglePerJoint ?? 0),
    folds: Array.isArray(shape.folds)
      ? shape.folds
          .filter((f) => f && Number.isFinite(f.joint) && Number.isFinite(f.angle))
          .map((f) => ({ joint: Math.max(0, Math.round(f.joint)), angle: clampAngle(f.angle) }))
      : [],
  };
}

/**
 * Bend at each of a wall's joints, in column order.
 *
 * A wall of `cols` cabinets has `cols - 1` joints, so a single column is always
 * flat however the shape is set — there is nothing to hinge.
 */
export function jointAngles(cols: number, shape: WallShape | undefined): number[] {
  const joints = Math.max(0, Math.floor(cols) - 1);
  const s = normaliseShape(shape);
  if (s.kind === 'flat' || joints === 0) return new Array(joints).fill(0);

  if (s.kind === 'arc') return new Array(joints).fill(s.anglePerJoint);

  const angles = new Array(joints).fill(0);
  for (const fold of s.folds) {
    // A fold past the last joint is a fold on a wall that has since been made
    // narrower. Dropping it silently is right — it comes back if the wall grows.
    if (fold.joint < joints) angles[fold.joint] += fold.angle;
  }
  return angles.map(clampAngle);
}

/**
 * Radius a wall sits on, given the bend at each joint, measured from the centre
 * of the curve to the cabinet faces.
 *
 * This is the radius a rigger marks on the floor, which is why it is taken to
 * the face rather than to the joints: the joints sit slightly proud of it.
 */
export function radiusForAngle(angleDeg: number, cabinetWidthMm: number): number | null {
  const angle = Math.abs(angleDeg);
  if (!angle || !Number.isFinite(cabinetWidthMm) || cabinetWidthMm <= 0) return null;
  return cabinetWidthMm / 2 / Math.tan(toRad(angle) / 2);
}

/** The inverse: the bend per joint that puts a wall on a wanted radius. */
export function angleForRadius(radiusMm: number, cabinetWidthMm: number): number {
  if (!Number.isFinite(radiusMm) || radiusMm <= 0 || cabinetWidthMm <= 0) return 0;
  return clampAngle(toDeg(2 * Math.atan(cabinetWidthMm / 2 / radiusMm)));
}

/** Rotate a point about the origin. */
const rotate = (p: PlanPoint, rad: number): PlanPoint => ({
  x: p.x * Math.cos(rad) - p.y * Math.sin(rad),
  y: p.x * Math.sin(rad) + p.y * Math.cos(rad),
});

/**
 * Walk the wall column by column and report what it occupies.
 *
 * Each cabinet is a straight segment of `cabinetWidthMm`; the heading turns by
 * the joint angle between one and the next. The finished outline is rotated so
 * the two ends lie on the x axis and centred between them, which makes the
 * depth a single number rather than something the caller has to derive.
 */
export function wallPlan(
  cols: number,
  cabinetWidthMm: number,
  shape: WallShape | undefined
): WallPlan {
  const columns = Math.max(1, Math.floor(cols));
  const width = Math.max(0, cabinetWidthMm);
  const angles = jointAngles(columns, shape);
  const developedWidthMm = columns * width;

  let heading = 0;
  const raw: PlanPoint[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < columns; i++) {
    const last = raw[raw.length - 1];
    raw.push({ x: last.x + width * Math.cos(heading), y: last.y + width * Math.sin(heading) });
    if (i < angles.length) heading += toRad(angles[i]);
  }

  const first = raw[0];
  const last = raw[raw.length - 1];
  const chord = Math.hypot(last.x - first.x, last.y - first.y);

  /*
   * A wall bent far enough to bring its ends back together has no chord to
   * square up against, and rotating by a meaningless angle would only make the
   * drawing jump about. Leave those in the frame they were built in.
   */
  const turn = chord > 1 ? -Math.atan2(last.y - first.y, last.x - first.x) : 0;
  const placed = raw.map((p) => rotate(p, turn));
  const midX = (placed[0].x + placed[placed.length - 1].x) / 2;
  const midY = (placed[0].y + placed[placed.length - 1].y) / 2;
  const points = placed.map((p) => ({ x: p.x - midX, y: p.y - midY }));

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const includedAngleDeg = angles.reduce((a, b) => a + b, 0);
  const maxJointAngleDeg = angles.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  const uniform = angles.length > 0 && angles.every((a) => a === angles[0]);

  return {
    points,
    jointAngles: angles,
    developedWidthMm,
    spanMm: chord,
    footprintMm: {
      width: Math.max(...xs) - Math.min(...xs),
      depth: Math.max(...ys) - Math.min(...ys),
    },
    includedAngleDeg,
    radiusMm: uniform ? radiusForAngle(angles[0], width) : null,
    maxJointAngleDeg,
    flat: maxJointAngleDeg === 0,
  };
}

export const planForLayer = (layer: Layer): WallPlan =>
  wallPlan(layer.cols, layer.spec.cabinet.width, layer.shape);

/**
 * What is worth saying out loud about a shape before someone builds it.
 *
 * The first of these is the one that matters and the one the library cannot
 * answer: panels bend only as far as their curve-locks allow, and not one
 * manufacturer in the scraped library publishes that figure. So the check is
 * advisory by design — it says the angle is unchecked rather than pretending a
 * missing number is a pass, and it goes quiet once a panel carries a rating.
 */
export function curveWarnings(
  plan: WallPlan,
  spec: Pick<CabinetSpec, 'maxCurveAngle'>
): string[] {
  const warnings: string[] = [];
  if (plan.flat) return warnings;

  const rated = spec.maxCurveAngle ?? null;
  if (rated == null) {
    warnings.push(
      `This panel publishes no maximum bend, so ${plan.maxJointAngleDeg.toFixed(1)}° per joint is unchecked. Confirm the curve-lock range against the datasheet.`
    );
  } else if (plan.maxJointAngleDeg > rated + 1e-9) {
    warnings.push(
      `The wall bends ${plan.maxJointAngleDeg.toFixed(1)}° at a joint but the panel is rated to ${rated}°. Open the curve out or use fewer, larger steps.`
    );
  }

  if (Math.abs(plan.includedAngleDeg) >= 360) {
    warnings.push('The wall turns through more than a full circle and closes on itself. The footprint below is drawn, but it is not a wall anyone can stand in front of.');
  } else if (Math.abs(plan.includedAngleDeg) > 180) {
    warnings.push(
      `The wall wraps ${Math.abs(plan.includedAngleDeg).toFixed(0)}°, so the ends face back past each other. Check sightlines before committing to it.`
    );
  }

  return warnings;
}
