/**
 * Data and power runs for a screen.
 *
 * A run is a daisy chain: one feed cable from the processor port or the power
 * distro to the first cabinet, then a short jumper between each cabinet after
 * that. Counting them this way is what a prep list actually needs.
 */
import type { Layer } from './types';
import { signalOrder } from './geometry';
import { pixelsPerPort, type Processor } from './processors';

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
}

export const DEFAULT_CABLING: CablingSettings = {
  mode: 'auto',
  cabinetsPerDataRun: 8,
  cabinetsPerPowerRun: 6,
  supplyVoltage: 230,
  maxAmpsPerCircuit: 16,
  circuitUtilisation: 0.8,
  maxCabinetsPerChain: 16,
};

export interface RunPlan {
  cabinetsPerRun: number;
  runs: number;
  feedCables: number;
  jumperCables: number;
  /** Why the chain length came out as it did — shown in the UI. */
  limitedBy: string;
}

/** The competing ceilings on one data run, so the UI can show its working. */
export interface DataLimits {
  byPixels: number | null;
  byPort: number | null;
  byChain: number | null;
}

export interface ScreenCabling {
  layerId: string;
  layerName: string;
  cabinets: number;
  data: RunPlan;
  power: RunPlan;
  /** Cabinet order along each data run, for the manual patch view. */
  runOrder: Array<Array<[number, number]>>;
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
function plan(cabinets: number, perRun: number, limitedBy: string, longHops = 0): RunPlan {
  const size = Math.max(1, Math.floor(perRun));
  const runs = Math.max(1, Math.ceil(cabinets / size));
  return {
    cabinetsPerRun: size,
    runs,
    // One feed per run; every other cabinet in a run is reached by a jumper.
    feedCables: runs,
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
  const limits: DataLimits = { byPixels: null, byPort: null, byChain: null };
  let dataPerRun = settings.cabinetsPerDataRun;
  let dataLimit = 'set by hand';
  if (settings.mode === 'auto') {
    limits.byPixels = Math.max(1, Math.floor(pixelsPerPort(processor) / Math.max(1, pixelsEach)));
    limits.byPort = processor.maxCabinetsPerPort;
    limits.byChain = Math.max(1, Math.floor(settings.maxCabinetsPerChain));

    const named: Array<[number, string]> = [
      [limits.byPixels, `${processor.model} port capacity`],
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

  return {
    layerId: layer.id,
    layerName: layer.name,
    cabinets,
    data: plan(cabinets, perRun, dataLimit, longHops),
    power: plan(cabinets, powerPerRun, powerLimit),
    runOrder,
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
}

export function assignPorts(
  screens: ScreenCabling[],
  processor: Processor,
  processorCount: number
): Map<string, PortAssignment[]> {
  const perBox = Math.max(1, processor.ports);
  const byLayer = new Map<string, PortAssignment[]>();
  let next = 0;
  for (const screen of screens) {
    const list: PortAssignment[] = [];
    for (let i = 0; i < screen.data.runs; i++) {
      const box = Math.floor(next / perBox) + 1;
      const port = (next % perBox) + 1;
      list.push({
        processor: box,
        port,
        // With one box in the project its name is noise on every line.
        label: processorCount > 1 ? `Processor ${box}, port ${port}` : `Port ${port}`,
      });
      next++;
    }
    byLayer.set(screen.layerId, list);
  }
  return byLayer;
}

/** Processors needed to cover both the pixel count and the port count. */
export function processorsRequired(
  totalPixels: number,
  totalDataRuns: number,
  processor: Processor
) {
  const byPixels = Math.ceil(totalPixels / Math.max(1, processor.totalPixels));
  const byPorts = Math.ceil(totalDataRuns / Math.max(1, processor.ports));
  return {
    count: Math.max(1, byPixels, byPorts),
    byPixels,
    byPorts,
    limitedBy: byPorts > byPixels ? 'port count' : 'pixel capacity',
  };
}
