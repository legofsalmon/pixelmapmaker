/**
 * The plan view: a wall seen from above.
 *
 * A curved wall is invisible on the main canvas, and correctly so — the canvas
 * is the pixel map, and the pixel map of a curved wall is the same flat
 * rectangle as a straight one. Without a second drawing there is nothing to
 * look at and no way to tell a 3° bend from a 30° one, so the shape controls
 * get their own small elevation-from-above beside them.
 *
 * Drawn in the same millimetre frame `wallPlan` works in: +y points at the
 * audience, which on a canvas is down the screen, so the plan reads the way
 * someone would sketch it on a site drawing.
 */
import type { WallPlan } from './curve';

export interface PlanDrawOptions {
  /** Box to fit the drawing into, in CSS pixels. */
  width: number;
  height: number;
  /** The wall's own tile colour, so the plan matches the screen on the canvas. */
  colour: string;
  /** Ink for dimensions and labels. */
  ink?: string;
  muted?: string;
}

const PADDING = 22;

/** Millimetres to a readable string — metres past a metre, millimetres below. */
export const mmLabel = (mm: number) =>
  mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm)} mm`;

export function drawPlan(ctx: CanvasRenderingContext2D, plan: WallPlan, options: PlanDrawOptions) {
  const { width, height, colour } = options;
  const ink = options.ink ?? 'rgba(255,255,255,0.82)';
  const muted = options.muted ?? 'rgba(255,255,255,0.34)';

  ctx.clearRect(0, 0, width, height);
  if (plan.points.length < 2) return;

  const xs = plan.points.map((p) => p.x);
  const ys = plan.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  /*
   * A flat wall is a line with no height at all, and a shallow curve barely
   * more. Fitting to the true extent would blow either up until a 2 mm sag
   * filled the box and looked like a horseshoe, so the vertical extent is
   * floored at a fraction of the span: a gentle curve draws gently.
   */
  const spanMm = Math.max(1, maxX - minX);
  const extentY = Math.max(maxY - minY, spanMm * 0.12);
  const scale = Math.min(
    (width - PADDING * 2) / spanMm,
    (height - PADDING * 2) / extentY
  );

  const centreY = (minY + maxY) / 2;
  const toScreen = (p: { x: number; y: number }) => ({
    x: width / 2 + (p.x - (minX + maxX) / 2) * scale,
    y: height / 2 + (p.y - centreY) * scale,
  });

  const screen = plan.points.map(toScreen);
  const first = screen[0];
  const last = screen[screen.length - 1];

  // The line between the ends, which is what the span and the depth measure
  // against — dashed, because it is a dimension and not a thing that exists.
  ctx.save();
  ctx.strokeStyle = muted;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();

  // The wall itself.
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  screen.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();

  // A tick at every joint, so the cabinet count is countable rather than
  // asserted — on a wide wall they merge, which is itself the honest reading.
  ctx.fillStyle = colour;
  for (let i = 1; i < screen.length - 1; i++) {
    ctx.beginPath();
    ctx.arc(screen[i].x, screen[i].y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Which way the audience is. Without it a concave wall and a convex one are
  // the same picture upside down.
  ctx.save();
  ctx.fillStyle = muted;
  ctx.font = '500 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('audience', width / 2, height - 4);
  ctx.restore();

  // Span across the ends, and how far the wall reaches off that line.
  ctx.save();
  ctx.fillStyle = ink;
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(mmLabel(plan.spanMm), (first.x + last.x) / 2, Math.max(first.y, last.y) + 6);

  if (!plan.flat) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${mmLabel(plan.footprintMm.depth)} deep`, 6, 12);
  }
  ctx.restore();
}
