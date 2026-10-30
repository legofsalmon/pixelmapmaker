/**
 * Where the walls physically stand, and the faces of every cabinet column in
 * three dimensions — what the 3D view draws.
 *
 * Kept free of three.js and the DOM so the geometry can be tested on its own:
 * the viewer turns these quads into meshes and does nothing else with them.
 *
 * Worked in metres. +x is the audience's right (stage left), +y is up from the
 * floor and +z points at the audience, so the front of a wall is the side a
 * camera at +z sees. The wall's plan comes straight from `planForLayer`, which
 * is the same polygon of hinged cabinets the curve controls and the plan view
 * draw, so an arc or a fold here is exactly the one on the spec sheet.
 */
import type { Layer, StagePlacement } from './types';
import { layerRect } from './geometry';
import { planForLayer } from './curve';

export type Vec3 = [number, number, number];

/**
 * A cabinet's depth when the datasheet gives none. Rental panels sit between
 * 70 and 100 mm; the figure only decides how thick the wall draws, never a
 * calculation, so a typical one is better than a wall made of paper.
 */
export const ASSUMED_DEPTH_MM = 85;

export interface ColumnFaces {
  /** Front face, as seen from the audience: bottom-left, bottom-right, top-right, top-left. */
  front: [Vec3, Vec3, Vec3, Vec3];
  /** Back face, as seen from behind: bottom-left, bottom-right, top-right, top-left. */
  back: [Vec3, Vec3, Vec3, Vec3];
  /** The column's share of the pixel map across, 0 at the screen's left edge. */
  u0: number;
  u1: number;
}

export interface WallSolid {
  layerId: string;
  columns: ColumnFaces[];
  depthMm: number;
  /** True when the depth is `ASSUMED_DEPTH_MM` rather than the datasheet's. */
  depthAssumed: boolean;
  bounds: { min: Vec3; max: Vec3 };
}

const mmPerPx = (layer: Layer) => ({
  x: layer.spec.cabinet.width / Math.max(1, layer.spec.resolution.w),
  y: layer.spec.cabinet.height / Math.max(1, layer.spec.resolution.h),
});

/**
 * Stage positions read off the canvas, for screens nobody has placed.
 *
 * The canvas is a pixel map, so this is a guess, and an honest one only when
 * the screens share a pitch: each screen's centre is converted to metres at
 * its own pitch, the whole arrangement is centred on the stage, and whichever
 * screen sits lowest on the canvas stands on the floor with the rest raised by
 * the difference. A centre screen with IMAG either side comes out right; a
 * side wall turned to face in needs placing by hand.
 */
export function canvasPlacements(layers: Layer[]): Map<string, StagePlacement> {
  const placed = new Map<string, StagePlacement>();
  if (!layers.length) return placed;

  const raw = layers.map((layer) => {
    const rect = layerRect(layer);
    const scale = mmPerPx(layer);
    return {
      id: layer.id,
      centreX: ((rect.x + rect.width / 2) * scale.x) / 1000,
      bottom: ((rect.y + rect.height) * scale.y) / 1000,
      left: (rect.x * scale.x) / 1000,
      right: ((rect.x + rect.width) * scale.x) / 1000,
    };
  });

  const middle = (Math.min(...raw.map((r) => r.left)) + Math.max(...raw.map((r) => r.right))) / 2;
  const floor = Math.max(...raw.map((r) => r.bottom));
  for (const r of raw) {
    placed.set(r.id, { x: r.centreX - middle, z: 0, elevation: floor - r.bottom, rotation: 0 });
  }
  return placed;
}

/** A layer's placement: its own when set, otherwise the one read off the canvas. */
export function placementFor(layer: Layer, fromCanvas: Map<string, StagePlacement>): StagePlacement {
  const own = layer.stage;
  if (own && [own.x, own.z, own.elevation, own.rotation].every(Number.isFinite)) return own;
  return fromCanvas.get(layer.id) ?? { x: 0, z: 0, elevation: 0, rotation: 0 };
}

/**
 * Every cabinet column of a wall as a front and a back face in stage space.
 *
 * One column per piece rather than one per cabinet: a column is flat from top
 * to bottom whatever the shape, because walls bend only in plan. That keeps a
 * 200 × 200 wall at 200 pieces instead of 40,000.
 */
export function wallSolid(layer: Layer, placement: StagePlacement): WallSolid {
  const plan = planForLayer(layer);
  const depthAssumed = !(layer.spec.cabinet.depth && layer.spec.cabinet.depth > 0);
  const depthMm = depthAssumed ? ASSUMED_DEPTH_MM : layer.spec.cabinet.depth!;
  const depth = depthMm / 1000;
  const bottom = placement.elevation;
  const top = bottom + (layer.spec.cabinet.height * layer.rows) / 1000;

  // The plan's +y points at the audience, which is +z here.
  const turn = (placement.rotation * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const place = (x: number, z: number): [number, number] => [
    placement.x + x * cos + z * sin,
    placement.z - x * sin + z * cos,
  ];

  const points = plan.points.map((p) => ({ x: p.x / 1000, z: p.y / 1000 }));
  const cols = Math.max(1, points.length - 1);
  const columns: ColumnFaces[] = [];

  for (let i = 0; i < cols; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    // The face's normal toward the audience: the segment turned a quarter to
    // the left, which on a flat wall running +x is +z.
    const nx = -(b.z - a.z) / length;
    const nz = (b.x - a.x) / length;
    const backA = { x: a.x - nx * depth, z: a.z - nz * depth };
    const backB = { x: b.x - nx * depth, z: b.z - nz * depth };

    const [fax, faz] = place(a.x, a.z);
    const [fbx, fbz] = place(b.x, b.z);
    const [bax, baz] = place(backA.x, backA.z);
    const [bbx, bbz] = place(backB.x, backB.z);

    columns.push({
      front: [
        [fax, bottom, faz],
        [fbx, bottom, fbz],
        [fbx, top, fbz],
        [fax, top, faz],
      ],
      // From behind, the front's right-hand edge is on the left.
      back: [
        [bbx, bottom, bbz],
        [bax, bottom, baz],
        [bax, top, baz],
        [bbx, top, bbz],
      ],
      u0: i / cols,
      u1: (i + 1) / cols,
    });
  }

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const column of columns) {
    for (const v of [...column.front, ...column.back]) {
      for (let k = 0; k < 3; k++) {
        if (v[k] < min[k]) min[k] = v[k];
        if (v[k] > max[k]) max[k] = v[k];
      }
    }
  }

  return { layerId: layer.id, columns, depthMm, depthAssumed, bounds: { min, max } };
}

/** The box every wall fits in, with the floor always included. */
export function sceneBounds(solids: WallSolid[]): { min: Vec3; max: Vec3 } {
  if (!solids.length) return { min: [-1, 0, -1], max: [1, 2, 1] };
  const min: Vec3 = [Infinity, 0, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of solids) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], s.bounds.min[k]);
      max[k] = Math.max(max[k], s.bounds.max[k]);
    }
  }
  return { min, max };
}

/**
 * Where a cabinet column lands in the rear drawing.
 *
 * The rear texture is drawn as a technician sees it from behind, so its text
 * reads the right way round: the screen's first column is on the right. A
 * column's back face therefore takes the mirror of its front share.
 */
export const rearColumn = (col: number, cols: number) => cols - 1 - col;
