'use client';

import { create } from 'zustand';
import type { CabinetSpec, Layer, Project } from '@/lib/types';
import { CABINETS } from '@/lib/cabinets';
import { DEFAULT_PALETTE, PALETTES, nextColor } from '@/lib/palettes';
import { contentBounds, layerRect } from '@/lib/geometry';
import { loadWorking, migrateFromLocalStorage, saveWorking } from '@/lib/projectStore';
import { requestPersistence } from '@/lib/idb';
import { DEFAULT_CABLING, type CablingSettings } from '@/lib/cabling';
import { FLAT_SHAPE, normaliseShape } from '@/lib/curve';
import { DEFAULT_PICKLIST_OPTIONS, type PickListOptions } from '@/lib/picklist';
import { DEFAULT_SUPPORT, type SupportSettings } from '@/lib/support';
import { DEFAULT_POWER, type PowerSettings } from '@/lib/power';
import { DEFAULT_EFFECT, type EffectSettings } from '@/lib/effects';
import { DEFAULT_AUDIENCE, type AudienceSettings } from '@/lib/viewing';
import { DEFAULT_AMBIENT, type AmbientSettings } from '@/lib/contrast';
import type { Processor } from '@/lib/processors';

const CANVAS_PRESETS = [
  { name: 'HD 1920 × 1080', width: 1920, height: 1080 },
  { name: 'UHD 3840 × 2160', width: 3840, height: 2160 },
  { name: '2K DCI 2048 × 1080', width: 2048, height: 1080 },
  { name: '4K DCI 4096 × 2160', width: 4096, height: 2160 },
  { name: 'Dual HD 3840 × 1080', width: 3840, height: 1080 },
  { name: '8K 7680 × 4320', width: 7680, height: 4320 },
] as const;

export { CANVAS_PRESETS };

const HISTORY_LIMIT = 60;

let layerCounter = 0;
const newId = () => `layer-${Date.now().toString(36)}-${(layerCounter++).toString(36)}`;

/** A sensible default so the canvas is never empty on first load. */
function seedLayer(): Layer {
  const spec = CABINETS.find((c) => c.model === 'BP2V2') ?? CABINETS[0];
  return makeLayer(spec, 0, { cols: 10, rows: 6 });
}

export function makeLayer(
  spec: CabinetSpec,
  index: number,
  overrides: Partial<Layer> = {}
): Layer {
  return {
    id: newId(),
    name: `${spec.brand} ${spec.model}`,
    spec,
    cols: 8,
    rows: 4,
    // Its own copy, since the inspector edits a layer's shape in place.
    shape: { ...FLAT_SHAPE, folds: [] },
    x: 0,
    y: 0,
    visible: true,
    locked: false,
    color: nextColor(DEFAULT_PALETTE, index),
    showNumbers: true,
    showSignalFlow: false,
    signalStart: 'tl',
    signalPath: 'serpentine',
    checkerAmount: 0.12,
    label: '',
    logo: null,
    logoScale: 0.3,
    logoOpacity: 1,
    ...overrides,
  };
}

export type AlignEdge = 'left' | 'hcentre' | 'right' | 'top' | 'vcentre' | 'bottom';

interface Snapshot {
  canvas: Project['canvas'];
  layers: Layer[];
}

interface EditorState extends Project {
  paletteId: string;
  snapEnabled: boolean;
  processorId: string;
  cabling: CablingSettings;
  pickList: PickListOptions;
  support: SupportSettings;
  power: PowerSettings;
  effect: EffectSettings;
  audience: AudienceSettings;
  ambient: AmbientSettings;
  customProcessors: Processor[];
  past: Snapshot[];
  future: Snapshot[];
  /**
   * Why the working project could not be saved, or null while it is saving
   * fine. Swallowing this was the single worst failure in the app: past the
   * storage ceiling the autosave simply stopped, the user carried on working,
   * and a reload took them back to the last save that happened to fit.
   */
  storageError: string | null;

  addLayer: (spec: CabinetSpec) => void;
  duplicateLayer: (id: string) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  moveLayerBy: (ids: string[], dx: number, dy: number) => void;
  reorderLayer: (id: string, direction: 'up' | 'down') => void;
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;

  updateManyLayers: (ids: string[], patch: Partial<Layer>) => void;
  duplicateSelection: () => void;
  removeSelection: () => void;
  alignLayers: (edge: AlignEdge) => void;
  distributeLayers: (axis: 'horizontal' | 'vertical') => void;
  spaceLayers: (axis: 'horizontal' | 'vertical', gap: number) => void;

  setCanvas: (patch: Partial<Project['canvas']>) => void;
  setPalette: (id: string) => void;
  setSnapEnabled: (on: boolean) => void;
  setProjectName: (name: string) => void;
  setProcessor: (id: string) => void;
  setCabling: (patch: Partial<CablingSettings>) => void;
  setPickList: (patch: Partial<PickListOptions>) => void;
  setSupport: (patch: Partial<SupportSettings>) => void;
  setPower: (patch: Partial<PowerSettings>) => void;
  setEffect: (patch: Partial<EffectSettings>) => void;
  setAudience: (patch: Partial<AudienceSettings>) => void;
  setAmbient: (patch: Partial<AmbientSettings>) => void;
  addCustomProcessor: (processor: Processor) => void;
  removeCustomProcessor: (id: string) => void;

  fitCanvasToContent: () => void;
  centreSelection: () => void;
  tileLayersHorizontally: () => void;

  commit: () => void;
  undo: () => void;
  redo: () => void;

  loadProject: (project: Partial<Project>) => void;
  resetProject: () => void;
  serialise: () => string;
}

const snapshot = (s: EditorState): Snapshot => ({
  canvas: { ...s.canvas },
  layers: s.layers.map((l) => ({ ...l })),
});

const initialCanvas: Project['canvas'] = {
  width: 3840,
  height: 2160,
  background: '#0b0d12',
  showCanvasGuides: false,
  maskOutsideScreens: false,
  showRuler: true,
  effectScope: 'canvas',
};

export const useEditor = create<EditorState>((set, get) => ({
  name: 'Untitled map',
  canvas: initialCanvas,
  layers: [seedLayer()],
  selectedIds: [],
  paletteId: DEFAULT_PALETTE.id,
  snapEnabled: true,
  processorId: 'brompton-sx40',
  cabling: DEFAULT_CABLING,
  pickList: DEFAULT_PICKLIST_OPTIONS,
  support: DEFAULT_SUPPORT,
  power: DEFAULT_POWER,
  effect: DEFAULT_EFFECT,
  audience: DEFAULT_AUDIENCE,
  ambient: DEFAULT_AMBIENT,
  customProcessors: [],
  past: [],
  future: [],
  storageError: null,

  commit: () =>
    set((s) => ({
      past: [...s.past, snapshot(s)].slice(-HISTORY_LIMIT),
      future: [],
    })),

  undo: () =>
    set((s) => {
      const previous = s.past[s.past.length - 1];
      if (!previous) return s;
      return {
        past: s.past.slice(0, -1),
        future: [snapshot(s), ...s.future].slice(0, HISTORY_LIMIT),
        canvas: previous.canvas,
        layers: previous.layers,
        selectedIds: s.selectedIds.filter((id) => previous.layers.some((l) => l.id === id)),
      };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next) return s;
      return {
        past: [...s.past, snapshot(s)].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        canvas: next.canvas,
        layers: next.layers,
        selectedIds: s.selectedIds.filter((id) => next.layers.some((l) => l.id === id)),
      };
    }),

  addLayer: (spec) => {
    get().commit();
    set((s) => {
      // Drop the new screen just right of whatever is already placed.
      const bounds = contentBounds(s.layers);
      const layer = makeLayer(spec, s.layers.length, {
        x: bounds ? Math.round(bounds.x + bounds.width + spec.resolution.w / 2) : 0,
        y: bounds ? bounds.y : 0,
        color: nextColor(PALETTES.find((p) => p.id === s.paletteId) ?? DEFAULT_PALETTE, s.layers.length),
        pattern: (PALETTES.find((p) => p.id === s.paletteId) ?? DEFAULT_PALETTE).pattern,
      });
      return { layers: [...s.layers, layer], selectedIds: [layer.id] };
    });
  },

  duplicateLayer: (id) => {
    get().commit();
    set((s) => {
      const source = s.layers.find((l) => l.id === id);
      if (!source) return s;
      const copy: Layer = {
        ...source,
        id: newId(),
        name: `${source.name} copy`,
        x: source.x + layerRect(source).width,
      };
      return { layers: [...s.layers, copy], selectedIds: [copy.id] };
    });
  },

  removeLayer: (id) => {
    get().commit();
    set((s) => ({
      layers: s.layers.filter((l) => l.id !== id),
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
    }));
  },

  updateLayer: (id, patch) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),

  moveLayerBy: (ids, dx, dy) =>
    set((s) => ({
      layers: s.layers.map((l) =>
        ids.includes(l.id) && !l.locked ? { ...l, x: l.x + dx, y: l.y + dy } : l
      ),
    })),

  reorderLayer: (id, direction) => {
    get().commit();
    set((s) => {
      const index = s.layers.findIndex((l) => l.id === id);
      const target = direction === 'up' ? index + 1 : index - 1;
      if (index < 0 || target < 0 || target >= s.layers.length) return s;
      const layers = [...s.layers];
      [layers[index], layers[target]] = [layers[target], layers[index]];
      return { layers };
    });
  },

  setSelection: (ids) => set({ selectedIds: ids }),
  toggleSelection: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    })),

  selectAll: () => set((s) => ({ selectedIds: s.layers.filter((l) => l.visible).map((l) => l.id) })),

  updateManyLayers: (ids, patch) => {
    get().commit();
    set((s) => ({ layers: s.layers.map((l) => (ids.includes(l.id) ? { ...l, ...patch } : l)) }));
  },

  duplicateSelection: () => {
    get().commit();
    set((s) => {
      const sources = s.layers.filter((l) => s.selectedIds.includes(l.id));
      if (!sources.length) return s;
      const copies = sources.map((source) => ({
        ...source,
        id: newId(),
        name: `${source.name} copy`,
        x: source.x + layerRect(source).width,
      }));
      return { layers: [...s.layers, ...copies], selectedIds: copies.map((c) => c.id) };
    });
  },

  removeSelection: () => {
    get().commit();
    set((s) => ({
      layers: s.layers.filter((l) => !s.selectedIds.includes(l.id)),
      selectedIds: [],
    }));
  },

  alignLayers: (edge) => {
    get().commit();
    set((s) => {
      const chosen = s.layers.filter((l) => s.selectedIds.includes(l.id) && !l.locked);
      if (chosen.length < 2) return s;
      const bounds = contentBounds(chosen);
      if (!bounds) return s;
      const place = (l: Layer) => {
        const r = layerRect(l);
        switch (edge) {
          case 'left': return { x: bounds.x };
          case 'right': return { x: bounds.x + bounds.width - r.width };
          case 'hcentre': return { x: Math.round(bounds.x + (bounds.width - r.width) / 2) };
          case 'top': return { y: bounds.y };
          case 'bottom': return { y: bounds.y + bounds.height - r.height };
          case 'vcentre': return { y: Math.round(bounds.y + (bounds.height - r.height) / 2) };
        }
      };
      const ids = chosen.map((l) => l.id);
      return { layers: s.layers.map((l) => (ids.includes(l.id) ? { ...l, ...place(l) } : l)) };
    });
  },

  distributeLayers: (axis) => {
    get().commit();
    set((s) => {
      const chosen = s.layers.filter((l) => s.selectedIds.includes(l.id) && !l.locked);
      if (chosen.length < 3) return s;
      const horizontal = axis === 'horizontal';
      // Even gaps between the outermost two, which stay put.
      const sorted = [...chosen].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
      const first = layerRect(sorted[0]);
      const last = layerRect(sorted[sorted.length - 1]);
      const span = horizontal
        ? last.x + last.width - first.x
        : last.y + last.height - first.y;
      const used = sorted.reduce((sum, l) => sum + (horizontal ? layerRect(l).width : layerRect(l).height), 0);
      const gap = (span - used) / (sorted.length - 1);

      let cursor = horizontal ? first.x : first.y;
      const moved = new Map<string, Partial<Layer>>();
      for (const l of sorted) {
        moved.set(l.id, horizontal ? { x: Math.round(cursor) } : { y: Math.round(cursor) });
        cursor += (horizontal ? layerRect(l).width : layerRect(l).height) + gap;
      }
      return { layers: s.layers.map((l) => (moved.has(l.id) ? { ...l, ...moved.get(l.id) } : l)) };
    });
  },

  spaceLayers: (axis, gap) => {
    get().commit();
    set((s) => {
      const chosen = s.layers.filter((l) => s.selectedIds.includes(l.id) && !l.locked);
      if (chosen.length < 2) return s;
      const horizontal = axis === 'horizontal';
      const sorted = [...chosen].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
      let cursor = horizontal ? sorted[0].x : sorted[0].y;
      const moved = new Map<string, Partial<Layer>>();
      for (const l of sorted) {
        moved.set(l.id, horizontal ? { x: Math.round(cursor) } : { y: Math.round(cursor) });
        cursor += (horizontal ? layerRect(l).width : layerRect(l).height) + gap;
      }
      return { layers: s.layers.map((l) => (moved.has(l.id) ? { ...l, ...moved.get(l.id) } : l)) };
    });
  },

  setCanvas: (patch) => set((s) => ({ canvas: { ...s.canvas, ...patch } })),

  setPalette: (id) => {
    get().commit();
    set((s) => {
      const palette = PALETTES.find((p) => p.id === id) ?? DEFAULT_PALETTE;
      return {
        paletteId: id,
        // The pattern rides on the layer rather than being looked up from the
        // project at paint time, so the renderer stays layer-local and a saved
        // project keeps the look it was saved with.
        layers: s.layers.map((l, i) => ({
          ...l,
          color: nextColor(palette, i),
          pattern: palette.pattern,
        })),
      };
    });
  },

  setSnapEnabled: (on) => set({ snapEnabled: on }),
  setProjectName: (name) => set({ name }),
  setProcessor: (id) => set({ processorId: id }),
  setCabling: (patch) => set((s) => ({ cabling: { ...s.cabling, ...patch } })),
  setPickList: (patch) => set((s) => ({ pickList: { ...s.pickList, ...patch } })),
  setSupport: (patch) => set((s) => ({ support: { ...s.support, ...patch } })),
  setPower: (patch) => set((s) => ({ power: { ...s.power, ...patch } })),
  setEffect: (patch) => set((s) => ({ effect: { ...s.effect, ...patch } })),
  setAudience: (patch) => set((s) => ({ audience: { ...s.audience, ...patch } })),
  setAmbient: (patch) => set((s) => ({ ambient: { ...s.ambient, ...patch } })),

  addCustomProcessor: (processor) =>
    set((s) => ({
      customProcessors: [processor, ...s.customProcessors],
      processorId: processor.id,
    })),

  removeCustomProcessor: (id) =>
    set((s) => ({
      customProcessors: s.customProcessors.filter((p) => p.id !== id),
      // Fall back to a built-in if the one in use was the one deleted.
      processorId: s.processorId === id ? 'brompton-sx40' : s.processorId,
    })),

  fitCanvasToContent: () => {
    get().commit();
    set((s) => {
      const bounds = contentBounds(s.layers);
      if (!bounds) return s;
      return {
        canvas: { ...s.canvas, width: Math.round(bounds.width), height: Math.round(bounds.height) },
        layers: s.layers.map((l) => ({ ...l, x: l.x - bounds.x, y: l.y - bounds.y })),
      };
    });
  },

  centreSelection: () => {
    get().commit();
    set((s) => {
      const targets = s.selectedIds.length ? s.selectedIds : s.layers.map((l) => l.id);
      const chosen = s.layers.filter((l) => targets.includes(l.id));
      const bounds = contentBounds(chosen);
      if (!bounds) return s;
      const dx = Math.round((s.canvas.width - bounds.width) / 2 - bounds.x);
      const dy = Math.round((s.canvas.height - bounds.height) / 2 - bounds.y);
      return {
        layers: s.layers.map((l) => (targets.includes(l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l)),
      };
    });
  },

  tileLayersHorizontally: () => {
    get().commit();
    set((s) => {
      let cursor = 0;
      return {
        layers: s.layers.map((l) => {
          const placed = { ...l, x: cursor, y: 0 };
          cursor += layerRect(l).width;
          return placed;
        }),
      };
    });
  },

  loadProject: (project) => {
    get().commit();
    set((s) => ({
      name: project.name ?? s.name,
      canvas: { ...s.canvas, ...project.canvas },
      layers: (project.layers ?? s.layers).map((l) => ({
        ...l,
        id: l.id || newId(),
        shape: normaliseShape(l.shape),
      })),
      selectedIds: [],
      processorId: (project as { processorId?: string }).processorId ?? s.processorId,
      cabling: { ...s.cabling, ...(project as { cabling?: Partial<CablingSettings> }).cabling },
      pickList: { ...s.pickList, ...(project as { pickList?: Partial<PickListOptions> }).pickList },
      support: { ...s.support, ...(project as { support?: Partial<SupportSettings> }).support },
      power: { ...s.power, ...(project as { power?: Partial<PowerSettings> }).power },
      effect: { ...s.effect, ...(project as { effect?: Partial<EffectSettings> }).effect },
      audience: { ...s.audience, ...(project as { audience?: Partial<AudienceSettings> }).audience },
      ambient: { ...s.ambient, ...(project as { ambient?: Partial<AmbientSettings> }).ambient },
      customProcessors:
        (project as { customProcessors?: Processor[] }).customProcessors ?? s.customProcessors,
    }));
  },

  resetProject: () => {
    get().commit();
    /*
     * New means empty. The first load seeds a screen so the app demonstrates
     * itself rather than opening on a blank page, but someone who asks for a
     * new map wants a clean canvas and the empty state's guidance — not an
     * arbitrary cabinet they did not choose.
     */
    set({ name: 'Untitled map', canvas: initialCanvas, layers: [], selectedIds: [] });
  },

  serialise: () => {
    const { name, canvas, layers, processorId, cabling, pickList, support, power, effect, audience, ambient, customProcessors } =
      get();
    return JSON.stringify(
      {
        app: 'pixelmapmaker',
        version: 1,
        name,
        canvas,
        layers,
        processorId,
        cabling,
        pickList,
        support,
        power,
        effect,
        audience,
        ambient,
        customProcessors,
      },
      null,
      2
    );
  },
}));

export const selectedLayers = (s: EditorState) => s.layers.filter((l) => s.selectedIds.includes(l.id));

/**
 * Persist the working project so a reload does not lose the layout.
 *
 * A failure here is reported rather than swallowed. It is not fatal — the
 * project is still in memory and still exportable — but the user has to know,
 * because the difference between "saved" and "not saved" is invisible until
 * the reload that loses it.
 */
export async function persistProject() {
  if (typeof window === 'undefined') return;
  try {
    await saveWorking(JSON.parse(useEditor.getState().serialise()));
    if (useEditor.getState().storageError) useEditor.setState({ storageError: null });
  } catch (err) {
    const quota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    useEditor.setState({
      storageError: quota
        ? 'There is no room left to save this project in the browser. Export it to a file to keep it, and clear some space.'
        : 'This project cannot be saved in this browser. Export it to a file to keep it.',
    });
  }
}

/**
 * Does this layer carry everything the renderer will reach for?
 *
 * A saved project used to be handed to the store on the strength of having a
 * `layers` array at all. A truncated or half-migrated save then threw on the
 * first paint, and because the bad data was reloaded on every attempt the
 * crash repeated forever — the error page's own reload button fed it back in.
 * Refusing the save here turns an unrecoverable loop into an empty canvas.
 */
function isUsableLayer(l: unknown): l is Layer {
  if (!l || typeof l !== 'object') return false;
  const layer = l as Partial<Layer>;
  const spec = layer.spec as Layer['spec'] | undefined;
  return (
    typeof layer.id === 'string' &&
    Number.isFinite(layer.cols) &&
    Number.isFinite(layer.rows) &&
    !!spec &&
    Number.isFinite(spec.cabinet?.width) &&
    Number.isFinite(spec.cabinet?.height) &&
    Number.isFinite(spec.resolution?.w) &&
    Number.isFinite(spec.resolution?.h)
  );
}

export async function restoreProject() {
  if (typeof window === 'undefined') return false;
  try {
    await migrateFromLocalStorage();
    // Worth asking once the user has something worth keeping. Safari clears
    // unpersisted origins after about a week idle.
    void requestPersistence();

    /*
     * Deliberately loose: this is whatever a previous version of the app, or a
     * hand-edited file, happened to write. Every field is defaulted below and
     * the layers are checked properly, so the type here only needs to say
     * "some object" without pretending it is already a Project.
     */
    const parsed = (await loadWorking()) as Record<string, unknown> | null;
    const layers = parsed?.layers;
    if (!Array.isArray(layers) || !layers.length) return false;
    if (!layers.every(isUsableLayer)) {
      useEditor.setState({
        storageError:
          'The project saved in this browser could not be read, so an empty canvas was opened instead. Your file exports are unaffected.',
      });
      return false;
    }
    useEditor.setState({
      name: typeof parsed?.name === 'string' ? parsed.name : 'Untitled map',
      canvas: { ...initialCanvas, ...(parsed?.canvas as object) },
      // A project saved before shapes existed has no shape on its layers, and
      // a hand-edited one may have a half-written shape. Both come back flat.
      layers: layers.map((l) => ({ ...l, shape: normaliseShape(l.shape) })),
      selectedIds: [],
      processorId: typeof parsed?.processorId === 'string' ? parsed.processorId : 'brompton-sx40',
      cabling: { ...DEFAULT_CABLING, ...(parsed?.cabling as object) },
      pickList: { ...DEFAULT_PICKLIST_OPTIONS, ...(parsed?.pickList as object) },
      support: { ...DEFAULT_SUPPORT, ...(parsed?.support as object) },
      power: { ...DEFAULT_POWER, ...(parsed?.power as object) },
      effect: { ...DEFAULT_EFFECT, ...(parsed?.effect as object) },
      audience: { ...DEFAULT_AUDIENCE, ...(parsed?.audience as object) },
      ambient: { ...DEFAULT_AMBIENT, ...(parsed?.ambient as object) },
      customProcessors: Array.isArray(parsed?.customProcessors) ? parsed.customProcessors : [],
      past: [],
      future: [],
    });
    return true;
  } catch {
    return false;
  }
}
