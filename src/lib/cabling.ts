/**
 * Data and power runs for a screen.
 *
 * A run is a daisy chain: one feed cable from the processor port or the power
 * distro to the first cabinet, then a short jumper between each cabinet after
 * that. Counting them this way is what a prep list actually needs.
 */
import type { Layer } from './types';
import { signalOrder } from './geometry';
import { pixelsPerPortAt, type Processor } from './processors';

export interface CablingSettings {
  mode: 'auto' | 'manual';
  /** Manual mode: cabinets on one data run and one power run. */
  cabinetsPerDataRun: number;
  cabinetsPerPowerRun: number;
  /** Auto mode inputs. */
  supplyVoltage: number;
  maxAmpsPerCircuit: number;
  /** Derate the circuit so it is not run at 100% of its rating. */
  circuitUtilisation: number;
  /**
   * Longest daisy chain to plan for, whatever the kit would tolerate.
   * Manufacturers' port limits are ceilings, not working figures — Brompton
   * will address 50 fixtures on a chain and NovaStar 512, but nobody rigs a
   * wall that way: cable length, serviceability and the cost of one failed
   * panel taking out the rest of the chain all cap it well below the spec.
   */
  maxCabinetsPerChain: number;
  /**
   * Colour depth in bits per channel, and refresh rate. Both divide a port's
   * pixel capacity: 10-bit costs a fifth of it against 8-bit, and 120 Hz costs
   * half against 60 Hz. Quoted capacities assume a baseline that differs by
   * manufacturer, so each processor is scaled from its own.
   */
  bitDepth: number;
  refreshHz: number;
  /**
   * Finish every run at an edge of the screen rather than wherever the
   * cabinet count runs out.
   *
   * A run that stops in the middle of the wall leaves its tail cable hanging
   * there, to be dressed back across the face or round the frame. Ending on an
   * edge puts every termination where the racks and the distro already are.
   * It is not free: the run has to shorten to a whole number of rows, so the
   * unused capacity turns into extra ports.
   */
  dataRunsEndAtEdge: boolean;
  powerRunsEndAtEdge: boolean;
  /**
   * Close every data run back to a second port.
   *
   * A chain fed from one end fails entirely at the first dead panel or pulled
   * cable. In a closed loop the primary feeds the head and a backup port picks
   * up the tail, so a break anywhere is covered from the other side and the
   * processor swaps over within a frame. Brompton pair two outputs for it and
   * NovaStar call it hot backup; both work the same way on the wall.
   *
   * The cost is exact and worth stating: two ports per run instead of one, and
   * a second feed cable from the far end of every chain back to the rack.
   */
  backupPorts: boolean;
}

export const DEFAULT_CABLING: CablingSettings = {
  mode: 'auto',
  cabinetsPerDataRun: 8,
  cabinetsPerPowerRun: 6,
  supplyVoltage: 230,
  maxAmpsPerCircuit: 16,
  circuitUtilisation: 0.8,
  maxCabinetsPerChain: 16,
  bitDepth: 8,
  refreshHz: 60,
  dataRunsEndAtEdge: false,
  powerRunsEndAtEdge: false,
  backupPorts: false,
};

export interface RunPlan {
  cabinetsPerRun: number;
  runs: number;
  feedCables: number;
  /** Return cables from the tail of each chain to its backup port. */
  backupFeeds: number;
  jumperCables: number;
  /** Why the chain length came out as it did — shown in the UI. */
  limitedBy: string;
}

/** The competing ceilings on one data run, so the UI can show its working. */
export interface DataLimits {
  byPixels: number | null;
  byPort: number | null;
  byChain: number | null;
  /** What the chain would have been before edge alignment shortened it. */
  beforeEdgeAlign: number | null;
}

/**
 * Shorten a run to a whole number of rows (or columns, on a vertical path) so
 * it finishes at the edge of the wall.
 *
 * Returns the original length when a single row already exceeds it: there is
 * no way to end on an edge if one row will not fit down a port, and silently
 * halving the run to one cabinet would be worse than leaving it mid-wall.
 */
export function alignToEdge(perRun: number, layer: Layer) {
  const line = layer.signalPath.startsWith('vertical') ? layer.rows : layer.cols;
  if (line <= 0 || perRun < line) return perRun;
  return Math.floor(perRun / line) * line;
}

export interface ScreenCabling {
  layerId: string;
  layerName: string;
  cabinets: number;
  data: RunPlan;
  power: RunPlan;
  /** Cabinet order along each data run, for the manual patch view. */
  runOrder: Array<Array<[number, number]>>;
  /**
   * The same for power circuits. Power follows the wall in the same order as
   * data here — distros are rigged to the same structure and the same corner —
   * but it is chunked separately, because a circuit holds a different number
   * of cabinets from a port.
   */
  powerOrder: Array<Array<[number, number]>>;
  /** What each ceiling would have allowed, so the UI can show its working. */
  dataLimits: DataLimits;
  /**
   * Hops inside a run between cabinets that are not touching. A serpentine
   * path never has one; a raster path has one at the end of every row, where
   * the chain returns across the full width of the screen. They are counted
   * apart from jumpers because they are a long cable, not a short one.
   */
  longHops: number;
}

/**
 * Split a chain into runs and count the cables it takes.
 *
 * `longHops` are subtracted from the jumper count because they are the same
 * hops, priced differently — counting both would double the cable.
 */
function plan(
  cabinets: number,
  perRun: number,
  limitedBy: string,
  longHops = 0,
  backup = false
): RunPlan {
  const size = Math.max(1, Math.floor(perRun));
  const runs = Math.max(1, Math.ceil(cabinets / size));
  return {
    cabinetsPerRun: size,
    runs,
    // One feed per run; every other cabinet in a run is reached by a jumper.
    feedCables: runs,
    // A loop is closed at the far end, so a backup costs a second long cable
    // per run — from the tail of the chain back to the rack, not a jumper.
    backupFeeds: backup ? runs : 0,
    jumperCables: Math.max(0, cabinets - runs - longHops),
    limitedBy,
  };
}

/** Are two cabinets edge-to-edge, so a short jumper reaches between them? */
const adjacent = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

export function cablingForLayer(
  layer: Layer,
  settings: CablingSettings,
  processor: Processor
): ScreenCabling {
  const cabinets = layer.cols * layer.rows;
  const pixelsEach = layer.spec.resolution.w * layer.spec.resolution.h;

  /*
   * Three separate ceilings, and the run is the smallest of them. Sizing a run
   * on pixel capacity alone is what put 200 cabinets on one 10G port: the port
   * has the bandwidth, but nothing will address that many and nobody could rig
   * it. Naming whichever one actually bound matters as much as the number —
   * "port capacity" on a chain the port capacity did not limit is a lie the
   * user would carry to site.
   */
  const limits: DataLimits = { byPixels: null, byPort: null, byChain: null, beforeEdgeAlign: null };
  let dataPerRun = settings.cabinetsPerDataRun;
  let dataLimit = 'set by hand';
  if (settings.mode === 'auto') {
    const perPort = pixelsPerPortAt(processor, settings.bitDepth, settings.refreshHz);
    limits.byPixels = Math.max(1, Math.floor(perPort / Math.max(1, pixelsEach)));
    limits.byPort = processor.maxCabinetsPerPort;
    limits.byChain = Math.max(1, Math.floor(settings.maxCabinetsPerChain));

    const depth = `${settings.bitDepth}-bit ${settings.refreshHz} Hz`;
    const named: Array<[number, string]> = [
      [limits.byPixels, `${processor.model} port capacity at ${depth}`],
      ...(limits.byPort === null
        ? []
        : ([[limits.byPort, `${processor.model} addresses ${limits.byPort} per port`]] as Array<[number, string]>)),
      [limits.byChain, `chain kept to ${limits.byChain} cabinets`],
    ];
    // Smallest wins; on a tie the earlier entry does, so a hard published
    // limit is named before the planning figure that merely matches it.
    const [best, why] = named.reduce((a, b) => (b[0] < a[0] ? b : a));
    dataPerRun = Math.max(1, best);
    dataLimit = why;
  }

  if (settings.dataRunsEndAtEdge) {
    const aligned = alignToEdge(dataPerRun, layer);
    if (aligned < dataPerRun) {
      limits.beforeEdgeAlign = dataPerRun;
      dataPerRun = aligned;
      dataLimit = `${dataLimit}, shortened to end at the edge`;
    }
  }

  let powerPerRun = settings.cabinetsPerPowerRun;
  let powerLimit = 'set by hand';
  if (settings.mode === 'auto') {
    const watts = layer.spec.power?.max ?? null;
    if (watts && watts > 0) {
      const circuitWatts = settings.supplyVoltage * settings.maxAmpsPerCircuit * settings.circuitUtilisation;
      powerPerRun = Math.max(1, Math.floor(circuitWatts / watts));
      powerLimit = `${settings.maxAmpsPerCircuit} A at ${settings.supplyVoltage} V, ${Math.round(
        settings.circuitUtilisation * 100
      )}% loaded`;
    } else {
      // No published power figure — fall back rather than invent a number.
      powerPerRun = settings.cabinetsPerPowerRun;
      powerLimit = 'no published panel power — using the manual figure';
    }
  }

  if (settings.powerRunsEndAtEdge) {
    const aligned = alignToEdge(powerPerRun, layer);
    if (aligned < powerPerRun) {
      powerPerRun = aligned;
      powerLimit = `${powerLimit}, shortened to end at the edge`;
    }
  }

  const order = signalOrder(layer);
  const perRun = Math.max(1, Math.floor(dataPerRun));
  const runOrder: Array<Array<[number, number]>> = [];
  for (let i = 0; i < order.length; i += perRun) {
    runOrder.push(order.slice(i, i + perRun));
  }

  // Count the hops within a run that cross the screen rather than step to the
  // neighbour. Hops *between* runs are not cable at all — each run starts
  // again at the processor — so this only ever looks inside a run.
  let longHops = 0;
  for (const run of runOrder) {
    for (let i = 1; i < run.length; i++) if (!adjacent(run[i - 1], run[i])) longHops++;
  }

  const perPowerRun = Math.max(1, Math.floor(powerPerRun));
  const powerOrder: Array<Array<[number, number]>> = [];
  for (let i = 0; i < order.length; i += perPowerRun) {
    powerOrder.push(order.slice(i, i + perPowerRun));
  }

  return {
    layerId: layer.id,
    layerName: layer.name,
    cabinets,
    data: plan(cabinets, perRun, dataLimit, longHops, settings.backupPorts),
    power: plan(cabinets, perPowerRun, powerLimit),
    runOrder,
    powerOrder,
    dataLimits: limits,
    longHops,
  };
}

export function cablingForProject(
  layers: Layer[],
  settings: CablingSettings,
  processor: Processor
) {
  const screens = layers.map((l) => cablingForLayer(l, settings, processor));
  return {
    screens,
    dataRuns: screens.reduce((a, s) => a + s.data.runs, 0),
    powerRuns: screens.reduce((a, s) => a + s.power.runs, 0),
    dataFeeds: screens.reduce((a, s) => a + s.data.feedCables, 0),
    dataJumpers: screens.reduce((a, s) => a + s.data.jumperCables, 0),
    powerFeeds: screens.reduce((a, s) => a + s.power.feedCables, 0),
    powerJumpers: screens.reduce((a, s) => a + s.power.jumperCables, 0),
    backupFeeds: screens.reduce((a, s) => a + s.data.backupFeeds, 0),
    /**
     * Ports the project actually occupies. A closed loop holds two — the
     * processor count has to be worked out from this and not from the run
     * count, or a redundant system is specified with half the kit it needs.
     */
    portsNeeded: screens.reduce((a, s) => a + s.data.runs * (settings.backupPorts ? 2 : 1), 0),
    longHops: screens.reduce((a, s) => a + s.longHops, 0),
  };
}

/**
 * Hand every data run in the project a real port on a real processor.
 *
 * Runs used to be numbered from 1 within each screen, so a two-screen project
 * patched both screens into "Port 1" and "Port 2" of the same box — and
 * nothing stopped a 4-port processor being told to use port 12. Ports are a
 * project-wide resource, so they are dealt out here, rolling onto the next
 * processor when one runs out of outputs.
 */
export interface PortAssignment {
  /** 1-based, across the whole project. */
  processor: number;
  port: number;
  label: string;
  /** The port closing the loop at the far end, when backup is on. */
  backup?: { processor: number; port: number; label: string };
}

export function assignPorts(
  screens: ScreenCabling[],
  processor: Processor,
  processorCount: number,
  backup = false
): Map<string, PortAssignment[]> {
  const perBox = Math.max(1, processor.ports);
  const byLayer = new Map<string, PortAssignment[]>();
  let next = 0;
  const take = () => {
    const box = Math.floor(next / perBox) + 1;
    const port = (next % perBox) + 1;
    next++;
    // With one box in the project its name is noise on every line.
    return { processor: box, port, label: processorCount > 1 ? `Processor ${box}, port ${port}` : `Port ${port}` };
  };
  for (const screen of screens) {
    const list: PortAssignment[] = [];
    for (let i = 0; i < screen.data.runs; i++) {
      // Primary and backup are taken together so a loop's two ends are
      // adjacent on the rack, which is how it gets patched.
      const primary = take();
      list.push(backup ? { ...primary, backup: take() } : primary);
    }
    byLayer.set(screen.layerId, list);
  }
  return byLayer;
}

/** Processors needed to cover both the pixel count and the port count. */
export function processorsRequired(
  totalPixels: number,
  /** Ports the project occupies — two per run when loops are closed. */
  totalPorts: number,
  processor: Processor
) {
  const byPixels = Math.ceil(totalPixels / Math.max(1, processor.totalPixels));
  const byPorts = Math.ceil(totalPorts / Math.max(1, processor.ports));
  return {
    count: Math.max(1, byPixels, byPorts),
    byPixels,
    byPorts,
    limitedBy: byPorts > byPixels ? 'port count' : 'pixel capacity',
  };
}


/**
 * The per-layer run data every drawing of a wall needs: how long a chain is,
 * and what each one is called.
 *
 * This used to be computed inside the canvas component, which meant the live
 * view knew about the plan and the exports did not — an exported PNG drew one
 * unbroken chain through the whole screen with no labels and no power at all,
 * whatever the settings said. The export is the drawing that goes to site, so
 * it was the worse half to have wrong. Both call this now.
 */
export interface RunOverlays {
  runLengths: Map<string, number>;
  runLabels: Map<string, string[]>;
  powerLengths: Map<string, number>;
  powerLabels: Map<string, string[]>;
}

export function runOverlays(
  layers: Layer[],
  settings: CablingSettings,
  processor: Processor,
  processorCount?: number
): RunOverlays {
  const runLengths = new Map<string, number>();
  const powerLengths = new Map<string, number>();
  const powerLabels = new Map<string, string[]>();

  for (const layer of layers) {
    // Only what is actually being drawn: a wall with both overlays off costs
    // nothing, and on a big project that matters on every frame.
    if (!layer.showSignalFlow && !layer.showPowerRuns) continue;
    const plan = cablingForLayer(layer, settings, processor);
    if (layer.showSignalFlow) runLengths.set(layer.id, plan.data.cabinetsPerRun);
    if (layer.showPowerRuns) {
      powerLengths.set(layer.id, plan.power.cabinetsPerRun);
      // Circuits are numbered per screen: a distro feeds a wall, where a
      // processor's ports are shared across the whole project.
      powerLabels.set(layer.id, plan.powerOrder.map((_, i) => `Circuit ${i + 1}`));
    }
  }

  // Ports are dealt out over every screen, not just the ones being drawn, or
  // the labels on the canvas would disagree with the pick list.
  const plan = cablingForProject(layers, settings, processor);
  const boxes = processorCount ?? 1;
  const runLabels = new Map<string, string[]>();
  for (const [id, list] of assignPorts(plan.screens, processor, boxes, settings.backupPorts)) {
    // The tail label names the port that closes the loop, so a run reads
    // "in from 1, out to 2" on the drawing the way it is patched.
    runLabels.set(id, list.map((x) => (x.backup ? `${x.label} \u2192 ${x.backup.label}` : x.label)));
  }
  return { runLengths, runLabels, powerLengths, powerLabels };
}
