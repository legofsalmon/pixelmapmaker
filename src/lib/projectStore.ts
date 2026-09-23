/**
 * Reading and writing projects, and the one place logos change form.
 *
 * Logos live in the project as data URLs, because that is what makes an
 * exported .pixelmap.json a single self-contained file you can email. They are
 * a poor way to *store* an image though — base64 is a third bigger than the
 * bytes it encodes. So they are split out into Blobs on the way into the
 * database and put back on the way out, and nothing above this file has to
 * know that happened. The renderer, the exporter and the layer type are all
 * untouched.
 */
import {
  LOGOS, PROJECTS, WORKING_ID,
  blobToDataUrl, dataUrlToBlob, idbDelete, idbGet, idbGetAll, idbPut, openDb,
} from './idb';

/** A project as stored: layers without their logo payloads. */
interface StoredProject {
  id: string;
  name: string;
  savedAt: string;
  screens: number;
  cabinets: number;
  /** The project object, with every layer's `logo` nulled out. */
  project: ProjectShape;
  /** Layer ids that have a logo in the LOGOS store under this project. */
  logoLayers: string[];
}

interface ProjectShape {
  name?: string;
  layers?: Array<{ id: string; logo?: string | null }>;
  [key: string]: unknown;
}

export interface SaveSummary {
  id: string;
  name: string;
  savedAt: string;
  screens: number;
  cabinets: number;
  bytes: number;
}

const logoKey = (projectId: string, layerId: string) => `${projectId}:${layerId}`;

/** Lift every data-URL logo out of the project and into the blob store. */
async function writeWithLogos(record: Omit<StoredProject, 'logoLayers'>) {
  const layers = record.project.layers ?? [];
  const logoLayers: string[] = [];
  for (const layer of layers) {
    if (typeof layer.logo !== 'string' || !layer.logo.startsWith('data:')) continue;
    await idbPut(LOGOS, dataUrlToBlob(layer.logo), logoKey(record.id, layer.id));
    logoLayers.push(layer.id);
  }
  const stripped: ProjectShape = {
    ...record.project,
    layers: layers.map((l) => (logoLayers.includes(l.id) ? { ...l, logo: null } : l)),
  };
  await idbPut(PROJECTS, { ...record, project: stripped, logoLayers } satisfies StoredProject);
}

/** Put the logos back, so callers get the same shape they handed in. */
async function readWithLogos(record: StoredProject | undefined) {
  if (!record) return null;
  if (!record.logoLayers?.length) return record.project;
  const byId = new Map<string, string>();
  for (const layerId of record.logoLayers) {
    const blob = await idbGet<Blob>(LOGOS, logoKey(record.id, layerId));
    // A missing blob is survivable: the screen simply has no logo, which beats
    // refusing to open the project over a decoration.
    if (blob) byId.set(layerId, await blobToDataUrl(blob));
  }
  return {
    ...record.project,
    layers: (record.project.layers ?? []).map((l) =>
      byId.has(l.id) ? { ...l, logo: byId.get(l.id)! } : l
    ),
  };
}

async function dropLogos(projectId: string, layerIds: string[] = []) {
  for (const layerId of layerIds) {
    try { await idbDelete(LOGOS, logoKey(projectId, layerId)); } catch { /* already gone */ }
  }
}

/* ---------- the working autosave slot ---------- */

export async function saveWorking(project: unknown) {
  const shape = project as ProjectShape;
  const previous = await idbGet<StoredProject>(PROJECTS, WORKING_ID);
  await dropLogos(WORKING_ID, previous?.logoLayers);
  await writeWithLogos({
    id: WORKING_ID,
    name: String(shape.name ?? 'Untitled map'),
    savedAt: new Date().toISOString(),
    screens: shape.layers?.length ?? 0,
    cabinets: 0,
    project: shape,
  });
}

/**
 * Returns `unknown` on purpose. What comes back is whatever some earlier
 * version of the app wrote, so the caller has to check it rather than being
 * handed a type that only claims to be right.
 */
export async function loadWorking(): Promise<unknown> {
  return readWithLogos(await idbGet<StoredProject>(PROJECTS, WORKING_ID));
}

/* ---------- named saves ---------- */

export async function saveNamed(
  name: string,
  project: unknown,
  counts: { screens: number; cabinets: number }
) {
  const id = `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await writeWithLogos({
    id, name: name.trim() || 'Untitled map',
    savedAt: new Date().toISOString(),
    screens: counts.screens, cabinets: counts.cabinets,
    project: project as ProjectShape,
  });
  return id;
}

export async function listNamed(): Promise<SaveSummary[]> {
  const all = await idbGetAll<StoredProject>(PROJECTS);
  return all
    .filter((r) => r.id !== WORKING_ID)
    .map((r) => ({
      id: r.id, name: r.name, savedAt: r.savedAt,
      screens: r.screens, cabinets: r.cabinets,
      bytes: JSON.stringify(r.project).length,
    }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** As `loadWorking`: unvalidated stored data, typed honestly. */
export async function loadNamed(id: string): Promise<unknown> {
  return readWithLogos(await idbGet<StoredProject>(PROJECTS, id));
}

export async function deleteNamed(id: string) {
  const record = await idbGet<StoredProject>(PROJECTS, id);
  await dropLogos(id, record?.logoLayers);
  await idbDelete(PROJECTS, id);
}

/* ---------- migration off localStorage ---------- */

const OLD_WORKING = 'pixelmapmaker.project.v1';
const OLD_SAVES = 'pixelmapmaker.saved.v1';

/**
 * Move anything the old localStorage build left behind, once.
 *
 * The old keys are read and then removed: leaving them would keep a duplicate
 * of every project sitting in the 5 MB budget that other parts of the app
 * still share, and a stale copy is worse than none once the two can diverge.
 * A failure here is not fatal — the worst case is that an old project is not
 * carried over, and it is still in localStorage to try again next time.
 */
export async function migrateFromLocalStorage() {
  if (typeof window === 'undefined') return { working: false, saves: 0 };
  let working = false;
  let saves = 0;

  try {
    const raw = window.localStorage.getItem(OLD_WORKING);
    if (raw && !(await idbGet<StoredProject>(PROJECTS, WORKING_ID))) {
      await saveWorking(JSON.parse(raw));
      working = true;
    }
    if (raw) window.localStorage.removeItem(OLD_WORKING);
  } catch { /* leave the old key alone so it can be retried */ }

  try {
    const raw = window.localStorage.getItem(OLD_SAVES);
    if (raw) {
      const existing = await idbGetAll<StoredProject>(PROJECTS);
      const known = new Set(existing.map((r) => r.name + r.savedAt));
      for (const old of JSON.parse(raw) as Array<{ name: string; savedAt: string; payload: string; screens: number; cabinets: number }>) {
        if (known.has(old.name + old.savedAt)) continue;
        await saveNamed(old.name, JSON.parse(old.payload), { screens: old.screens, cabinets: old.cabinets });
        saves++;
      }
      window.localStorage.removeItem(OLD_SAVES);
    }
  } catch { /* as above */ }

  return { working, saves };
}

/** Is the database usable at all? Private windows and locked-down profiles say no. */
export async function isStorageAvailable() {
  try { await openDb(); return true; } catch { return false; }
}
