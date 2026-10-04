/**
 * Hand-drawn cabling: the chains a user traces on the wall themselves.
 *
 * The automatic plan chops the signal order into equal lengths, which is the
 * right answer for a plain rectangle and the wrong one as soon as the room
 * has an opinion — the distro is stage left, the cable has to cross a
 * walkway, two cabinets are on a different truss. A drawn run says what is
 * actually going to be patched.
 *
 * A run is what it always was here: the cabinets on one chain, in the order
 * they are fed. So a drawn plan and a generated one are the same shape, and
 * everything downstream — the overlay, the patch list, the cable count —
 * takes either without knowing which it has.
 *
 * What is drawn is kept beside the automatic plan rather than replacing it,
 * and a switch on the screen says which one counts. Nothing is lost by trying
 * something.
 */
import type { Layer } from './types';
import type { CablingSettings } from './cabling';
import { pixelsPerPortAt, type Processor } from './processors';

/** One chain: the cabinets on it, in patch order, as [col, row]. */
export type Run = Array<[number, number]>;

export type RunKind = 'data' | 'power';

export interface CustomRuns {
  data: Run[];
  power: Run[];
}

export const EMPTY_CUSTOM_RUNS: CustomRuns = { data: [], power: [] };

export const runsOf = (runs: CustomRuns | undefined, kind: RunKind): Run[] =>
  (kind === 'data' ? runs?.data : runs?.power) ?? [];

/** The same set with one chain replaced, kept immutable for the store. */
export function withRun(runs: CustomRuns | undefined, kind: RunKind, index: number, run: Run): CustomRuns {
  const base: CustomRuns = { data: runs?.data ?? [], power: runs?.power ?? [] };
  const list = [...runsOf(base, kind)];
  if (index < 0 || index > list.length) return base;
  list[index] = run;
  return kind === 'data' ? { ...base, data: list } : { ...base, power: list };
}

/** The same set with one chain dropped. */
export function withoutRun(runs: CustomRuns | undefined, kind: RunKind, index: number): CustomRuns {
  const base: CustomRuns = { data: runs?.data ?? [], power: runs?.power ?? [] };
  const list = runsOf(base, kind).filter((_, i) => i !== index);
  return kind === 'data' ? { ...base, data: list } : { ...base, power: list };
}

/** True when nothing has been drawn for either kind. */
export const isEmpty = (runs: CustomRuns | undefined) =>
  !runs || (runs.data.length === 0 && runs.power.length === 0);

export const cellKey = ([col, row]: [number, number]) => `${col},${row}`;

export const sameCell = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];

export const inBounds = (layer: Layer, [col, row]: [number, number]) =>
  col >= 0 && row >= 0 && col < layer.cols && row < layer.rows;

/**
 * Cabinets that touch along an edge.
 *
 * Diagonals are not adjacent. Two cabinets meeting at a corner have no edge
 * to run a jumper across, so a chain that steps diagonally is describing a
 * cable that goes somewhere the drawing does not show.
 */
export const areAdjacent = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

export const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The cabinet one step from `cell`, or null if that is off the wall. */
export function stepFrom(layer: Layer, cell: [number, number], key: string): [number, number] | null {
  const delta = ARROW_STEPS[key];
  if (!delta) return null;
  const next: [number, number] = [cell[0] + delta[0], cell[1] + delta[1]];
  return inBounds(layer, next) ? next : null;
}

/** Every cabinet already on a run of this kind, optionally ignoring one run. */
export function takenCells(runs: Run[], ignoreIndex = -1): Set<string> {
  const taken = new Set<string>();
  runs.forEach((run, i) => {
    if (i === ignoreIndex) return;
    for (const cell of run) taken.add(cellKey(cell));
  });
  return taken;
}

export type AppendRefusal = 'off-wall' | 'already-on-this-run' | 'on-another-run' | 'not-touching';

export interface AppendResult {
  run: Run;
  added: boolean;
  refused?: AppendRefusal;
}

/**
 * Add one cabinet to the end of a run.
 *
 * The rules are the drawing aids. A cabinet already on this chain, or on
 * another chain of the same kind, is refused rather than silently patched
 * twice — double-patching is the mistake this whole view exists to catch.
 * A cabinet that does not touch the last one is refused too, which is what
 * makes tracing forgiving: drag quickly, skip over a cabinet, and the chain
 * does not leap the gap behind your pointer. `allowJump` is the deliberate
 * override for a chain that really does cross the wall.
 *
 * Re-touching the previous cabinet steps back, so a trace can be undone by
 * dragging back along itself.
 */
export function appendCell(
  layer: Layer,
  run: Run,
  cell: [number, number],
  { allowJump = false, taken }: { allowJump?: boolean; taken?: Set<string> } = {}
): AppendResult {
  if (!inBounds(layer, cell)) return { run, added: false, refused: 'off-wall' };

  const last = run[run.length - 1];
  if (last && sameCell(last, cell)) return { run, added: false };

  // Dragging back onto the one before retracts, so a wrong turn is undone by
  // reversing over it rather than starting again.
  const previous = run[run.length - 2];
  if (previous && sameCell(previous, cell)) return { run: run.slice(0, -1), added: true };

  if (run.some((c) => sameCell(c, cell))) return { run, added: false, refused: 'already-on-this-run' };
  if (taken?.has(cellKey(cell))) return { run, added: false, refused: 'on-another-run' };
  if (last && !allowJump && !areAdjacent(last, cell)) return { run, added: false, refused: 'not-touching' };

  return { run: [...run, cell], added: true };
}

/** What one run of this kind may carry on this screen. */
export interface RunCapacity {
  /** Most cabinets one run may hold, or null where nothing caps it. */
  cabinets: number | null;
  /** Pixels down a port, or watts on a circuit. */
  budget: number | null;
  perCabinet: number | null;
  unit: 'px' | 'W';
  /** Which ceiling bound it, in words, for the running total to show. */
  limitedBy: string;
}

export function capacityFor(
  kind: RunKind,
  layer: Layer,
  settings: CablingSettings,
  processor: Processor
): RunCapacity {
  if (kind === 'data') {
    const perCabinet = layer.spec.resolution.w * layer.spec.resolution.h;
    const budget = pixelsPerPortAt(processor, settings.bitDepth, settings.refreshHz);
    const byPixels = Math.max(1, Math.floor(budget / Math.max(1, perCabinet)));
    const byChain = Math.max(1, Math.floor(settings.maxCabinetsPerChain));
    const byPort = processor.maxCabinetsPerPort;

    const named: Array<[number, string]> = [
      [byPixels, `${processor.model} port capacity at ${settings.bitDepth}-bit ${settings.refreshHz} Hz`],
      ...(byPort == null ? [] : ([[byPort, `${processor.model} addresses ${byPort} per port`]] as Array<[number, string]>)),
      [byChain, `chain kept to ${byChain} cabinets`],
    ];
    const [cabinets, limitedBy] = named.reduce((a, b) => (b[0] < a[0] ? b : a));
    return { cabinets, budget, perCabinet, unit: 'px', limitedBy };
  }

  const perCabinet = layer.spec.power?.max ?? null;
  const budget = settings.supplyVoltage * settings.maxAmpsPerCircuit * settings.circuitUtilisation;
  if (!perCabinet || perCabinet <= 0) {
    // No published figure, so there is nothing to measure a circuit against.
    // Saying so beats inventing a watt.
    return {
      cabinets: Math.max(1, Math.floor(settings.cabinetsPerPowerRun)),
      budget: null,
      perCabinet: null,
      unit: 'W',
      limitedBy: 'no published panel power — using the figure set by hand',
    };
  }
  return {
    cabinets: Math.max(1, Math.floor(budget / perCabinet)),
    budget,
    perCabinet,
    unit: 'W',
    limitedBy: `${settings.maxAmpsPerCircuit} A at ${settings.supplyVoltage} V, ${Math.round(
      settings.circuitUtilisation * 100
    )}% loaded`,
  };
}

/** What a run draws, against what it is allowed. */
export interface RunLoad extends RunCapacity {
  count: number;
  used: number | null;
  /** 0..1 against the cabinet ceiling, past 1 when over. */
  fraction: number;
  over: boolean;
}

export function loadFor(
  kind: RunKind,
  layer: Layer,
  run: Run,
  settings: CablingSettings,
  processor: Processor
): RunLoad {
  const capacity = capacityFor(kind, layer, settings, processor);
  const count = run.length;
  const used = capacity.perCabinet == null ? null : count * capacity.perCabinet;
  const ceiling = capacity.cabinets;
  return {
    ...capacity,
    count,
    used,
    fraction: ceiling ? count / ceiling : 0,
    over: ceiling != null && count > ceiling,
  };
}

/** How a whole drawn plan stands: what is over, doubled up, or left out. */
export interface RunsReport {
  runs: RunLoad[];
  overRuns: number[];
  patched: number;
  unpatched: number;
  /** Cabinets that ended up on more than one run, which should never happen. */
  doubled: string[];
}

export function reportFor(
  kind: RunKind,
  layer: Layer,
  runs: Run[],
  settings: CablingSettings,
  processor: Processor
): RunsReport {
  const loads = runs.map((run) => loadFor(kind, layer, run, settings, processor));
  const seen = new Set<string>();
  const doubled = new Set<string>();
  for (const run of runs) {
    for (const cell of run) {
      const key = cellKey(cell);
      if (seen.has(key)) doubled.add(key);
      seen.add(key);
    }
  }
  const patched = seen.size;
  return {
    runs: loads,
    overRuns: loads.map((l, i) => (l.over ? i : -1)).filter((i) => i >= 0),
    patched,
    unpatched: Math.max(0, layer.cols * layer.rows - patched),
    doubled: [...doubled],
  };
}
