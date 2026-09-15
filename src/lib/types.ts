/** Physical + electrical description of one LED cabinet. */
export interface CabinetSpec {
  id: string;
  brand: string;
  series: string;
  model: string;
  /** Pixel pitch in millimetres. */
  pixelPitch: number;
  cabinet: { width: number; height: number; depth: number | null };
  resolution: { w: number; h: number };
  /** True when resolution was derived from size / pitch rather than published. */
  derivedResolution?: boolean;
  weightKg: number | null;
  power: { max: number | null; avg: number | null } | null;
  brightnessNits: number | null;
  refreshHz: number | null;
  ipRating: string | null;
  scanRate?: string | null;
  ledConfig?: string | null;
  serviceability?: string | null;
  maxHanging?: number | null;
  maxStacking?: number | null;
  environment: 'indoor' | 'outdoor';
  category: 'rental' | 'outdoor' | 'fine-pitch' | 'transparent' | 'floor';
  sourceUrl: string;
  aspect: number;
  areaM2: number;
  pixelsPerCabinet: number | null;
  weightPerM2: number | null;
  powerPerM2: number | null;
  /** Set on panels the user created rather than ones from the scraped library. */
  custom?: boolean;
}

export type SignalStart = 'tl' | 'tr' | 'bl' | 'br';
export type SignalPath = 'serpentine' | 'raster' | 'vertical-serpentine' | 'vertical-raster';

/** One LED screen placed on the canvas. */
export interface Layer {
  id: string;
  name: string;
  spec: CabinetSpec;
  /** Cabinet count. */
  cols: number;
  rows: number;
  /** Top-left position in canvas pixels. */
  x: number;
  y: number;
  visible: boolean;
  locked: boolean;
  /** Tile fill colour; grid lines derive from it. */
  color: string;
  showNumbers: boolean;
  showSignalFlow: boolean;
  signalStart: SignalStart;
  signalPath: SignalPath;
  /** Alternate tile shading, 0 = off. */
  checkerAmount: number;
  label: string;
  /** Data URL of a logo drawn centred on the screen; null for none. */
  logo: string | null;
  /** Logo width as a fraction of the screen's shorter side. */
  logoScale: number;
  logoOpacity: number;
}

export interface CanvasSettings {
  /** Effects sweep the whole canvas rather than each screen separately. */
  effectScope: 'canvas' | 'per-screen';
  width: number;
  height: number;
  background: string;
  showCanvasGuides: boolean;
  /** Dim everything outside the union of all layers. */
  maskOutsideScreens: boolean;
  showRuler: boolean;
}

export interface Project {
  name: string;
  canvas: CanvasSettings;
  layers: Layer[];
  selectedIds: string[];
}
