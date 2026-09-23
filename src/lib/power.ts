/**
 * Three-phase supply and distro balancing.
 *
 * `calc.ts` gives current at 230 V and 120 V, which answers "what does this
 * wall draw" on a single-phase lead. It does not answer the question a wall of
 * any size actually arrives at: the venue hands over a three-phase service, the
 * distro splits it into ways, and somebody has to decide which way sits on
 * which leg. Get that wrong and one leg trips while the other two idle.
 *
 * Two things are worth being precise about, because the trade shorthand hides
 * them both:
 *
 * 1. **A cabinet is not a three-phase load.** Its power supply is wired between
 *    one line and neutral, so it sees the phase voltage — 230 V on a 400 V
 *    service, 120 V on a 208 V one — and the current in that leg is simply the
 *    watts on it divided by that voltage. The √3 in `P = √3 · V(L-L) · I` is
 *    for a load connected across all three lines, and applying it per leg
 *    understates the current by 42%. `threePhaseLineAmps` is here for the
 *    balanced whole-service figure, and a test pins the two together.
 *
 * 2. **The neutral does not carry nothing.** Three equal line-to-neutral loads
 *    at 120° cancel in the neutral; three unequal ones do not, and the return
 *    is the vector sum, not the arithmetic one. That is the number balancing is
 *    really about, so it is reported rather than assumed away.
 */
import type { Layer } from './types';
import { cablingForProject, type CablingSettings } from './cabling';

export type SupplyId = 'three-400' | 'three-208' | 'three-480' | 'single-230' | 'single-120';

export interface Supply {
  id: SupplyId;
  label: string;
  /** Live conductors a circuit can sit on. */
  legs: 1 | 3;
  /** Line-to-line volts — what a three-phase service is named after. */
  lineVolts: number;
  /** Line-to-neutral volts, and the only voltage a cabinet ever sees. */
  phaseVolts: number;
  where: string;
  /** Feed ratings per leg that the trade stocks, smallest first. */
  serviceSizes: number[];
  /** Smallest connector that carries a given rating: [amps, name]. */
  connectors: Array<[number, string]>;
}

/*
 * Nominal voltage pairs, not measured ones: 400/230, 208/120 and 480/277 are
 * the names on the paperwork, and each pair is within a percent of the exact
 * √3 ratio. A test holds them to that, so a typo in a new entry cannot pass.
 */
export const SUPPLIES: Supply[] = [
  {
    id: 'three-400',
    label: 'Three-phase 400/230 V',
    legs: 3,
    lineVolts: 400,
    phaseVolts: 230,
    where: 'Ireland, UK, most of Europe',
    serviceSizes: [16, 32, 63, 125],
    connectors: [
      [16, '16 A 5-pin (IEC 60309)'],
      [32, '32 A 5-pin'],
      [63, '63 A 5-pin'],
      [125, '125 A 5-pin'],
    ],
  },
  {
    id: 'three-208',
    label: 'Three-phase 208/120 V',
    legs: 3,
    lineVolts: 208,
    phaseVolts: 120,
    where: 'North America',
    serviceSizes: [20, 30, 50, 60, 100, 200],
    connectors: [
      [20, 'NEMA L21-20'],
      [30, 'NEMA L21-30'],
      [60, 'Cam-Lok single-pole set'],
    ],
  },
  {
    id: 'three-480',
    label: 'Three-phase 480/277 V',
    legs: 3,
    lineVolts: 480,
    phaseVolts: 277,
    where: 'North American arenas and larger services',
    serviceSizes: [60, 100, 200, 400],
    connectors: [[60, 'Cam-Lok single-pole set']],
  },
  {
    id: 'single-230',
    label: 'Single-phase 230 V',
    legs: 1,
    lineVolts: 230,
    phaseVolts: 230,
    where: 'Ireland, UK, most of Europe',
    serviceSizes: [16, 32, 63, 125],
    connectors: [
      [16, '16 A 3-pin (IEC 60309)'],
      [32, '32 A 3-pin'],
      [63, '63 A 3-pin'],
      [125, '125 A 3-pin'],
    ],
  },
  {
    id: 'single-120',
    label: 'Single-phase 120 V',
    legs: 1,
    lineVolts: 120,
    phaseVolts: 120,
    where: 'North America',
    serviceSizes: [15, 20, 30, 50],
    connectors: [
      [15, 'NEMA 5-15'],
      [20, 'NEMA 5-20 / L5-20'],
      [30, 'NEMA L5-30'],
    ],
  },
];

export const getSupply = (id: string): Supply =>
  SUPPLIES.find((s) => s.id === id) ?? SUPPLIES[0];

/** Names for the legs, in the order a distro's ways rotate through them. */
export const LEG_NAMES = ['L1', 'L2', 'L3'] as const;

export interface PowerSettings {
  supplyId: SupplyId;
  /** Rating of one leg of the incoming feed, amps. */
  serviceAmpsPerLeg: number;
  /** Branch ways on one distro. */
  waysPerDistro: number;
  /**
   * Published panel power is real power. A power-factor-corrected supply sits
   * around 0.95, and a breaker sees the apparent current, so dropping this
   * below 1 raises every figure here. It defaults to 1 because that is what
   * the datasheet figure alone supports — put the panel's own measured figure
   * in rather than a rule of thumb.
   */
  powerFactor: number;
}

export const DEFAULT_POWER: PowerSettings = {
  supplyId: 'three-400',
  serviceAmpsPerLeg: 63,
  waysPerDistro: 12,
  powerFactor: 1,
};

/** Current one line-to-neutral load draws in its own leg. */
export function legAmps(watts: number, phaseVolts: number, powerFactor = 1) {
  const volts = phaseVolts * Math.min(1, Math.max(0.1, powerFactor));
  return volts > 0 ? watts / volts : 0;
}

/**
 * Line current of a *balanced* three-phase load, from the line-to-line volts.
 * Same number as `legAmps` on a wye, by way of V(L-L) = √3 · V(L-N); it is here
 * because it is the form people check against, and a test holds the two equal.
 */
export function threePhaseLineAmps(watts: number, lineVolts: number, powerFactor = 1) {
  const volts = Math.sqrt(3) * lineVolts * Math.min(1, Math.max(0.1, powerFactor));
  return volts > 0 ? watts / volts : 0;
}

/**
 * Current returning down the neutral of a three-phase, four-wire supply.
 *
 * Three currents 120° apart sum vectorially, which works out as
 * √(a² + b² + c² − ab − bc − ca): zero when the legs are equal, the full leg
 * current when only one is loaded, and one leg's worth when two are equal.
 * Fundamental only — switch-mode supplies add third-harmonic current that does
 * not cancel, so the real return is higher than this and the conductor is sized
 * for a full leg rather than for this figure.
 */
export function neutralAmps(a: number, b: number, c: number) {
  const sum = a * a + b * b + c * c - a * b - b * c - c * a;
  // Rounding can push a perfectly balanced case a hair below zero.
  return Math.sqrt(Math.max(0, sum));
}

/**
 * Spread of load across the legs, as a percentage of the average leg.
 *
 * The largest deviation from the mean over the mean — the form NEMA MG-1 uses
 * for voltage unbalance, applied to load. Taking max-minus-min instead would
 * call two heavy legs and one light one the same as one heavy and two light,
 * and they are not the same problem.
 */
export function imbalancePercent(loads: number[]) {
  if (loads.length < 2) return 0;
  const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
  if (mean <= 0) return 0;
  const worst = Math.max(...loads.map((l) => Math.abs(l - mean)));
  return (worst / mean) * 100;
}

/**
 * Deal loads onto legs, heaviest first onto whichever leg is lightest.
 *
 * Longest-processing-time first: the standard greedy for this, never worse than
 * 4/3 of the perfect split and usually exact on the handful of near-equal
 * circuits a wall produces. Ties go to the lower-numbered leg so the answer is
 * the same every time it is worked out — a patch sheet that reshuffles itself
 * between two runs of the same project is worse than a slightly uneven one.
 */
export function balanceLoads(loads: number[], legs: number): number[] {
  const count = Math.max(1, Math.floor(legs));
  const placement = new Array<number>(loads.length).fill(0);
  const totals = new Array<number>(count).fill(0);

  const order = loads
    .map((load, index) => ({ load, index }))
    .sort((a, b) => b.load - a.load || a.index - b.index);

  for (const { load, index } of order) {
    let lightest = 0;
    for (let leg = 1; leg < count; leg++) if (totals[leg] < totals[lightest]) lightest = leg;
    placement[index] = lightest;
    totals[lightest] += load;
  }
  return placement;
}

/** Smallest stocked feed that holds a given current, or null if none does. */
export const serviceSizeFor = (amps: number, supply: Supply) =>
  supply.serviceSizes.find((size) => size >= amps) ?? null;

/** Smallest connector that carries a given rating. */
export const connectorFor = (amps: number, supply: Supply) =>
  supply.connectors.find(([rating]) => rating >= amps)?.[1] ??
  supply.connectors[supply.connectors.length - 1]?.[1] ??
  null;

/** One branch circuit: the panels on it and what they pull. */
export interface Circuit {
  id: string;
  layerId: string;
  layerName: string;
  cabinets: number;
  /** Null when the panel publishes no power figure. */
  maxW: number | null;
  avgW: number | null;
  amps: number | null;
}

export interface Leg {
  name: string;
  circuits: Circuit[];
  maxW: number;
  avgW: number;
  amps: number;
  /** Fraction of the feed rating this leg uses at maximum draw. */
  utilisation: number;
  overloaded: boolean;
}

/** One outlet on a distro, in the order the ways rotate through the legs. */
export interface Way {
  distro: number;
  way: number;
  leg: string;
  circuit: Circuit;
  label: string;
}

export interface PowerPlan {
  supply: Supply;
  powerFactor: number;
  legs: Leg[];
  ways: Way[];
  /** Circuits whose panel publishes no power, so they cannot be balanced. */
  unknown: Circuit[];
  incomplete: boolean;
  circuits: number;
  totalMaxW: number;
  totalAvgW: number;
  /** Per-leg current if the load split perfectly. */
  balancedAmps: number;
  worstLegAmps: number;
  /** Current the neutral returns; null on a single-phase supply. */
  neutralAmps: number | null;
  imbalancePercent: number;
  serviceAmpsPerLeg: number;
  overService: boolean;
  /** Smallest stocked feed that holds the worst leg. */
  recommendedService: number | null;
  connector: string | null;
  distros: number;
  waysPerDistro: number;
  warnings: string[];
}

/**
 * Cut the project's power runs into individual circuits.
 *
 * `cabling.ts` sizes a run and counts how many there are; a distro needs them
 * one at a time, because the last run on a screen is usually a short one and
 * putting a full run's load on it would overstate a leg.
 */
export function circuitsForProject(
  layers: Layer[],
  plan: ReturnType<typeof cablingForProject>,
  powerFactor: number,
  phaseVolts: number
): Circuit[] {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const circuits: Circuit[] = [];

  for (const screen of plan.screens) {
    const layer = byId.get(screen.layerId);
    const perCabinetMax = layer?.spec.power?.max ?? null;
    const perCabinetAvg = layer?.spec.power?.avg ?? null;
    const perRun = screen.power.cabinetsPerRun;

    for (let i = 0; i < screen.power.runs; i++) {
      const cabinets = Math.min(perRun, screen.cabinets - i * perRun);
      const maxW = perCabinetMax != null ? perCabinetMax * cabinets : null;
      circuits.push({
        id: `${screen.layerId}#${i + 1}`,
        layerId: screen.layerId,
        layerName: screen.layerName,
        cabinets,
        maxW,
        avgW: perCabinetAvg != null ? perCabinetAvg * cabinets : null,
        amps: maxW != null ? legAmps(maxW, phaseVolts, powerFactor) : null,
      });
    }
  }

  return circuits;
}

export function planPower(
  layers: Layer[],
  cabling: CablingSettings,
  plan: ReturnType<typeof cablingForProject>,
  settings: PowerSettings
): PowerPlan {
  const supply = getSupply(settings.supplyId);
  const powerFactor = Math.min(1, Math.max(0.1, settings.powerFactor));
  const circuits = circuitsForProject(layers, plan, powerFactor, supply.phaseVolts);

  // A circuit with no published panel power is left out of the balance rather
  // than counted as zero, which would quietly make a leg look under-loaded.
  const known = circuits.filter((c) => c.maxW != null);
  const unknown = circuits.filter((c) => c.maxW == null);

  const placement = balanceLoads(known.map((c) => c.maxW as number), supply.legs);
  const legs: Leg[] = Array.from({ length: supply.legs }, (_, i) => ({
    name: supply.legs === 1 ? 'Single phase' : LEG_NAMES[i],
    circuits: [],
    maxW: 0,
    avgW: 0,
    amps: 0,
    utilisation: 0,
    overloaded: false,
  }));

  known.forEach((circuit, i) => {
    const leg = legs[placement[i]];
    leg.circuits.push(circuit);
    leg.maxW += circuit.maxW as number;
    leg.avgW += circuit.avgW ?? 0;
  });

  const rating = Math.max(1, settings.serviceAmpsPerLeg);
  for (const leg of legs) {
    leg.amps = legAmps(leg.maxW, supply.phaseVolts, powerFactor);
    leg.utilisation = leg.amps / rating;
    leg.overloaded = leg.amps > rating;
  }

  const totalMaxW = known.reduce((a, c) => a + (c.maxW as number), 0);
  const totalAvgW = known.reduce((a, c) => a + (c.avgW ?? 0), 0);
  const worstLegAmps = legs.reduce((a, l) => Math.max(a, l.amps), 0);
  const neutral =
    supply.legs === 3 ? neutralAmps(legs[0].amps, legs[1].amps, legs[2].amps) : null;

  /*
   * Ways rotate through the legs the way a distro is wired — way 1 on L1, way 2
   * on L2, way 3 on L3 — so the patch reads off the box rather than asking
   * anyone to re-derive it. Each leg's circuits are dealt out in turn.
   */
  const queues = legs.map((l) => [...l.circuits]);
  const ways: Way[] = [];
  const perDistro = Math.max(1, Math.floor(settings.waysPerDistro));
  let index = 0;
  while (queues.some((q) => q.length)) {
    const leg = index % legs.length;
    const circuit = queues[leg].shift();
    if (circuit) {
      const distro = Math.floor(ways.length / perDistro) + 1;
      const way = (ways.length % perDistro) + 1;
      ways.push({
        distro,
        way,
        leg: legs[leg].name,
        circuit,
        label: `Way ${way} (${legs[leg].name})`,
      });
    }
    index++;
  }

  const warnings: string[] = [];
  /*
   * Circuits are sized by `cabling.ts` against its own supply voltage, and read
   * here against the supply's line-to-neutral voltage. They are the same number
   * whenever the supply is chosen in the panel below, which sets both — but a
   * project saved before this existed, or one edited by hand, can carry a
   * mismatch, and a circuit sized at one voltage and loaded at another is
   * wrong in both directions. Say so rather than papering over it.
   */
  if (Math.abs(cabling.supplyVoltage - supply.phaseVolts) > 1 && cabling.mode === 'auto') {
    warnings.push(
      `Circuits were sized at ${cabling.supplyVoltage} V but this supply puts ${supply.phaseVolts} V on a panel. Re-pick the supply so the two agree.`
    );
  }
  if (unknown.length) {
    warnings.push(
      `${unknown.length} circuit${unknown.length === 1 ? '' : 's'} sit on panels that publish no power figure, so ${
        unknown.length === 1 ? 'it is' : 'they are'
      } not in the balance. The legs below are lighter than the real load.`
    );
  }
  const overBranch = known.filter((c) => (c.amps ?? 0) > cabling.maxAmpsPerCircuit);
  if (overBranch.length) {
    warnings.push(
      `${overBranch.length} circuit${overBranch.length === 1 ? '' : 's'} draw more than the ${
        cabling.maxAmpsPerCircuit
      } A branch breaker. Shorten the power runs, or raise the breaker size.`
    );
  }
  const overloaded = legs.filter((l) => l.overloaded);
  if (overloaded.length) {
    warnings.push(
      `${overloaded.map((l) => l.name).join(', ')} exceed${overloaded.length === 1 ? 's' : ''} the ${rating} A feed. Split the wall across a second service, or ask for a bigger one.`
    );
  }
  const spread = imbalancePercent(legs.map((l) => l.maxW));
  /*
   * The split above is already the closest these circuits allow, so a small
   * spread is not a fault and warning about one would only teach people to
   * ignore the warnings. A quarter is where it starts to matter: past that,
   * sizing the service on the even-split figure under-reads the worst leg by
   * more than the headroom a feed is usually chosen with.
   */
  if (supply.legs === 3 && spread > 25) {
    warnings.push(
      `The closest split these circuits allow still leaves the legs ${spread.toFixed(
        0
      )}% apart, because they are too few or too unequal to divide three ways. Sizing the power runs smaller gives the balance more to work with.`
    );
  }

  return {
    supply,
    powerFactor,
    legs,
    ways,
    unknown,
    incomplete: unknown.length > 0,
    circuits: circuits.length,
    totalMaxW,
    totalAvgW,
    balancedAmps: legAmps(totalMaxW / supply.legs, supply.phaseVolts, powerFactor),
    worstLegAmps,
    neutralAmps: neutral,
    imbalancePercent: spread,
    serviceAmpsPerLeg: rating,
    overService: worstLegAmps > rating,
    recommendedService: serviceSizeFor(worstLegAmps, supply),
    connector: connectorFor(serviceSizeFor(worstLegAmps, supply) ?? worstLegAmps, supply),
    distros: ways.length ? Math.ceil(ways.length / perDistro) : 0,
    waysPerDistro: perDistro,
    warnings,
  };
}
