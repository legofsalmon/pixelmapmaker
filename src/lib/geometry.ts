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

/**
 * Most cabinets a screen may be across or high.
 *
 * Not a hardware limit. It is a guard against one stray drag turning a screen
 * into tens of thousands of cabinets and taking the renderer down with it;
 * 200 each way is already far past any wall anyone will build.
 */
export const MAX_CABINETS = 200;

/** A whole number of cabinets, never none and never more than the ceiling. */
export const clampCabinets = (count: number) =>
  Math.max(1, Math.min(MAX_CABINETS, Math.round(count)));

/** The corner being dragged. The anchor is always the one opposite. */
export type Handle = 'nw' | 'ne' | 'sw' | 'se';

export const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se'];

const isWest = (handle: Handle) => handle.endsWith('w');
const isNorth = (handle: Handle) => handle.startsWith('n');

/** How near a corner the pointer must come, in screen pixels. */
export const HANDLE_GRAB_PX = 11;

/**
 * How big a screen must be on screen before its corners become resize
 * handles, in screen pixels.
 *
 * Below this the four targets cover the whole shape and there is nowhere left
 * to grab to move it, so a screen zoomed out to a speck stays a move target
 * and nothing else.
 */
export const MIN_RESIZABLE_PX = 48;

/**
 * Whether this screen offers resize handles right now.
 *
 * Drawing and hit-testing both ask this, which is the point: a handle that is
 * painted but dead is the same lie as no handle at all, only more annoying.
 */
export function canResize(layer: Layer, scale: number) {
  if (layer.locked) return false;
  const rect = layerRect(layer);
  return rect.width * scale >= MIN_RESIZABLE_PX && rect.height * scale >= MIN_RESIZABLE_PX;
}

/** Where a handle sits, in canvas pixels. */
export function handlePoint(rect: Rect, handle: Handle) {
  return {
    x: isWest(handle) ? rect.x : rect.x + rect.width,
    y: isNorth(handle) ? rect.y : rect.y + rect.height,
  };
}

/** The corner that stays put while `handle` is dragged. */
export const anchorFor = (rect: Rect, handle: Handle) =>
  handlePoint(rect, `${isNorth(handle) ? 's' : 'n'}${isWest(handle) ? 'e' : 'w'}` as Handle);

/**
 * The handle nearest `point`, or null if none is within `tolerance`.
 *
 * Nearest rather than first, because on a screen only a few cabinets wide the
 * targets overlap, and the one whose centre you are closest to is the one you
 * meant.
 */
export function handleAtPoint(rect: Rect, point: { x: number; y: number }, tolerance: number): Handle | null {
  let best: Handle | null = null;
  let bestDistance = tolerance;
  for (const handle of HANDLES) {
    const at = handlePoint(rect, handle);
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (distance <= bestDistance) {
      best = handle;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The size and position a screen takes when `handle` is dragged to `point`,
 * with `anchor` — the opposite corner, fixed at the start of the drag — held
 * still.
 *
 * A wall is built from whole cabinets, so this rounds to the nearest one
 * rather than reporting a fraction: the drag adds and removes cabinets, it
 * does not stretch them. Dragging past the anchor stops at a single cabinet
 * instead of turning the screen inside out, which is the only reading of a
 * negative width that means anything here.
 */
export function resizeFromAnchor(
  layer: Layer,
  handle: Handle,
  anchor: { x: number; y: number },
  point: { x: number; y: number }
) {
  const tile = tileSize(layer);
  const across = isWest(handle) ? anchor.x - point.x : point.x - anchor.x;
  const down = isNorth(handle) ? anchor.y - point.y : point.y - anchor.y;

  const cols = clampCabinets(Math.max(0, across) / tile.w);
  const rows = clampCabinets(Math.max(0, down) / tile.h);

  return {
    cols,
    rows,
    x: Math.round(isWest(handle) ? anchor.x - cols * tile.w : anchor.x),
    y: Math.round(isNorth(handle) ? anchor.y - rows * tile.h : anchor.y),
  };
}

/** Physical size of a layer in millimetres. */
export function layerSizeMm(layer: Layer) {
  return {
    width: layer.spec.cabinet.width * layer.cols,
    height: layer.spec.cabinet.height * layer.rows,
  };
}

/**
 * Cabinets that come closest to a wanted physical size.
 *
 * A wall is built from whole cabinets, so a size in metres is a request, not a
 * measurement: 5 m of 600 mm cabinets is 8 of them and 4.8 m. Nearest rather
 * than floor, because asking for 5 m and being handed 4.4 m would be a strange
 * reading of the request — and never zero, since a screen with no cabinets is
 * not a screen.
 */
export function cabinetsForMetres(metres: number, cabinetMm: number, maxCabinets = 200) {
  if (!Number.isFinite(metres) || !Number.isFinite(cabinetMm) || cabinetMm <= 0) return 1;
  return Math.max(1, Math.min(maxCabinets, Math.round((metres * 1000) / cabinetMm)));
}

/**
 * Physical size of a whole number of cabinets, in metres, rounded off the
 * float noise so the field shows 4.8 rather than 4.800000000000001.
 */
export function metresForCabinets(cabinets: number, cabinetMm: number) {
  return Math.round(cabinets * cabinetMm) / 1000;
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
