import type { CanvasSettings, Layer } from './types';
import {
  HANDLES,
  canResize,
  contentBounds,
  handlePoint,
  layerRect,
  signalIndex,
  signalOrderCached,
  tileSize,
  type Rect,
} from './geometry';
import { contrastInk, shade } from './palettes';
import { drawEffect, type EffectSettings } from './effects';

export interface RenderOptions {
  /** Draw editor-only affordances (selection, handles, guides). */
  chrome?: boolean;
  selectedIds?: string[];
  /** Canvas pixels per screen pixel — used to keep chrome hairline-thin. */
  scale?: number;
  /**
   * The part of the canvas on screen, in canvas pixels. Cabinets outside it
   * are skipped. Omit it to draw the whole wall, which is what the exporters
   * need.
   */
  viewport?: Rect | null;
  /** Chains past what they may carry, per layer, so they draw as warnings. */
  overRuns?: Map<string, { data: number[]; power: number[] }>;
  /** The chain being traced right now, drawn ahead of the settled ones. */
  drawing?: { layerId: string; kind: 'data' | 'power'; run: Array<[number, number]> } | null;
  snapGuides?: { vertical: number[]; horizontal: number[] } | null;
  /** Animated overlay; omit for a still frame. */
  effect?: EffectSettings;
  /** Milliseconds into the animation, so a frame is reproducible. */
  timeMs?: number;
  /**
   * Images are decoded asynchronously, so the caller resolves each layer's
   * logo up front and hands the bitmaps in. A layer with no entry draws none.
   */
  logos?: Map<string, CanvasImageSource>;
  /**
   * Cabinets on one data run, by layer id. The signal overlay breaks into
   * separate chains at this length. Without it the overlay draws one unbroken
   * cable through every cabinet on the screen, which is not how the wall is
   * ever patched — each run starts again at the processor.
   */
  runLengths?: Map<string, number>;
  /**
   * Port label per run, by layer id — "Port 3", or "Processor 2, port 3" once
   * more than one box is in play. Drawn at each run's first cabinet so the
   * overlay says which output it belongs to.
   */
  runLabels?: Map<string, string[]>;
  /** Cabinets on one power circuit, by layer id, and the circuit labels. */
  powerLengths?: Map<string, number>;
  powerLabels?: Map<string, string[]>;
}

/**
 * One colour per data run, so a patch diagram can be traced.
 *
 * Breaking the signal overlay at run boundaries made it correct and useless at
 * the same time: a 16-wide wall on 16-cabinet runs drew nine anonymous
 * parallel lines, and nothing said which port any of them was. Colour plus a
 * port label is what turns separate chains back into a diagram.
 *
 * Eight hues before repeating, from the app's own accent family. Each carries
 * a dark halo when drawn, so it stays legible on a light cabinet colour.
 */
/** The chain being traced right now. Nothing else on the canvas is this. */
export const DRAWING_COLOUR = '#fbbf24';

/** The one ink reserved for a chain carrying more than it may. */
export const OVER_LIMIT_COLOUR = '#f43f5e';

export const RUN_COLOURS = [
  '#38bdf8', '#fbbf24', '#4ade80', '#f87171',
  '#c084fc', '#22d3ee', '#fb923c', '#a3e635',
];

/**
 * Power circuits, drawn in a separate range so the two overlays can be on at
 * once and still be told apart: data reads cool and thin, power warm and
 * thick, the way they are drawn on a rigging plot.
 */
export const POWER_COLOURS = [
  '#f97316', '#facc15', '#ef4444', '#f472b6',
  '#fb923c', '#eab308', '#dc2626', '#e879f9',
];

/**
 * Font size that keeps a label inside a tile at any tile size.
 *
 * No floor. The old one clamped to 6px, which meant a zoomed-out wall paid for
 * thousands of glyphs nobody could read — the caller now drops the text
 * instead of drawing it illegibly small.
 */
function fitFontSize(text: string, tileW: number, tileH: number) {
  const byHeight = tileH * 0.32;
  const byWidth = (tileW * 0.78) / Math.max(1, text.length * 0.6);
  return Math.min(byHeight, byWidth);
}

/**
 * Below this a cabinet number is a smudge, not a number. Drawing it costs the
 * same as drawing a readable one: on a 120x67 wall at fit-to-screen that was
 * 8,040 unreadable glyphs and 274ms a frame, against 27ms for the tiles alone.
 */
const MIN_LEGIBLE_PX = 7;

/**
 * A Union Flag stretched across a whole screen.
 *
 * Drawn on the heraldic 60 x 30 grid and then scaled to the wall per axis, so
 * a square screen gets a squashed flag rather than a correct flag in a letter
 * box. Stretching is the point: the diagonals only meet the corners when every
 * cabinet is where the map says it is, which makes a mis-patch obvious across
 * a room in a way a colour swatch never is.
 */
function drawUnionJack(ctx: CanvasRenderingContext2D, rect: Rect) {
  const BLUE = '#012169';
  const RED = '#C8102E';
  const WHITE = '#FFFFFF';

  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.scale(rect.width / 60, rect.height / 30);
  ctx.beginPath();
  ctx.rect(0, 0, 60, 30);
  ctx.clip();

  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, 60, 30);

  // St Andrew: white saltire, corner to corner.
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(60, 30);
  ctx.moveTo(60, 0); ctx.lineTo(0, 30);
  ctx.stroke();

  /*
   * St Patrick: the red saltire is counterchanged, not centred — it hugs one
   * side of the white in each quarter, which is why the flag has an upside
   * down. Each half is clipped and the diagonal shifted to the correct side.
   */
  ctx.strokeStyle = RED;
  ctx.lineWidth = 2;
  const halfDiagonal = (clipX: number, from: [number, number], to: [number, number], dy: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, 0, 30, 30);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(from[0], from[1] + dy);
    ctx.lineTo(to[0], to[1] + dy);
    ctx.stroke();
    ctx.restore();
  };
  halfDiagonal(0, [0, 0], [60, 30], 2);    // hoist top: red below the white
  halfDiagonal(30, [0, 0], [60, 30], -2);  // fly bottom: red above
  halfDiagonal(30, [60, 0], [0, 30], 2);   // fly top: red below
  halfDiagonal(0, [60, 0], [0, 30], -2);   // hoist bottom: red above

  // St George, fimbriated: the white band first, the red cross on top of it.
  ctx.fillStyle = WHITE;
  ctx.fillRect(25, 0, 10, 30);
  ctx.fillRect(0, 10, 60, 10);
  ctx.fillStyle = RED;
  ctx.fillRect(27, 0, 6, 30);
  ctx.fillRect(0, 12, 60, 6);

  ctx.restore();
}

/**
 * The band of cabinets that `visible` covers, as half-open ranges.
 *
 * A wall can be far larger than the canvas it sits on — 200 cabinets across
 * is 38,400 pixels, ten times a 4K canvas — and the viewport shows a window
 * onto it. Drawing the cabinets outside that window costs exactly as much as
 * drawing the ones inside it and produces nothing, so the loops below run
 * over this instead of over the whole grid.
 *
 * Without a window, every cabinet is in range: that is what the exporters
 * want, since they draw the whole wall at once.
 */
export function visibleTiles(layer: Layer, visible?: Rect | null) {
  if (!visible) return { colFrom: 0, colTo: layer.cols, rowFrom: 0, rowTo: layer.rows };
  const tile = tileSize(layer);
  const rect = layerRect(layer);
  const span = (start: number, end: number, origin: number, size: number, count: number) => ({
    from: Math.max(0, Math.min(count, Math.floor((start - origin) / size))),
    to: Math.max(0, Math.min(count, Math.ceil((end - origin) / size))),
  });
  const across = span(visible.x, visible.x + visible.width, rect.x, tile.w, layer.cols);
  const down = span(visible.y, visible.y + visible.height, rect.y, tile.h, layer.rows);
  return { colFrom: across.from, colTo: across.to, rowFrom: down.from, rowTo: down.to };
}

function drawTiles(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  scale = 1,
  visible?: Rect | null
) {
  const tile = tileSize(layer);
  const rect = layerRect(layer);
  const { colFrom, colTo, rowFrom, rowTo } = visibleTiles(layer, visible);
  if (colFrom >= colTo || rowFrom >= rowTo) return;
  const ink = contrastInk(layer.color);
  const lineColor = shade(layer.color, ink === '#000000' ? -0.35 : 0.4);
  // Grid lines stay visible on huge walls but never swamp a small tile.
  const lineWidth = Math.max(1, Math.min(tile.w, tile.h) * 0.012);
  const checkerColor = shade(layer.color, -layer.checkerAmount);
  const checkered = layer.checkerAmount > 0;

  const numbered = layer.showNumbers;

  /*
   * Everything that is the same for every tile is set once, outside the loop.
   * Canvas state assignment is not free — a colour or a font shorthand is
   * parsed on assignment — and on a big wall the loop runs thousands of times
   * a frame. Measured at 3,600 tiles on a throttled machine, moving the font
   * assignment alone took the pass from 71ms to 48ms.
   */
  if (layer.pattern === 'union-jack') {
    // One picture across the wall, so there are no per-tile fills to make.
    drawUnionJack(ctx, rect);
  } else {
    let lastFill = '';
    const fill = (colour: string) => {
      if (colour !== lastFill) {
        ctx.fillStyle = colour;
        lastFill = colour;
      }
    };

    for (let row = rowFrom; row < rowTo; row++) {
      for (let col = colFrom; col < colTo; col++) {
        const x = rect.x + col * tile.w;
        const y = rect.y + row * tile.h;
        fill(checkered && (col + row) % 2 === 1 ? checkerColor : layer.color);
        ctx.fillRect(x, y, tile.w, tile.h);
      }
    }
  }

  /*
   * One path for every tile border, stroked once, rather than a strokeRect per
   * tile. Same geometry, one draw call instead of thousands.
   */
  const grid = new Path2D();
  for (let row = rowFrom; row < rowTo; row++) {
    for (let col = colFrom; col < colTo; col++) {
      grid.rect(
        rect.x + col * tile.w + lineWidth / 2,
        rect.y + row * tile.h + lineWidth / 2,
        tile.w - lineWidth,
        tile.h - lineWidth
      );
    }
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke(grid);

  if (!numbered) return;

  /*
   * Size the number for the longest label the wall will show, once, rather
   * than per tile. Uniform digits across a wall read better than digits that
   * shrink as the count passes 9 and 99 anyway.
   */
  const widest = String(layer.cols * layer.rows);
  const size = fitFontSize(widest, tile.w, tile.h);
  /*
   * Legibility is a property of the screen, not of the canvas. Tiles are drawn
   * in canvas pixels, so a 10px number on a 3840-wide canvas shown at 14% zoom
   * is 1.4px to the eye. The test is against the on-screen size, which is why
   * the export path — drawn untransformed at scale 1 — keeps its numbers
   * whatever the viewport happened to be zoomed to.
   */
  if (size * scale < MIN_LEGIBLE_PX) return;

  ctx.fillStyle = ink;
  ctx.font = `600 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  /*
   * A patterned wall has no single background colour, so one ink cannot be
   * legible everywhere — white numbers disappear into the white of a flag.
   * Only then is a halo worth the second pass over every tile.
   */
  const halo = layer.pattern ? (ink === '#000000' ? '#ffffff' : '#000000') : null;
  if (halo) {
    ctx.strokeStyle = halo;
    ctx.lineWidth = Math.max(1, size * 0.18);
    ctx.lineJoin = 'round';
  }
  for (let row = rowFrom; row < rowTo; row++) {
    for (let col = colFrom; col < colTo; col++) {
      const label = signalIndex(layer, col, row) + 1;
      const x = rect.x + col * tile.w + tile.w / 2;
      const y = rect.y + row * tile.h + tile.h / 2;
      if (halo) ctx.strokeText(String(label), x, y);
      ctx.fillText(String(label), x, y);
    }
  }
}

/**
 * Draw a wall's runs as chains, one per port or circuit.
 *
 * Data and power differ only in palette and line style, so they share this
 * rather than existing twice. Power is drawn dashed, thicker and nudged off
 * the centre line, so both overlays can be on at once and still be read —
 * which is the whole point of looking at them together.
 */
/** What to draw for one kind of run on one screen. */
export interface RunDrawing {
  /** Cabinets per chain, when the chains are the generated ones. */
  length?: number;
  labels?: string[];
  /**
   * Chains given outright, which is what hand-drawn cabling passes. When
   * present these are drawn as they are, rather than cut from the signal
   * order — a drawn chain goes where it was drawn.
   */
  runs?: Array<Array<[number, number]>>;
  /** Indices of chains past their limit, drawn so they cannot be missed. */
  over?: number[];
  /** The chain being traced right now, drawn ahead of the settled ones. */
  drawing?: Array<[number, number]> | null;
}

/** Does a run come anywhere near the window? */
export function runIntersects(
  run: Array<[number, number]>,
  rect: Rect,
  tile: { w: number; h: number },
  view: Rect
) {
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const [col, row] of run) {
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }
  // The run's own box, grown by a cabinet so a line leaving the window still
  // enters it from the right place.
  const x = rect.x + (minCol - 1) * tile.w;
  const y = rect.y + (minRow - 1) * tile.h;
  const w = (maxCol - minCol + 3) * tile.w;
  const h = (maxRow - minRow + 3) * tile.h;
  return x < view.x + view.width && x + w > view.x && y < view.y + view.height && y + h > view.y;
}

function drawRuns(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  spec: RunDrawing = {},
  style: { colours: string[]; dashed?: boolean; widthMul?: number; nudge?: number } = {
    colours: RUN_COLOURS,
  },
  scale = 1,
  viewport?: Rect | null
) {
  const { length: runLength, labels: runLabels, over = [], drawing } = spec;
  const tile = tileSize(layer);
  const rect = layerRect(layer);

  let runs: Array<Array<[number, number]>>;
  if (spec.runs) {
    runs = spec.runs.filter((run) => run.length > 0);
  } else {
    const order = signalOrderCached(layer);
    if (order.length < 2) return;
    // One chain per port. Absent a plan, the whole screen is one run — which
    // is the old behaviour, and correct for a screen small enough to need one
    // port.
    const perRun = Math.max(1, Math.floor(runLength && runLength > 0 ? runLength : order.length));
    runs = [];
    for (let i = 0; i < order.length; i += perRun) runs.push(order.slice(i, i + perRun));
  }
  if (!runs.length && !drawing?.length) return;

  const centre = ([col, row]: [number, number]) => ({
    x: rect.x + col * tile.w + tile.w / 2,
    y: rect.y + row * tile.h + tile.h / 2 + nudge,
  });

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const width = Math.max(1, Math.min(tile.w, tile.h) * 0.035 * (style.widthMul ?? 1));
  const dot = Math.min(tile.w, tile.h) * 0.15;
  const head = Math.min(tile.w, tile.h) * 0.22;
  // Power sits off the centre line so a cabinet carrying both shows both.
  const nudge = Math.min(tile.w, tile.h) * (style.nudge ?? 0);
  if (style.dashed) ctx.setLineDash([width * 3, width * 2.2]);
  // A single run keeps the old ink, which reads as part of the screen rather
  // than as one arbitrary colour out of eight.
  const single = runs.length < 2;
  const overSet = new Set(over);
  const inkFor = (i: number) =>
    // A chain past its limit is drawn in warning ink whatever colour its
    // place in the rota would have given it. Nothing else on the canvas is
    // this colour, so an over-long chain is the one thing that stands out.
    overSet.has(i)
      ? OVER_LIMIT_COLOUR
      : single && style.colours === RUN_COLOURS
        ? contrastInk(layer.color)
        : style.colours[i % style.colours.length];

  /*
   * A chain outside the window is skipped whole.
   *
   * On a wall far bigger than the canvas most chains are nowhere near the
   * view, and each one costs a polyline through every cabinet on it. The
   * chains that do cross the window are drawn entire — clipping a polyline
   * properly is more work than letting the canvas discard the ends.
   */
  const onScreen = viewport
    ? runs.map((run) => runIntersects(run, rect, tile, viewport))
    : runs.map(() => true);

  runs.forEach((run, runIndex) => {
    if (!onScreen[runIndex]) return;
    const colour = inkFor(runIndex);

    // A dark halo under the line, so a run colour stays readable whatever the
    // cabinet beneath it is set to.
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = width * 2.2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    run.forEach((cell, i) => {
      const p = centre(cell);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // The line is drawn per run, never between runs: the gap between one run's
    // last cabinet and the next run's first is not a cable.
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = width;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    run.forEach((cell, i) => {
      const p = centre(cell);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Every run starts at the processor, so every run gets a start marker.
    const first = centre(run[0]);
    ctx.beginPath();
    ctx.arc(first.x, first.y, dot, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = width;
    ctx.stroke();

    // Arrow head on the run's final hop shows the direction of travel.
    if (run.length > 1) {
      const last = centre(run[run.length - 1]);
      const prev = centre(run[run.length - 2]);
      const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(last.x - head * Math.cos(angle - Math.PI / 6), last.y - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(last.x - head * Math.cos(angle + Math.PI / 6), last.y - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    /*
     * Which output this chain belongs to, at the cabinet it starts from.
     *
     * Only when it can actually be read. Each pill costs a font parse, a
     * `measureText` and a rounded rectangle, and on a 200 x 200 wall there
     * are two and a half thousand of them — a quarter of the frame spent
     * drawing text a pixel high. The test is the on-screen size, as it is
     * for the cabinet numbers, so the exports keep every label whatever the
     * viewport was zoomed to.
     */
    const label = runLabels?.[runIndex];
    if (!label) return;
    // Only in the viewport. The exporters pass no window and draw at scale 1,
    // where every label belongs on the drawing that goes to site however
    // small the cabinets happen to be.
    if (viewport && labelSize(tile, label) * scale < MIN_LEGIBLE_PX) return;
    // Above the start dot, unless that would hang the pill off the top of the
    // screen — a run starting in the top row puts it below instead.
    const above = first.y - dot - tile.h * 0.2;
    const below = first.y + dot + tile.h * 0.2;
    drawRunLabel(ctx, label, first.x, above - tile.h * 0.2 < rect.y ? below : above, tile, colour, rect);
  });

  /*
   * The chain being traced, over the top of the settled ones.
   *
   * Drawn brighter and thicker than anything else, with a ring on the cabinet
   * the next step will come from: while tracing, the only question that
   * matters is where the chain is now, and it has to be findable on a wall
   * covered in other chains.
   */
  if (drawing?.length) {
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = width * 3;
    ctx.beginPath();
    drawing.forEach((cell, i) => {
      const p = centre(cell);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    ctx.strokeStyle = DRAWING_COLOUR;
    ctx.fillStyle = DRAWING_COLOUR;
    ctx.lineWidth = width * 1.6;
    ctx.beginPath();
    drawing.forEach((cell, i) => {
      const p = centre(cell);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    const start = centre(drawing[0]);
    ctx.beginPath();
    ctx.arc(start.x, start.y, dot * 1.2, 0, Math.PI * 2);
    ctx.fill();

    // The live end: a ring, not a blob, so the cabinet under it still reads.
    const head2 = centre(drawing[drawing.length - 1]);
    ctx.lineWidth = width * 1.4;
    ctx.beginPath();
    ctx.arc(head2.x, head2.y, Math.min(tile.w, tile.h) * 0.32, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/** A pill carrying a run's port label, kept inside the tile it belongs to. */
/**
 * How big a port label is drawn, in canvas pixels.
 *
 * Its own function so the legibility test and the drawing cannot disagree
 * about the answer: skipping a label the drawing would have made readable,
 * or drawing one the test thought too small, are both worse than either
 * behaviour on its own.
 */
function labelSize(tile: { w: number; h: number }, text: string) {
  return Math.max(6, Math.min(tile.h * 0.22, (tile.w * 0.62) / Math.max(4, text.length * 0.5)));
}

function drawRunLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tile: { w: number; h: number },
  colour: string,
  bounds: { x: number; y: number; width: number; height: number }
) {
  const fontSize = labelSize(tile, text);
  ctx.save();
  ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const padX = fontSize * 0.45;
  const w = ctx.measureText(text).width + padX * 2;
  const h = fontSize * 1.5;
  const r = h / 2;

  // A label belongs to its screen, so it stays on it — a run starting in a
  // corner would otherwise hang its pill out over the canvas background.
  const cx = Math.min(Math.max(x, bounds.x + w / 2), bounds.x + bounds.width - w / 2);
  const cy = Math.min(Math.max(y, bounds.y + h / 2), bounds.y + bounds.height - h / 2);
  x = cx;
  y = cy;

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = 'rgba(5,7,11,0.88)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
  ctx.fill();
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(0.5, fontSize * 0.08);
  ctx.stroke();

  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Logo centred on the screen, sized against its shorter side. */
/** One turn every this many seconds when spin is on — a drift, not a spin. */
export const LOGO_SECONDS_PER_TURN = 12;

function drawLogo(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  image: CanvasImageSource,
  timeMs = 0
) {
  const rect = layerRect(layer);
  const source = image as { width?: number; height?: number };
  const naturalW = source.width ?? 1;
  const naturalH = source.height ?? 1;
  if (!naturalW || !naturalH) return;

  const width = Math.min(rect.width, rect.height) * layer.logoScale;
  const height = width * (naturalH / naturalW);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  ctx.save();
  ctx.globalAlpha = layer.logoOpacity;
  if (layer.logoSpin) {
    // Rotate about the centre of the screen, so the image stays put and only
    // turns. Driven by the frame's timestamp rather than a counter, so an
    // exported frame at time t is the same picture as the viewport at time t.
    ctx.translate(cx, cy);
    ctx.rotate(((timeMs / 1000) / LOGO_SECONDS_PER_TURN) * Math.PI * 2);
    ctx.translate(-cx, -cy);
  }
  ctx.drawImage(image, cx - width / 2, cy - height / 2, width, height);
  ctx.restore();
}

function drawLayerLabel(ctx: CanvasRenderingContext2D, layer: Layer) {
  if (!layer.label) return;
  const rect = layerRect(layer);
  const size = Math.max(12, Math.min(rect.width, rect.height) * 0.06);
  ctx.save();
  ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(layer.label);
  const padX = size * 0.5;
  const padY = size * 0.3;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(cx - metrics.width / 2 - padX, cy - size / 2 - padY, metrics.width + padX * 2, size + padY * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(layer.label, cx, cy);
  ctx.restore();
}

function drawMask(ctx: CanvasRenderingContext2D, canvas: CanvasSettings, layers: Layer[]) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  // Punch a hole per screen using the even-odd rule.
  for (const layer of layers) {
    if (!layer.visible) continue;
    const r = layerRect(layer);
    ctx.rect(r.x, r.y, r.width, r.height);
  }
  ctx.fill('evenodd');
  ctx.restore();
}

function drawCanvasGuides(ctx: CanvasRenderingContext2D, canvas: CanvasSettings, hairline: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = hairline;
  ctx.setLineDash([hairline * 8, hairline * 8]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
  ctx.restore();
}

function drawSelection(ctx: CanvasRenderingContext2D, layer: Layer, scale: number) {
  const hairline = 1 / scale;
  const rect = layerRect(layer);
  ctx.save();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = hairline * 2;
  ctx.setLineDash([]);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

  /*
   * Handles only where they do something. They read as "drag me to resize" —
   * which is what they now do — so a locked screen, or one too small on screen
   * to spare the room, shows the outline and no corners rather than four
   * targets that ignore the pointer.
   *
   * Positions come from the same helper the hit test uses, so what is painted
   * and what is grabbable cannot drift apart.
   */
  if (canResize(layer, scale)) {
    const size = hairline * 8;
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = hairline;
    for (const handle of HANDLES) {
      const at = handlePoint(rect, handle);
      ctx.fillRect(at.x - size / 2, at.y - size / 2, size, size);
      ctx.strokeRect(at.x - size / 2, at.y - size / 2, size, size);
    }
  }
  ctx.restore();
}

/**
 * Draw the whole project into `ctx` in canvas-pixel coordinates.
 *
 * The viewport applies a pan/zoom transform before calling this; PNG export
 * calls it untransformed, so both paths produce identical geometry.
 */
export function renderProject(
  ctx: CanvasRenderingContext2D,
  canvas: CanvasSettings,
  layers: Layer[],
  options: RenderOptions = {}
) {
  const {
    chrome = false,
    selectedIds = [],
    scale = 1,
    snapGuides = null,
    effect,
    timeMs = 0,
    logos,
    runLengths,
    runLabels,
    powerLengths,
    powerLabels,
    viewport,
    overRuns,
    drawing,
  } = options;
  const hairline = 1 / scale;

  /*
   * A screen reads from whichever plan it is switched to. The drawn chains
   * are passed outright; the generated ones are still described by a length
   * and cut from the signal order, which is what they have always been.
   */
  const tracing = (layer: Layer, kind: 'data' | 'power') =>
    drawing && drawing.layerId === layer.id && drawing.kind === kind ? drawing.run : null;

  const dataDrawing = (layer: Layer): RunDrawing =>
    layer.cablingPlan === 'custom'
      ? {
          runs: layer.customRuns?.data ?? [],
          labels: runLabels?.get(layer.id),
          over: overRuns?.get(layer.id)?.data,
          drawing: tracing(layer, 'data'),
        }
      : { length: runLengths?.get(layer.id), labels: runLabels?.get(layer.id), drawing: tracing(layer, 'data') };

  const powerDrawing = (layer: Layer): RunDrawing =>
    layer.cablingPlan === 'custom'
      ? {
          runs: layer.customRuns?.power ?? [],
          labels: powerLabels?.get(layer.id),
          over: overRuns?.get(layer.id)?.power,
          drawing: tracing(layer, 'power'),
        }
      : { length: powerLengths?.get(layer.id), labels: powerLabels?.get(layer.id), drawing: tracing(layer, 'power') };

  ctx.fillStyle = canvas.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const visible = layers.filter((l) => l.visible);
  for (const layer of visible) {
    drawTiles(ctx, layer, scale, viewport);
    if (layer.showSignalFlow) drawRuns(ctx, layer, dataDrawing(layer), undefined, scale, viewport);
    if (layer.showPowerRuns) {
      drawRuns(
        ctx,
        layer,
        powerDrawing(layer),
        { colours: POWER_COLOURS, dashed: true, widthMul: 1.4, nudge: 0.14 },
        scale,
        viewport
      );
    }
    const logo = logos?.get(layer.id);
    if (logo) drawLogo(ctx, layer, logo, timeMs);
    drawLayerLabel(ctx, layer);
    if (effect && canvas.effectScope === 'per-screen') {
      drawEffect(ctx, layerRect(layer), effect, timeMs);
    }
  }

  if (effect && canvas.effectScope !== 'per-screen') {
    drawEffect(ctx, { x: 0, y: 0, width: canvas.width, height: canvas.height }, effect, timeMs);
  }

  if (canvas.maskOutsideScreens) drawMask(ctx, canvas, visible);
  if (canvas.showCanvasGuides) drawCanvasGuides(ctx, canvas, hairline);

  if (!chrome) return;

  if (snapGuides) {
    ctx.save();
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = hairline;
    ctx.beginPath();
    for (const x of snapGuides.vertical) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (const y of snapGuides.horizontal) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  for (const layer of layers) {
    if (selectedIds.includes(layer.id)) drawSelection(ctx, layer, scale);
  }
}

/** Render one layer, cropped to its own bounds, for a per-screen PNG export. */
export function renderLayerAlone(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  background: string,
  logo?: CanvasImageSource,
  runLength?: number,
  runLabels?: string[],
  powerLength?: number,
  powerLabels?: string[]
) {
  const rect = layerRect(layer);
  ctx.save();
  if (background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, rect.width, rect.height);
  }
  ctx.translate(-rect.x, -rect.y);
  drawTiles(ctx, layer);
  if (layer.showSignalFlow) drawRuns(ctx, layer, { length: runLength, labels: runLabels });
  if (layer.showPowerRuns) {
    drawRuns(ctx, layer, { length: powerLength, labels: powerLabels }, {
      colours: POWER_COLOURS,
      dashed: true,
      widthMul: 1.4,
      nudge: 0.14,
    });
  }
  // A still of one screen has no clock, so a spinning logo exports upright.
  if (logo) drawLogo(ctx, layer, logo, 0);
  drawLayerLabel(ctx, layer);
  ctx.restore();
}

export { contentBounds };
