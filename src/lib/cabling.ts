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
}

export const DEFAULT_CABLING: CablingSettings = {
  mode: 'auto',
  cabinetsPerDataRun: 8,
  cabinetsPerPowerRun: 6,
  supplyVoltage: 230,
  maxAmpsPerCircuit: 16,
  circuitUtilisation: 0.8,
};

export interface RunPlan {
  cabinetsPerRun: number;
  runs: number;
  feedCables: number;
  jumperCables: number;
  /** Why the chain length came out as it did — shown in the UI. */
  limitedBy: string;
}

export interface ScreenCabling {
  layerId: string;
  layerName: string;
  cabinets: number;
  data: RunPlan;
  power: RunPlan;
  /** Cabinet order along each data run, for the manual patch view. */
  runOrder: Array<Array<[number, number]>>;
}

/** Split a chain into runs and count the cables it takes. */
function plan(cabinets: number, perRun: number, limitedBy: string): RunPlan {
  const size = Math.max(1, Math.floor(perRun));
  const runs = Math.max(1, Math.ceil(cabinets / size));
  return {
    cabinetsPerRun: size,
    runs,
    // One feed per run; every other cabinet in a run is reached by a jumper.
    feedCables: runs,
    jumperCables: Math.max(0, cabinets - runs),
    limitedBy,
  };
}

export function cablingForLayer(
  layer: Layer,
  settings: CablingSettings,
  processor: Processor
): ScreenCabling {
  const cabinets = layer.cols * layer.rows;
  const pixelsEach = layer.spec.resolution.w * layer.spec.resolution.h;

  let dataPerRun = settings.cabinetsPerDataRun;
  let dataLimit = 'set by hand';
  if (settings.mode === 'auto') {
    dataPerRun = Math.max(1, Math.floor(pixelsPerPort(processor) / Math.max(1, pixelsEach)));
    dataLimit = `${processor.model} port capacity`;
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

  const data = plan(cabinets, dataPerRun, dataLimit);
  const order = signalOrder(layer);
  const runOrder: Array<Array<[number, number]>> = [];
  for (let i = 0; i < order.length; i += data.cabinetsPerRun) {
    runOrder.push(order.slice(i, i + data.cabinetsPerRun));
  }

  return {
    layerId: layer.id,
    layerName: layer.name,
    cabinets,
    data,
    power: plan(cabinets, powerPerRun, powerLimit),
    runOrder,
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
  };
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
