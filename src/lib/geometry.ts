import type { Layer } from './types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pixel size of one cabinet within a layer. */
export const tileSize = (layer: Layer) => ({
  w: layer.spec.resolution.w,
  h: layer.spec.resolution.h,
});

/** Bounding box of a layer in canvas pixels. */
export function layerRect(layer: Layer): Rect {
  const tile = tileSize(layer);
  return {
    x: layer.x,
    y: layer.y,
    width: tile.w * layer.cols,
    height: tile.h * layer.rows,
  };
}

/** Physical size of a layer in millimetres. */
export function layerSizeMm(layer: Layer) {
  return {
    width: layer.spec.cabinet.width * layer.cols,
    height: layer.spec.cabinet.height * layer.rows,
  };
}

export const rectContains = (rect: Rect, x: number, y: number) =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/** Union of every visible layer, or null when nothing is visible. */
export function contentBounds(layers: Layer[]): Rect | null {
  const rects = layers.filter((l) => l.visible).map(layerRect);
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

export interface SnapResult {
  x: number;
  y: number;
  guides: { vertical: number[]; horizontal: number[] };
}

/**
 * Snap a dragged layer to canvas edges, canvas centre, other layers' edges and
 * centres, and to its own cabinet grid. `threshold` is in canvas pixels so it
 * has to be scaled by the caller for the current zoom.
 */
export function snapPosition(
  moving: Layer,
  proposed: { x: number; y: number },
  others: Layer[],
  canvas: { width: number; height: number },
  threshold: number,
  snapToTileGrid: boolean
): SnapResult {
  const rect = { ...layerRect(moving), x: proposed.x, y: proposed.y };
  const guides: SnapResult['guides'] = { vertical: [], horizontal: [] };

  const targetsX = [0, canvas.width / 2, canvas.width];
  const targetsY = [0, canvas.height / 2, canvas.height];
  for (const other of others) {
    const r = layerRect(other);
    targetsX.push(r.x, r.x + r.width / 2, r.x + r.width);
    targetsY.push(r.y, r.y + r.height / 2, r.y + r.height);
  }

  let x = proposed.x;
  let y = proposed.y;
  let bestX = threshold;
  let bestY = threshold;

  // Match the layer's own left / centre / right against each candidate line.
  for (const target of targetsX) {
    for (const edge of [rect.x, rect.x + rect.width / 2, rect.x + rect.width]) {
      const delta = target - edge;
      if (Math.abs(delta) < bestX) {
        bestX = Math.abs(delta);
        x = proposed.x + delta;
        guides.vertical = [target];
      }
    }
  }
  for (const target of targetsY) {
    for (const edge of [rect.y, rect.y + rect.height / 2, rect.y + rect.height]) {
      const delta = target - edge;
      if (Math.abs(delta) < bestY) {
        bestY = Math.abs(delta);
        y = proposed.y + delta;
        guides.horizontal = [target];
      }
    }
  }

  if (snapToTileGrid && bestX >= threshold) {
    const tile = tileSize(moving);
    x = Math.round(proposed.x / tile.w) * tile.w;
  }
  if (snapToTileGrid && bestY >= threshold) {
    const tile = tileSize(moving);
    y = Math.round(proposed.y / tile.h) * tile.h;
  }

  return { x: Math.round(x), y: Math.round(y), guides };
}

/**
 * Cabinet order for a signal run, returned as [col, row] pairs in feed order.
 * Mirrors how a processor is normally patched across a wall.
 */
export function signalOrder(layer: Layer): Array<[number, number]> {
  const { cols, rows, signalStart, signalPath } = layer;
  const vertical = signalPath.startsWith('vertical');
  const serpentine = signalPath.endsWith('serpentine');
  const fromRight = signalStart === 'tr' || signalStart === 'br';
  const fromBottom = signalStart === 'bl' || signalStart === 'br';

  const order: Array<[number, number]> = [];
  const major = vertical ? cols : rows;
  const minor = vertical ? rows : cols;

  for (let m = 0; m < major; m++) {
    const reversed = serpentine && m % 2 === 1;
    for (let n = 0; n < minor; n++) {
      const nn = reversed ? minor - 1 - n : n;
      const col = vertical ? m : nn;
      const row = vertical ? nn : m;
      order.push([fromRight ? cols - 1 - col : col, fromBottom ? rows - 1 - row : row]);
    }
  }
  return order;
}
