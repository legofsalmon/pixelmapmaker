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
  /**
   * Largest bend the panel's own curve-locks allow at one joint, degrees.
   * No manufacturer in the scraped library publishes it, so this is null on
   * every entry that came from a spec page and the curve check is advisory.
   */
  maxCurveAngle?: number | null;
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

export type WallShapeKind = 'flat' | 'arc' | 'fold';

/**
 * How a screen's columns are hinged to each other, in plan.
 *
 * The pixel map of a curved wall is still a flat rectangle — the wall unrolls
 * the content and any warping is done in the media server — so a shape never
 * touches a layer's pixel geometry. It describes the physical wall only:
 * where the cabinets stand, how much floor the screen takes and how far it
 * reaches toward the audience.
 *
 * An arc bends by the same angle at every joint; a fold bends at named joints
 * and stays straight between them, which is how an L, a U or a three-sided box
 * is built. They are one model rather than two because a fold with every joint
 * set is an arc.
 *
 * Every field is carried whatever the kind, so switching between them does not
 * throw away what was already set up.
 */
export interface WallShape {
  kind: WallShapeKind;
  /** Arc: degrees of bend at each joint. Positive wraps toward the viewer. */
  anglePerJoint: number;
  /** Fold: bend at individual joints. Joint `n` sits between column n and n+1. */
  folds: Array<{ joint: number; angle: number }>;
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
  /** How the wall is bent in plan. Absent on projects saved before shapes. */
  shape?: WallShape;
  /** Top-left position in canvas pixels. */
  x: number;
  y: number;
  visible: boolean;
  locked: boolean;
  /** Tile fill colour; grid lines derive from it. */
  color: string;
  showNumbers: boolean;
  showSignalFlow: boolean;
  /** Draw the power circuits too. Absent on projects saved before it existed. */
  showPowerRuns?: boolean;
  signalStart: SignalStart;
  signalPath: SignalPath;
  /** Alternate tile shading, 0 = off. */
  checkerAmount: number;
  label: string;
  /**
   * A palette that paints the wall as one picture instead of tinting tiles.
   * Optional: projects saved before it existed simply have none.
   */
  pattern?: 'union-jack';
  /** Data URL of a logo drawn centred on the screen; null for none. */
  logo: string | null;
  /** Turn the centre image slowly, for the same reason the flag exists. */
  logoSpin?: boolean;
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
