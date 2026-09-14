import type { CanvasSettings, Layer } from './types';
import { contentBounds, layerRect, signalOrder, tileSize } from './geometry';
import { contrastInk, shade } from './palettes';

export interface RenderOptions {
  /** Draw editor-only affordances (selection, handles, guides). */
  chrome?: boolean;
  selectedIds?: string[];
  /** Canvas pixels per screen pixel — used to keep chrome hairline-thin. */
  scale?: number;
  snapGuides?: { vertical: number[]; horizontal: number[] } | null;
}

/** Font size that keeps a label inside a tile at any tile size. */
function fitFontSize(text: string, tileW: number, tileH: number) {
  const byHeight = tileH * 0.32;
  const byWidth = (tileW * 0.78) / Math.max(1, text.length * 0.6);
  return Math.max(6, Math.min(byHeight, byWidth));
}

function drawTiles(ctx: CanvasRenderingContext2D, layer: Layer) {
  const tile = tileSize(layer);
  const rect = layerRect(layer);
  const ink = contrastInk(layer.color);
  const lineColor = shade(layer.color, ink === '#000000' ? -0.35 : 0.4);
  // Grid lines stay visible on huge walls but never swamp a small tile.
  const lineWidth = Math.max(1, Math.min(tile.w, tile.h) * 0.012);

  const numbers = layer.showNumbers ? new Map<string, number>() : null;
  if (numbers) {
    signalOrder(layer).forEach(([col, row], i) => numbers.set(`${col},${row}`, i + 1));
  }

  for (let row = 0; row < layer.rows; row++) {
    for (let col = 0; col < layer.cols; col++) {
      const x = rect.x + col * tile.w;
      const y = rect.y + row * tile.h;

      const checker = layer.checkerAmount > 0 && (col + row) % 2 === 1;
      ctx.fillStyle = checker ? shade(layer.color, -layer.checkerAmount) : layer.color;
      ctx.fillRect(x, y, tile.w, tile.h);

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, tile.w - lineWidth, tile.h - lineWidth);

      if (numbers) {
        const label = String(numbers.get(`${col},${row}`) ?? '');
        const size = fitFontSize(label, tile.w, tile.h);
        ctx.fillStyle = ink;
        ctx.font = `600 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + tile.w / 2, y + tile.h / 2);
      }
    }
  }
}

function drawSignalFlow(ctx: CanvasRenderingContext2D, layer: Layer) {
  const tile = tileSize(layer);
  const rect = layerRect(layer);
  const order = signalOrder(layer);
  if (order.length < 2) return;

  const centre = ([col, row]: [number, number]) => ({
    x: rect.x + col * tile.w + tile.w / 2,
    y: rect.y + row * tile.h + tile.h / 2,
  });

  const ink = contrastInk(layer.color);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(1, Math.min(tile.w, tile.h) * 0.03);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  order.forEach((cell, i) => {
    const p = centre(cell);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Arrow head on the final hop shows the direction of travel.
  const last = centre(order[order.length - 1]);
  const prev = centre(order[order.length - 2]);
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
  const size = Math.min(tile.w, tile.h) * 0.22;
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(last.x - size * Math.cos(angle - Math.PI / 6), last.y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(last.x - size * Math.cos(angle + Math.PI / 6), last.y - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  // Start marker.
  const first = centre(order[0]);
  ctx.beginPath();
  ctx.arc(first.x, first.y, Math.min(tile.w, tile.h) * 0.12, 0, Math.PI * 2);
  ctx.fill();
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
  const { chrome = false, selectedIds = [], scale = 1, snapGuides = null } = options;
  const hairline = 1 / scale;

  ctx.fillStyle = canvas.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const visible = layers.filter((l) => l.visible);
  for (const layer of visible) {
    drawTiles(ctx, layer);
    if (layer.showSignalFlow) drawSignalFlow(ctx, layer);
    drawLayerLabel(ctx, layer);
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
export function renderLayerAlone(ctx: CanvasRenderingContext2D, layer: Layer, background: string) {
  const rect = layerRect(layer);
  ctx.save();
  if (background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, rect.width, rect.height);
  }
  ctx.translate(-rect.x, -rect.y);
  drawTiles(ctx, layer);
  if (layer.showSignalFlow) drawSignalFlow(ctx, layer);
  drawLayerLabel(ctx, layer);
  ctx.restore();
}

export { contentBounds };
