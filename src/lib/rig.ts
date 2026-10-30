/**
 * What holds the walls up, and where the audience stands, in stage space —
 * the second half of the 3D view.
 *
 * Nothing here works anything out about strength. The upright count and
 * spacing, the ballast and the hang points all come from `supportForLayer`,
 * the same solver the Support structure report runs, so the picture and the
 * report cannot disagree. This only says where those parts go.
 *
 * That solver is flat-wall only (the report says so for shaped screens), so a
 * curved wall's uprights are its flat answer laid along the curve: the same
 * count at the same spacing measured along the wall, each one square to the
 * cabinet it stands behind. It is a picture of the flat assessment, and the
 * view says so beside it.
 */
import type { AudienceSettings } from './viewing';
import type { SupportResult, SupportSettings } from './support';
import type { WallSolid } from './stage';

export interface Upright {
  /** Centre of the upright on the floor. */
  x: number;
  z: number;
  /** Turn in plan, radians, so the truss and plate line up with the wall. */
  angle: number;
  height: number;
  /** Baseplate centre, which sits off the upright toward whichever end is longer. */
  plateX: number;
  plateZ: number;
  /** Ballast on this plate, kg. */
  ballastKg: number;
}

export interface HangPoint {
  x: number;
  z: number;
  /** Where the chain meets the top of the wall. */
  wallTop: number;
  angle: number;
  loadKg: number;
}

export interface WallRig {
  layerId: string;
  uprights: Upright[];
  hangPoints: HangPoint[];
  /** Height the flying beam is drawn at, when flown. */
  beamHeight: number | null;
  /** Why nothing is drawn, when nothing can be. */
  unavailable?: string;
}

/**
 * A point a given distance along the wall's face, measured from its left edge
 * as the audience sees it, with the face's outward normal there.
 */
export function alongWall(solid: WallSolid, distance: number) {
  const columns = solid.columns;
  let left = distance;
  for (let i = 0; i < columns.length; i++) {
    const [a, b] = columns[i].front;
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (left <= length + 1e-9 || i === columns.length - 1) {
      const t = length > 0 ? Math.min(1, Math.max(0, left / length)) : 0;
      const dx = (b[0] - a[0]) / (length || 1);
      const dz = (b[2] - a[2]) / (length || 1);
      return {
        x: a[0] + (b[0] - a[0]) * t,
        z: a[2] + (b[2] - a[2]) * t,
        // Toward the audience: the run direction turned a quarter left.
        nx: -dz,
        nz: dx,
        angle: Math.atan2(-dz, dx),
      };
    }
    left -= length;
  }
  return { x: 0, z: 0, nx: 0, nz: 1, angle: 0 };
}

const developedWidth = (solid: WallSolid) =>
  solid.columns.reduce((sum, c) => sum + Math.hypot(c.front[1][0] - c.front[0][0], c.front[1][2] - c.front[0][2]), 0);

export function rigForWall(solid: WallSolid, result: SupportResult, settings: SupportSettings): WallRig {
  const rig: WallRig = { layerId: solid.layerId, uprights: [], hangPoints: [], beamHeight: null };
  if (result.unavailable) return { ...rig, unavailable: result.unavailable };

  const width = developedWidth(solid);
  const depth = solid.depthMm / 1000;
  const top = solid.bounds.max[1];

  if (result.ground) {
    const n = Math.max(1, Math.round(result.ground.uprights));
    const truss = settings.trussDepth;
    // The solver's layout: the end uprights' outer faces flush with the wall's
    // ends, the rest evenly between.
    const inset = Math.min(truss / 2, width / 2);
    const spacing = n > 1 ? (width - 2 * inset) / (n - 1) : 0;
    const height = Math.max(settings.trussHeight, top);
    const plateShift = (settings.plateFront - settings.plateBack) / 2;
    for (let i = 0; i < n; i++) {
      const d = n > 1 ? inset + i * spacing : width / 2;
      const p = alongWall(solid, d);
      // Behind the cabinet, with the back of the wall against the truss's face.
      const back = depth + truss / 2;
      const x = p.x - p.nx * back;
      const z = p.z - p.nz * back;
      rig.uprights.push({
        x,
        z,
        angle: p.angle,
        height,
        plateX: x + p.nx * plateShift,
        plateZ: z + p.nz * plateShift,
        // What the report says each plate needs, which is the number to load.
        ballastKg: result.ground.ballastNeededPerUpright,
      });
    }
  }

  if (result.hanging) {
    const n = Math.max(1, result.hanging.points);
    const inset = Math.min(0.25, width / 4);
    for (let i = 0; i < n; i++) {
      const d = n > 1 ? inset + (i * (width - 2 * inset)) / (n - 1) : width / 2;
      const p = alongWall(solid, d);
      rig.hangPoints.push({
        x: p.x - (p.nx * depth) / 2,
        z: p.z - (p.nz * depth) / 2,
        wallTop: top,
        angle: p.angle,
        loadKg: result.hanging.loadPerPointKg,
      });
    }
    rig.beamHeight = top + 1;
  }

  return rig;
}

export interface AudienceZone {
  /** Line the distances are measured from: the front of the rig. */
  frontZ: number;
  nearestZ: number;
  furthestZ: number;
  /** Across the stage, wide enough to read as a room rather than a strip. */
  minX: number;
  maxX: number;
  /** Where the camera goes for the front-row and back-row views. */
  nearestEye: [number, number, number];
  furthestEye: [number, number, number];
}

/** Eye height of a standing adult — the usual figure for sightlines. */
export const EYE_HEIGHT_M = 1.6;

/**
 * The audience as the Viewing section describes it: everyone between the
 * nearest and the furthest distance, measured straight out from the rig.
 */
export function audienceZone(
  bounds: { min: [number, number, number]; max: [number, number, number] },
  audience: AudienceSettings
): AudienceZone {
  const frontZ = bounds.max[2];
  const nearest = Math.max(0, Math.min(audience.nearestM, audience.furthestM));
  const furthest = Math.max(audience.nearestM, audience.furthestM);
  const centreX = (bounds.min[0] + bounds.max[0]) / 2;
  const half = Math.max((bounds.max[0] - bounds.min[0]) / 2, furthest * 0.4, 3);
  return {
    frontZ,
    nearestZ: frontZ + nearest,
    furthestZ: frontZ + furthest,
    minX: centreX - half,
    maxX: centreX + half,
    nearestEye: [centreX, EYE_HEIGHT_M, frontZ + nearest],
    furthestEye: [centreX, EYE_HEIGHT_M, frontZ + furthest],
  };
}
