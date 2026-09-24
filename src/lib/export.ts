import type { CanvasSettings, Layer } from './types';
import { layerRect } from './geometry';
import { renderLayerAlone, renderProject } from './render';
import type { RunOverlays } from './cabling';
import { loadLayerLogos } from './logos';
import { isAnimated, type EffectSettings } from './effects';

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
  transparentBackground: boolean,
  /*
   * The run plan. Optional only so a caller that draws no runs need not build
   * one — but every caller that can show them must pass it, or the export
   * quietly disagrees with the screen it was taken from.
   */
  overlays?: RunOverlays
) {
  const { canvas, ctx } = makeCanvas(canvasSettings.width, canvasSettings.height);
  renderProject(
    ctx,
    transparentBackground ? { ...canvasSettings, background: 'rgba(0,0,0,0)' } : canvasSettings,
    layers,
    { chrome: false, logos: await loadLayerLogos(layers), ...overlays }
  );
  download(await toBlob(canvas), `${safe(projectName)}_${canvasSettings.width}x${canvasSettings.height}.png`);
}

/** Export one screen cropped to its own bounds — the native grid for that wall. */
export async function exportLayerPng(
  layer: Layer,
  background: string,
  transparent: boolean,
  overlays?: RunOverlays
) {
  const rect = layerRect(layer);
  const { canvas, ctx } = makeCanvas(rect.width, rect.height);
  const logos = await loadLayerLogos([layer]);
  renderLayerAlone(
    ctx,
    layer,
    transparent ? 'transparent' : background,
    logos.get(layer.id),
    overlays?.runLengths.get(layer.id),
    overlays?.runLabels.get(layer.id),
    overlays?.powerLengths.get(layer.id),
    overlays?.powerLabels.get(layer.id)
  );
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

/** Container and codec the browser will actually record, best first. */
function pickVideoType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export const canRecordVideo = () =>
  typeof MediaRecorder !== 'undefined' && pickVideoType() !== null;

export interface VideoExportOptions {
  seconds: number;
  fps: number;
  onProgress?: (fraction: number) => void;
}

/**
 * Record the animated map at the canvas's native resolution.
 *
 * Frames are drawn on a fixed timestep rather than from a wall clock, so the
 * recording runs at the intended speed whether or not the tab keeps up, and the
 * same settings always produce the same footage.
 */
export async function exportVideo(
  projectName: string,
  canvasSettings: CanvasSettings,
  layers: Layer[],
  effect: EffectSettings,
  { seconds, fps, onProgress }: VideoExportOptions,
  overlays?: RunOverlays
) {
  if (!isAnimated(effect)) throw new Error('Choose a test pattern before recording');
  const mimeType = pickVideoType();
  if (!mimeType) throw new Error('This browser cannot record video from a canvas');

  const { canvas, ctx } = makeCanvas(canvasSettings.width, canvasSettings.height);
  const logos = await loadLayerLogos(layers);
  const stream = canvas.captureStream(0);
  const [track] = stream.getVideoTracks() as Array<MediaStreamTrack & { requestFrame?: () => void }>;
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const finished = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();
  const total = Math.max(1, Math.round(seconds * fps));
  for (let i = 0; i < total; i++) {
    renderProject(ctx, canvasSettings, layers, {
      chrome: false,
      effect,
      timeMs: (i / fps) * 1000,
      logos,
      ...overlays,
    });
    track?.requestFrame?.();
    onProgress?.((i + 1) / total);
    // Yield so the recorder can pull the frame we just drew.
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }

  recorder.stop();
  await finished;
  track?.stop();

  const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  download(new Blob(chunks, { type: mimeType }), `${safe(projectName)}_${effect.kind}.${extension}`);
  return extension;
}
