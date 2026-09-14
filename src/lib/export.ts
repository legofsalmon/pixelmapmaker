import type { CanvasSettings, Layer } from './types';
import { layerRect } from './geometry';
import { renderLayerAlone, renderProject } from './render';

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D canvas context');
  return { canvas, ctx };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png')
  );

const safe = (value: string) => value.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_|_$/g, '') || 'map';

/** Export the whole canvas at its native pixel resolution. */
export async function exportCanvasPng(
  projectName: string,
  canvasSettings: CanvasSettings,
  layers: Layer[],
  transparentBackground: boolean
) {
  const { canvas, ctx } = makeCanvas(canvasSettings.width, canvasSettings.height);
  renderProject(
    ctx,
    transparentBackground ? { ...canvasSettings, background: 'rgba(0,0,0,0)' } : canvasSettings,
    layers,
    { chrome: false }
  );
  download(await toBlob(canvas), `${safe(projectName)}_${canvasSettings.width}x${canvasSettings.height}.png`);
}

/** Export one screen cropped to its own bounds — the native grid for that wall. */
export async function exportLayerPng(layer: Layer, background: string, transparent: boolean) {
  const rect = layerRect(layer);
  const { canvas, ctx } = makeCanvas(rect.width, rect.height);
  renderLayerAlone(ctx, layer, transparent ? 'transparent' : background);
  download(await toBlob(canvas), `${safe(layer.name)}_${rect.width}x${rect.height}.png`);
}

export function exportProjectJson(projectName: string, json: string) {
  download(new Blob([json], { type: 'application/json' }), `${safe(projectName)}.pixelmap.json`);
}

/** After Effects / Resolume style composition summary. */
export function exportCompositionJson(
  projectName: string,
  canvasSettings: CanvasSettings,
  layers: Layer[]
) {
  const payload = {
    project: projectName,
    composition: { width: canvasSettings.width, height: canvasSettings.height },
    screens: layers.map((layer) => {
      const rect = layerRect(layer);
      return {
        name: layer.name,
        cabinet: `${layer.spec.brand} ${layer.spec.model}`,
        pixelPitch: layer.spec.pixelPitch,
        grid: { cols: layer.cols, rows: layer.rows },
        position: { x: rect.x, y: rect.y },
        size: { width: rect.width, height: rect.height },
        physicalMm: {
          width: layer.spec.cabinet.width * layer.cols,
          height: layer.spec.cabinet.height * layer.rows,
        },
      };
    }),
  };
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `${safe(projectName)}_composition.json`
  );
}

export async function readProjectFile(file: File) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed?.layers?.length) throw new Error('That file has no screens in it');
  return parsed;
}
