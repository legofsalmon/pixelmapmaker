import type { CanvasSettings, Layer } from './types';
import { contentBounds, layerRect, signalOrder, tileSize, type Rect } from './geometry';
import { contrastInk, shade } from './palettes';
import { drawEffect, type EffectSettings } from './effects';

export interface RenderOptions {
  /** Draw editor-only affordances (selection, handles, guides). */
  chrome?: boolean;
  selectedIds?: string[];
  /** Canvas pixels per screen pixel — used to keep chrome hairline-thin. */
  scale?: number;
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

function drawTiles(ctx: CanvasRenderingContext2D, layer: Layer, scale = 1) {
  const tile = tileSize(layer);
  const rect = layerRect(layer);
  const ink = contrastInk(layer.color);
  const lineColor = shade(layer.color, ink === '#000000' ? -0.35 : 0.4);
  // Grid lines stay visible on huge walls but never swamp a small tile.
  const lineWidth = Math.max(1, Math.min(tile.w, tile.h) * 0.012);
  const checkerColor = shade(layer.color, -layer.checkerAmount);
  const checkered = layer.checkerAmount > 0;

  const numbers = layer.showNumbers ? new Map<string, number>() : null;
  if (numbers) {
    signalOrder(layer).forEach(([col, row], i) => numbers.set(`${col},${row}`, i + 1));
  }

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

    for (let row = 0; row < layer.rows; row++) {
      for (let col = 0; col < layer.cols; col++) {
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
  for (let row = 0; row < layer.rows; row++) {
    for (let col = 0; col < layer.cols; col++) {
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

  if (!numbers) return;

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
  for (let row = 0; row < layer.rows; row++) {
    for (let col = 0; col < layer.cols; col++) {
      const label = numbers.get(`${col},${row}`);
      if (label === undefined) continue;
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
function drawRuns(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  runLength?: number,
  runLabels?: string[],
  style: { colours: string[]; dashed?: boolean; widthMul?: number; nudge?: number } = {
    colours: RUN_COLOURS,
  }
) {
  const tile = tileSize(layer);
  const rect = layerRect(layer);
  const order = signalOrder(layer);
  if (order.length < 2) return;

  // One chain per port. Absent a plan, the whole screen is one run — which is
  // the old behaviour, and correct for a screen small enough to need one port.
  const perRun = Math.max(1, Math.floor(runLength && runLength > 0 ? runLength : order.length));
  const runs: Array<Array<[number, number]>> = [];
  for (let i = 0; i < order.length; i += perRun) runs.push(order.slice(i, i + perRun));

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
  const inkFor = (i: number) =>
    single && style.colours === RUN_COLOURS
      ? contrastInk(layer.color)
      : style.colours[i % style.colours.length];

  runs.forEach((run, runIndex) => {
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

    // Which output this chain belongs to, at the cabinet it starts from.
    const label = runLabels?.[runIndex];
    if (!label) return;
    // Above the start dot, unless that would hang the pill off the top of the
    // screen — a run starting in the top row puts it below instead.
    const above = first.y - dot - tile.h * 0.2;
    const below = first.y + dot + tile.h * 0.2;
    drawRunLabel(ctx, label, first.x, above - tile.h * 0.2 < rect.y ? below : above, tile, colour, rect);
  });
  ctx.restore();
}

/** A pill carrying a run's port label, kept inside the tile it belongs to. */
function drawRunLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tile: { w: number; h: number },
  colour: string,
  bounds: { x: number; y: number; width: number; height: number }
) {
  const fontSize = Math.max(6, Math.min(tile.h * 0.22, tile.w * 0.62 / Math.max(4, text.length * 0.5)));
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
const LOGO_SECONDS_PER_TURN = 12;

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

function drawSelection(ctx: CanvasRenderingContext2D, layer: Layer, hairline: number) {
  const rect = layerRect(layer);
  ctx.save();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = hairline * 2;
  ctx.setLineDash([]);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

  // Corner handles, sized in screen pixels so they stay grabbable at any zoom.
  const handle = hairline * 7;
  ctx.fillStyle = '#38bdf8';
  for (const [hx, hy] of [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ]) {
    ctx.fillRect(hx - handle / 2, hy - handle / 2, handle, handle);
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
  } = options;
  const hairline = 1 / scale;

  ctx.fillStyle = canvas.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const visible = layers.filter((l) => l.visible);
  for (const layer of visible) {
    drawTiles(ctx, layer, scale);
    if (layer.showSignalFlow) drawRuns(ctx, layer, runLengths?.get(layer.id), runLabels?.get(layer.id));
    if (layer.showPowerRuns) {
      drawRuns(ctx, layer, powerLengths?.get(layer.id), powerLabels?.get(layer.id), {
        colours: POWER_COLOURS,
        dashed: true,
        widthMul: 1.4,
        nudge: 0.14,
      });
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
    if (selectedIds.includes(layer.id)) drawSelection(ctx, layer, hairline);
  }
}

/** Render one layer, cropped to its own bounds, for a per-screen PNG export. */
export function renderLayerAlone(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  background: string,
  logo?: CanvasImageSource,
  runLength?: number,
  runLabels?: string[]
) {
  const rect = layerRect(layer);
  ctx.save();
  if (background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, rect.width, rect.height);
  }
  ctx.translate(-rect.x, -rect.y);
  drawTiles(ctx, layer);
  if (layer.showSignalFlow) drawRuns(ctx, layer, runLength, runLabels);
  // A still of one screen has no clock, so a spinning logo exports upright.
  if (logo) drawLogo(ctx, layer, logo, 0);
  drawLayerLabel(ctx, layer);
  ctx.restore();
}

export { contentBounds };
