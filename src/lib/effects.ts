/**
 * Animated test patterns drawn over the cabinet grid.
 *
 * These are the commissioning patterns: something moving across the wall makes
 * dead tiles, mis-patched cabinets and processing latency obvious in a way a
 * static grid never will.
 *
 * Every effect is a pure function of time, so the live canvas and the video
 * recorder produce identical frames for the same timestamp.
 */
import type { Rect } from './geometry';

export type EffectKind =
  | 'none'
  | 'sonar'
  | 'line'
  | 'pulse'
  | 'scan'
  | 'ripple'
  | 'waves'
  | 'screen-lines';

export type EffectDirection = 'left-right' | 'right-left' | 'top-bottom' | 'bottom-top' | 'diagonal';

export interface EffectSettings {
  kind: EffectKind;
  color: string;
  opacity: number;
  /** Sweeps per second for travelling effects, cycles per second for pulses. */
  speed: number;
  direction: EffectDirection;
  /** Fraction of the travel the trail covers, 0–1. */
  trail: number;
  /** Line thickness as a fraction of the shorter canvas edge. */
  thickness: number;
}

export const DEFAULT_EFFECT: EffectSettings = {
  kind: 'none',
  color: '#ffffff',
  opacity: 0.85,
  speed: 0.25,
  direction: 'left-right',
  trail: 0.25,
  thickness: 0.01,
};

export const EFFECT_LABELS: Array<{ value: EffectKind; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'sonar', label: 'Sonar' },
  { value: 'line', label: 'Line' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'scan', label: 'Scan' },
  { value: 'ripple', label: 'Ripple' },
  { value: 'waves', label: 'Waves' },
  { value: 'screen-lines', label: 'Screen lines' },
];

export const DIRECTION_LABELS: Array<{ value: EffectDirection; label: string }> = [
  { value: 'left-right', label: 'Left to right' },
  { value: 'right-left', label: 'Right to left' },
  { value: 'top-bottom', label: 'Top to bottom' },
  { value: 'bottom-top', label: 'Bottom to top' },
  { value: 'diagonal', label: 'Diagonal' },
];

/** Position along a sweep, 0–1, wrapping once per cycle. */
const phase = (timeMs: number, speed: number) => ((timeMs / 1000) * speed) % 1;

const vertical = (d: EffectDirection) => d === 'top-bottom' || d === 'bottom-top';
const reversed = (d: EffectDirection) => d === 'right-left' || d === 'bottom-top';

function withAlpha(hex: string, alpha: number) {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * A travelling bar with a fading tail behind it. `area` is the region the
 * effect sweeps — the canvas, or one screen.
 */
function drawSweep(ctx: CanvasRenderingContext2D, area: Rect, s: EffectSettings, t: number) {
  const isVertical = vertical(s.direction);
  const span = isVertical ? area.height : area.width;
  let p = phase(t, s.speed);
  if (reversed(s.direction)) p = 1 - p;

  const head = isVertical ? area.y + p * span : area.x + p * span;
  const thickness = Math.max(1, Math.min(area.width, area.height) * s.thickness);
  const tail = Math.max(thickness, span * s.trail);

  // Gradient runs from the head backwards along the direction of travel.
  const back = reversed(s.direction) ? head + tail : head - tail;
  const gradient = isVertical
    ? ctx.createLinearGradient(0, back, 0, head)
    : ctx.createLinearGradient(back, 0, head, 0);
  gradient.addColorStop(0, withAlpha(s.color, 0));
  gradient.addColorStop(1, withAlpha(s.color, s.opacity));

  ctx.fillStyle = gradient;
  if (isVertical) {
    const top = Math.min(head, back);
    ctx.fillRect(area.x, top, area.width, Math.abs(head - back));
  } else {
    const left = Math.min(head, back);
    ctx.fillRect(left, area.y, Math.abs(head - back), area.height);
  }

  // Bright leading edge.
  ctx.fillStyle = withAlpha(s.color, s.opacity);
  if (isVertical) ctx.fillRect(area.x, head - thickness / 2, area.width, thickness);
  else ctx.fillRect(head - thickness / 2, area.y, thickness, area.height);
}

/** A hard-edged bar with no tail — the classic alignment line. */
function drawLine(ctx: CanvasRenderingContext2D, area: Rect, s: EffectSettings, t: number) {
  const isVertical = vertical(s.direction);
  const span = isVertical ? area.height : area.width;
  let p = phase(t, s.speed);
  if (reversed(s.direction)) p = 1 - p;
  const at = isVertical ? area.y + p * span : area.x + p * span;
  const thickness = Math.max(1, Math.min(area.width, area.height) * s.thickness * 2);

  ctx.fillStyle = withAlpha(s.color, s.opacity);
  if (isVertical) ctx.fillRect(area.x, at - thickness / 2, area.width, thickness);
  else ctx.fillRect(at - thickness / 2, area.y, thickness, area.height);
}

/** Expanding rings from the centre. */
function drawSonar(ctx: CanvasRenderingContext2D, area: Rect, s: EffectSettings, t: number) {
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const max = Math.hypot(area.width, area.height) / 2;
  const rings = 3;
  const thickness = Math.max(1, Math.min(area.width, area.height) * s.thickness * 2);

  for (let i = 0; i < rings; i++) {
    const p = (phase(t, s.speed) + i / rings) % 1;
    const radius = p * max;
    if (radius < 1) continue;
    // Rings fade as they travel out.
    ctx.strokeStyle = withAlpha(s.color, s.opacity * (1 - p));
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Whole area brightening and dimming — catches a panel that is not driving. */
function drawPulse(ctx: CanvasRenderingContext2D, area: Rect, s: EffectSettings, t: number) {
  const level = (Math.sin(phase(t, s.speed) * Math.PI * 2) + 1) / 2;
  ctx.fillStyle = withAlpha(s.color, s.opacity * level);
  ctx.fillRect(area.x, area.y, area.width, area.height);
}

/** Concentric bands, like a ripple frozen into rings. */
function drawRipple(ctx: CanvasRenderingContext2D, area: Rect, s: EffectSettings, t: number) {
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const max = Math.hypot(area.width, area.height) / 2;
  const wavelength = max / 6;
  const offset = phase(t, s.speed) * wavelength;

  for (let r = max; r > 0; r -= wavelength) {
    const radius = r - offset;
    if (radius <= 0) continue;
    ctx.strokeStyle = withAlpha(s.color, s.opacity * 0.6);
    ctx.lineWidth = Math.max(1, wavelength * 0.25);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** A travelling sine band. */
function drawWaves(ctx: CanvasRenderingContext2D, area: Rect, s: EffectSettings, t: number) {
  const isVertical = vertical(s.direction);
  const span = isVertical ? area.height : area.width;
  const cross = isVertical ? area.width : area.height;
  const steps = 64;
  const amplitude = cross * 0.18;
  const p = phase(t, s.speed) * Math.PI * 2 * (reversed(s.direction) ? -1 : 1);
  const thickness = Math.max(1, Math.min(area.width, area.height) * s.thickness * 2);

  ctx.strokeStyle = withAlpha(s.color, s.opacity);
  ctx.lineWidth = thickness;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const along = (i / steps) * span;
    const wave = Math.sin((i / steps) * Math.PI * 4 + p) * amplitude;
    const x = isVertical ? area.x + cross / 2 + wave : area.x + along;
    const y = isVertical ? area.y + along : area.y + cross / 2 + wave;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** Rolling horizontal bands, like a camera shutter beating against the wall. */
function drawScreenLines(ctx: CanvasRenderingContext2D, area: Rect, s: EffectSettings, t: number) {
  const isVertical = vertical(s.direction);
  const span = isVertical ? area.height : area.width;
  const band = Math.max(2, span * 0.04);
  let offset = phase(t, s.speed) * band * 2;
  if (reversed(s.direction)) offset = band * 2 - offset;

  ctx.fillStyle = withAlpha(s.color, s.opacity * 0.5);
  for (let at = -band * 2; at < span + band * 2; at += band * 2) {
    const pos = at + offset;
    if (isVertical) ctx.fillRect(area.x, area.y + pos, area.width, band);
    else ctx.fillRect(area.x + pos, area.y, band, area.height);
  }
}

const RENDERERS: Record<
  Exclude<EffectKind, 'none'>,
  (ctx: CanvasRenderingContext2D, area: Rect, s: EffectSettings, t: number) => void
> = {
  sonar: drawSonar,
  line: drawLine,
  pulse: drawPulse,
  scan: drawSweep,
  ripple: drawRipple,
  waves: drawWaves,
  'screen-lines': drawScreenLines,
};

/** Draw the current frame of `settings` over `area` at time `timeMs`. */
export function drawEffect(
  ctx: CanvasRenderingContext2D,
  area: Rect,
  settings: EffectSettings,
  timeMs: number
) {
  if (settings.kind === 'none' || settings.opacity <= 0) return;
  ctx.save();
  // Never paint outside the area the effect belongs to — a sonar ring's radius
  // reaches past the corners of its own box.
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.width, area.height);
  ctx.clip();
  // Effects light the wall up, so they add rather than cover.
  ctx.globalCompositeOperation = 'lighter';
  RENDERERS[settings.kind](ctx, area, settings, timeMs);
  ctx.restore();
}

export const isAnimated = (settings: EffectSettings) => settings.kind !== 'none';
