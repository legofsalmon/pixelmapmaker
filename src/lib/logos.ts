/**
 * Decoding logo data URLs into drawable images.
 *
 * The renderer is synchronous, so callers resolve every layer's logo before
 * drawing and hand the bitmaps in. Decoded images are cached by data URL, since
 * the same logo is usually on several screens and re-decoding it each frame
 * would stall the animation.
 */
import type { Layer } from './types';

const cache = new Map<string, HTMLImageElement>();

function decode(dataUrl: string): Promise<HTMLImageElement> {
  const cached = cache.get(dataUrl);
  if (cached?.complete && cached.naturalWidth > 0) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      cache.set(dataUrl, image);
      resolve(image);
    };
    image.onerror = () => reject(new Error('That image could not be decoded'));
    image.src = dataUrl;
  });
}

/** Resolve every layer's logo, skipping any that fail rather than failing all. */
export async function loadLayerLogos(layers: Layer[]) {
  const logos = new Map<string, CanvasImageSource>();
  await Promise.all(
    layers
      .filter((l) => l.logo)
      .map(async (layer) => {
        try {
          logos.set(layer.id, await decode(layer.logo!));
        } catch {
          // A broken logo should not stop the rest of the map drawing.
        }
      })
  );
  return logos;
}

/** Synchronous lookup for the animation loop, for images already decoded. */
export function cachedLogos(layers: Layer[]) {
  const logos = new Map<string, CanvasImageSource>();
  for (const layer of layers) {
    if (!layer.logo) continue;
    const image = cache.get(layer.logo);
    if (image?.complete && image.naturalWidth > 0) logos.set(layer.id, image);
  }
  return logos;
}

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Read a picked file as a data URL, rejecting anything too big to store. */
export function readLogoFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('That is not an image file'));
  }
  if (file.size > MAX_LOGO_BYTES) {
    return Promise.reject(
      new Error(`That image is ${Math.round(file.size / 1024)} KB — keep logos under 2 MB`)
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read'));
    reader.readAsDataURL(file);
  });
}
