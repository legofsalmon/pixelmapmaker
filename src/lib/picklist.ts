/**
 * Turns a project into a prep list: what to pull from the store, in the
 * quantities you would actually pull it.
 */
import type { Layer } from './types';
import type { Processor } from './processors';
import type { CablingSettings } from './cabling';
import { cablingForProject, processorsRequired } from './cabling';
import { planPower, type PowerPlan, type PowerSettings } from './power';

export type LineCategory = 'Cabinets' | 'Processing' | 'Data' | 'Power' | 'Transport';

export interface PickLineInput {
  category: LineCategory;
  item: string;
  detail?: string;
  /** Straight count before contingency or pack rounding. */
  required: number;
  unit: string;
  /** Items that come in a box/case/bundle round up to a multiple of this. */
  packSize?: number;
  packName?: string;
  /** Spares make no sense on some lines (a processor chassis, say). */
  contingency?: boolean;
}

export interface PickLine extends PickLineInput {
  withContingency: number;
  /** Final quantity to pull, after contingency and pack rounding. */
  quantity: number;
  packs?: number;
}

export interface PickListOptions {
  /** 0.1 for the usual 10%. */
  contingency: number;
  roundToPacks: boolean;
  /** Cabinets per flight case; 0 leaves transport off the list. */
  cabinetsPerCase: number;
  cablesPerBundle: number;
}

export const DEFAULT_PICKLIST_OPTIONS: PickListOptions = {
  contingency: 0.1,
  roundToPacks: true,
  cabinetsPerCase: 6,
  cablesPerBundle: 10,
};

function applyRules(line: PickLineInput, options: PickListOptions): PickLine {
  const contingent =
    line.contingency === false
      ? line.required
      : Math.ceil(line.required * (1 + options.contingency));

  if (!options.roundToPacks || !line.packSize || line.packSize < 2) {
    return { ...line, withContingency: contingent, quantity: contingent };
  }
  const packs = Math.ceil(contingent / line.packSize);
  return {
    ...line,
    withContingency: contingent,
    quantity: packs * line.packSize,
    packs,
  };
}

export function buildPickList(
  layers: Layer[],
  settings: CablingSettings,
  processor: Processor,
  options: PickListOptions,
  power: PowerSettings
): {
  lines: PickLine[];
  cabling: ReturnType<typeof cablingForProject>;
  processors: ReturnType<typeof processorsRequired>;
  power: PowerPlan;
} {
  const cabling = cablingForProject(layers, settings, processor);
  const powerPlan = planPower(layers, settings, cabling, power);
  const totalPixels = layers.reduce(
    (sum, l) => sum + l.cols * l.rows * l.spec.resolution.w * l.spec.resolution.h,
    0
  );
  const procs = processorsRequired(totalPixels, cabling.dataRuns, processor);

  const inputs: PickLineInput[] = [];

  // One line per distinct cabinet, since you pull them by model.
  const byModel = new Map<string, { layerNames: string[]; count: number; layer: Layer }>();
  for (const layer of layers) {
    const key = `${layer.spec.brand} ${layer.spec.model}`;
    const entry = byModel.get(key) ?? { layerNames: [], count: 0, layer };
    entry.count += layer.cols * layer.rows;
    entry.layerNames.push(layer.name);
    byModel.set(key, entry);
  }
  for (const [model, entry] of byModel) {
    // Screens are named after their cabinet by default; only name them when
    // the user has renamed them, otherwise the detail just echoes the item.
    const named = entry.layerNames.filter((n) => n !== model);
    inputs.push({
      category: 'Cabinets',
      item: model,
      detail: [`${entry.layer.spec.pixelPitch} mm pitch`, ...(named.length ? [named.join(', ')] : [])].join(
        ' · '
      ),
      required: entry.count,
      unit: 'panels',
      packSize: options.cabinetsPerCase > 1 ? options.cabinetsPerCase : undefined,
      packName: 'case',
    });
  }

  inputs.push({
    category: 'Processing',
    item: `${processor.brand} ${processor.model}`,
    detail: `${procs.byPixels} by pixel count, ${procs.byPorts} by port count — ${procs.limitedBy} decides`,
    required: procs.count,
    unit: 'units',
    contingency: false,
  });

  inputs.push({
    category: 'Data',
    item: 'Data feed cable',
    detail: `one per run, ${cabling.dataRuns} runs`,
    required: cabling.dataFeeds,
    unit: 'cables',
    packSize: options.cablesPerBundle > 1 ? options.cablesPerBundle : undefined,
    packName: 'bundle',
  });
  inputs.push({
    category: 'Data',
    item: 'Data jumper (panel to panel)',
    required: cabling.dataJumpers,
    unit: 'cables',
    packSize: options.cablesPerBundle > 1 ? options.cablesPerBundle : undefined,
    packName: 'bundle',
  });

  inputs.push({
    category: 'Power',
    item: 'Power feed cable',
    detail: `one per circuit, ${cabling.powerRuns} circuits`,
    required: cabling.powerFeeds,
    unit: 'cables',
    packSize: options.cablesPerBundle > 1 ? options.cablesPerBundle : undefined,
    packName: 'bundle',
  });
  inputs.push({
    category: 'Power',
    item: 'Power jumper (panel to panel)',
    required: cabling.powerJumpers,
    unit: 'cables',
    packSize: options.cablesPerBundle > 1 ? options.cablesPerBundle : undefined,
    packName: 'bundle',
  });
  inputs.push({
    category: 'Power',
    item: 'Distro circuits',
    detail: `${settings.maxAmpsPerCircuit} A at ${settings.supplyVoltage} V`,
    required: cabling.powerRuns,
    unit: 'circuits',
    contingency: false,
  });

  /*
   * The distro and its feed. Circuits above are the ways; these are the boxes
   * the ways come out of and the service that feeds them, which is the part
   * somebody has to ask the venue for weeks ahead.
   */
  if (powerPlan.distros > 0) {
    inputs.push({
      category: 'Power',
      item: `Distro, ${powerPlan.supply.label}`,
      detail: `${powerPlan.waysPerDistro} ways each, ${powerPlan.ways.length} used`,
      required: powerPlan.distros,
      unit: 'units',
      contingency: false,
    });
    inputs.push({
      category: 'Power',
      item: 'Service feed',
      detail: [
        `${powerPlan.worstLegAmps.toFixed(0)} A on the worst leg`,
        powerPlan.recommendedService != null
          ? `${powerPlan.recommendedService} A${powerPlan.connector ? ` — ${powerPlan.connector}` : ''}`
          : 'larger than anything stocked — split the wall',
      ].join(' · '),
      required: 1,
      unit: powerPlan.supply.legs === 3 ? 'three-phase service' : 'single-phase service',
      contingency: false,
    });
  }

  if (options.cabinetsPerCase > 1) {
    const totalPanels = [...byModel.values()].reduce((a, e) => a + e.count, 0);
    inputs.push({
      category: 'Transport',
      item: 'Panel cases',
      detail: `${options.cabinetsPerCase} panels per case`,
      required: Math.ceil(totalPanels / options.cabinetsPerCase),
      unit: 'cases',
      contingency: false,
    });
  }

  return {
    lines: inputs.map((l) => applyRules(l, options)),
    cabling,
    processors: procs,
    power: powerPlan,
  };
}

export function pickListCsv(lines: PickLine[], projectName: string) {
  const rows = [
    ['Project', projectName],
    [],
    ['Category', 'Item', 'Detail', 'Required', 'With contingency', 'To pull', 'Unit'],
    ...lines.map((l) => [
      l.category,
      l.item,
      l.detail ?? '',
      String(l.required),
      String(l.withContingency),
      String(l.quantity),
      l.unit,
    ]),
  ];
  return rows
    .map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
    .join('\n');
}
