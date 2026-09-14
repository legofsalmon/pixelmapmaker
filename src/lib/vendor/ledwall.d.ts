/** Types for the vendored tipping-point solver — only the parts this app uses. */

export interface LedWallInput {
  wallWidth: number;
  wallHeight: number;
  wallBottom: number;
  wallDepth: number;
  wallArealMass: number;
  trussHeight: number;
  trussDepth: number;
  trussWidth?: number;
  trussLinearMass: number;
  plateFront: number;
  plateBack: number;
  plateWidth: number;
  plateMass: number;
  ballastMass: number;
  windSpeed?: number;
  safetyFactor?: number;
  forceCoefficient?: number;
  maxSpacing?: number;
  maxLoadPerUpright?: number;
  uprights?: number;
}

export interface LedWallResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  uprights: number;
  minimumUprights: number;
  governingConstraint: string;
  spacing: number;
  passes: boolean;
  buildable: boolean;
  stabilityAchievable: boolean;
  countAchievable: boolean;
  worstRatio: number;
  safetyFactor: number;
  ballastPerUpright: number;
  ballastNeededPerUpright: number;
  ballastTotal: number;
  wallMassPerUpright: number;
  loadPerUpright: number;
  totalMass: number;
  limitingWindSpeed: number;
  tippingWindSpeed: number;
  windSpeed: number;
  windPressure: number;
  windForce: number;
  beaufort: number;
  beaufortName: string;
  governingCase: { id: string; label?: string };
  showing: { footprint: number; plateToe: number; trussHidden: boolean };
}

export interface Preset {
  label: string;
  value: number;
  depth?: number;
}

declare const LedWall: {
  TRUSS_PRESETS: Preset[];
  CF_PRESETS: Preset[];
  BEAUFORT_NAMES: string[];
  solve(input: LedWallInput): LedWallResult;
  windPressure(speed: number, density?: number): number;
  beaufort(speed: number): number;
};

export default LedWall;
