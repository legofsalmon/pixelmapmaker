/**
 * The back of a wall: what a technician sees walking round behind it.
 *
 * The rear is where the cabling lives, so this is the patch diagram drawn on
 * the cabinets it patches — every data chain and power circuit, where it comes
 * in, which way it runs and which port or breaker it belongs to.
 *
 * It is drawn as seen from behind, not as the front mirrored. From behind, the
 * screen's first column is on the right, and that is the drawing a tech has
 * to match with a cable in their hand; mirrored text on top of it would only
 * be one more thing to decode. So every position is flipped and every label
 * is written the right way round.
 *
 * The runs come from the same plan as the canvas overlay, the pick list and
 * the exported PNG — generated or drawn by hand — so the four cannot disagree
 * about which cabinet is on which port.
 */
import type { Layer } from './types';
import { signalIndex, signalOrder } from './geometry';
import { OVER_LIMIT_COLOUR, POWER_COLOURS, RUN_COLOURS } from './render';
import type { RunOverlays } from './cabling';
import { rearColumn } from './stage';

export type Cell = [number, number];

export interface RearChains {
  runs: Cell[][];
  labels: string[];
  over: number[];
}

export interface RearRuns {
  data: RearChains;
  power: RearChains;
}

/**
 * Cut a screen's signal order into chains of a given length — how the
 * generated plan has always been drawn.
 */
function cut(layer: Layer, length: number | undefined): Cell[][] {
  const order = signalOrder(layer);
  if (!order.length) return [];
  const per = Math.max(1, Math.floor(length && length > 0 ? length : order.length));
  const runs: Cell[][] = [];
  for (let i = 0; i < order.length; i += per) runs.push(order.slice(i, i + per));
  return runs;
}

/**
 * Both plans for one screen, whatever its overlays are switched to on the
 * canvas. The overlays must be built with both switched on (see
 * `withEveryRun`), or a screen showing neither would have no lengths here.
 */
export function rearRuns(layer: Layer, overlays: RunOverlays): RearRuns {
  const custom = layer.cablingPlan === 'custom';
  const over = overlays.overRuns.get(layer.id);
  return {
    data: {
      runs: custom ? (layer.customRuns?.data ?? []).filter((r) => r.length) : cut(layer, overlays.runLengths.get(layer.id)),
      labels: overlays.runLabels.get(layer.id) ?? [],
      over: custom ? (over?.data ?? []) : [],
    },
    power: {
      runs: custom ? (layer.customRuns?.power ?? []).filter((r) => r.length) : cut(layer, overlays.powerLengths.get(layer.id)),
      labels: overlays.powerLabels.get(layer.id) ?? [],
      over: custom ? (over?.power ?? []) : [],
    },
  };
}

/** The same screens with both overlays on, so the run plan covers every one. */
export const withEveryRun = (layers: Layer[]): Layer[] =>
  layers.map((l) => ({ ...l, showSignalFlow: true, showPowerRuns: true }));

/**
 * Pixels per cabinet in the rear drawing.
 *
 * Big enough for a cabinet number and a port label to be read when the wall
 * fills the view, small enough that the whole back fits one texture: a
 * 200-wide wall gets 20 px a cabinet, where the labels stand down.
 */
export function rearTile(cols: number, rows: number, maxTexture = 4096) {
  return Math.max(12, Math.min(160, Math.floor(maxTexture / Math.max(1, cols, rows))));
}

export interface RearOptions {
  tile: number;
  showData: boolean;
  showPower: boolean;
}

const BACK = '#2b2c2f';
const PANEL = '#202124';
const EDGE = '#3c3e42';
const HANDLE = '#56595f';
const NUMBER = 'rgba(255,255,255,0.62)';

/** Draw a screen's back into a canvas `cols × tile` by `rows × tile`. */
export function drawRear(ctx: CanvasRenderingContext2D, layer: Layer, runs: RearRuns, options: RearOptions) {
  const { tile } = options;
  const { cols, rows } = layer;
  const width = cols * tile;
  const height = rows * tile;
  const legible = tile >= 40;

  // Cabinet backs: a frame, a recessed panel where the power supply and the
  // receiving card sit, and the two carry handles every rental panel has.
  ctx.fillStyle = BACK;
  ctx.fillRect(0, 0, width, height);
  const inset = tile * 0.08;
  ctx.fillStyle = PANEL;
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillRect(c * tile + inset, row * tile + inset, tile - inset * 2, tile - inset * 2);
    }
  }
  if (tile >= 24) {
    ctx.fillStyle = HANDLE;
    const hw = tile * 0.22;
    const hh = Math.max(1, tile * 0.05);
    for (let row = 0; row < rows; row++) {
      for (let c = 0; c < cols; c++) {
        const x = c * tile;
        const y = row * tile + tile * 0.16;
        ctx.fillRect(x + tile * 0.14, y, hw, hh);
        ctx.fillRect(x + tile - tile * 0.14 - hw, y, hw, hh);
      }
    }
  }
  const grid = new Path2D();
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) grid.rect(c * tile + 0.5, row * tile + 0.5, tile - 1, tile - 1);
  }
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = Math.max(1, tile * 0.02);
  ctx.stroke(grid);

  /*
   * The cabinet's number, in the corner rather than the middle so the cables
   * across the middle never cover it. The same number as the front and the
   * patch list: its place in the signal order.
   */
  if (legible) {
    ctx.fillStyle = NUMBER;
    ctx.font = `600 ${Math.round(tile * 0.13)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = rearColumn(col, cols) * tile + tile - inset * 1.6;
        const y = row * tile + tile - inset * 1.4;
        ctx.fillText(String(signalIndex(layer, col, row) + 1), x, y);
      }
    }
  }

  const centre = ([col, row]: Cell, nudge: number) => ({
    x: rearColumn(col, cols) * tile + tile / 2,
    y: row * tile + tile / 2 + nudge,
  });

  // Data reads cool and thin, power warm, thick and dashed, the way the canvas
  // and a rigging plot draw them, each off the centre line so both show.
  if (options.showData) drawChains(ctx, runs.data, centre, tile, { colours: RUN_COLOURS, nudge: -tile * 0.1, widthMul: 1 }, legible, width, height);
  if (options.showPower) drawChains(ctx, runs.power, centre, tile, { colours: POWER_COLOURS, nudge: tile * 0.12, widthMul: 1.4, dashed: true }, legible, width, height);
}

function drawChains(
  ctx: CanvasRenderingContext2D,
  chains: RearChains,
  centre: (cell: Cell, nudge: number) => { x: number; y: number },
  tile: number,
  style: { colours: string[]; nudge: number; widthMul: number; dashed?: boolean },
  legible: boolean,
  width: number,
  height: number
) {
  const over = new Set(chains.over);
  const line = Math.max(1.5, tile * 0.045 * style.widthMul);
  const dot = Math.max(2, tile * 0.09);
  const head = Math.max(3, tile * 0.16);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  chains.runs.forEach((run, i) => {
    if (!run.length) return;
    const colour = over.has(i) ? OVER_LIMIT_COLOUR : style.colours[i % style.colours.length];
    const points = run.map((cell) => centre(cell, style.nudge));
    const path = () => {
      ctx.beginPath();
      points.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    };

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = line * 2.2;
    path();
    ctx.stroke();

    ctx.setLineDash(style.dashed ? [line * 3, line * 2.2] : []);
    ctx.strokeStyle = colour;
    ctx.lineWidth = line;
    path();
    ctx.stroke();
    ctx.setLineDash([]);

    // Where the feed comes in from the rack or the distro.
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, dot, 0, Math.PI * 2);
    ctx.fill();

    // Which way it runs, on its last hop.
    if (points.length > 1) {
      const last = points[points.length - 1];
      const prev = points[points.length - 2];
      const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(last.x - head * Math.cos(angle - Math.PI / 6), last.y - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(last.x - head * Math.cos(angle + Math.PI / 6), last.y - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    const label = chains.labels[i];
    if (label && legible) pill(ctx, label, points[0].x, points[0].y - tile * 0.24, tile, colour, width, height);
  });

  ctx.restore();
}

function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tile: number,
  colour: string,
  width: number,
  height: number
) {
  const size = Math.max(9, Math.min(tile * 0.17, (tile * 1.6) / Math.max(4, text.length * 0.55)));
  ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + size * 0.9;
  const h = size * 1.5;
  // Kept on the wall, so a chain starting in a corner does not lose its name.
  const cx = Math.min(Math.max(x, w / 2), width - w / 2);
  const cy = Math.min(Math.max(y, h / 2), height - h / 2);
  ctx.fillStyle = 'rgba(5,7,11,0.9)';
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.fillText(text, cx, cy);
}
