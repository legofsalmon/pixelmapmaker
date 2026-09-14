/**
 * Named projects kept in the browser.
 *
 * Separate from the autosave slot the editor writes on every change: these are
 * deliberate saves the user names, lists, reopens and deletes. Everything stays
 * in localStorage — nothing is uploaded.
 */
const KEY = 'pixelmapmaker.saved.v1';

export interface SavedProject {
  id: string;
  name: string;
  savedAt: string;
  /** Serialised project, same shape as the downloadable .pixelmap.json. */
  payload: string;
  screens: number;
  cabinets: number;
}

export interface SaveSummary {
  id: string;
  name: string;
  savedAt: string;
  screens: number;
  cabinets: number;
  bytes: number;
}

function readAll(): SavedProject[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(projects: SavedProject[]) {
  window.localStorage.setItem(KEY, JSON.stringify(projects));
}

export function listSaves(): SaveSummary[] {
  return readAll()
    .map((p) => ({
      id: p.id,
      name: p.name,
      savedAt: p.savedAt,
      screens: p.screens,
      cabinets: p.cabinets,
      bytes: p.payload.length,
    }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export class StorageFullError extends Error {
  constructor() {
    super('The browser is out of storage space. Delete a saved project and try again.');
    this.name = 'StorageFullError';
  }
}

/**
 * Save under `name`, replacing any existing save with the same name so
 * re-saving a project does not pile up duplicates.
 */
export function saveProject(
  name: string,
  payload: string,
  counts: { screens: number; cabinets: number }
): SaveSummary {
  const trimmed = name.trim() || 'Untitled map';
  const existing = readAll();
  const record: SavedProject = {
    id: existing.find((p) => p.name === trimmed)?.id ?? `save-${Date.now().toString(36)}`,
    name: trimmed,
    savedAt: new Date().toISOString(),
    payload,
    screens: counts.screens,
    cabinets: counts.cabinets,
  };
  const next = [record, ...existing.filter((p) => p.name !== trimmed)];
  try {
    writeAll(next);
  } catch (err) {
    // QuotaExceededError is the realistic failure here; it is worth naming.
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
      throw new StorageFullError();
    }
    throw err;
  }
  return { ...record, bytes: record.payload.length };
}

export function loadProject(id: string) {
  const found = readAll().find((p) => p.id === id);
  if (!found) throw new Error('That saved project is no longer in this browser.');
  return JSON.parse(found.payload);
}

export function deleteSave(id: string) {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function isStorageAvailable() {
  if (typeof window === 'undefined') return false;
  try {
    const probe = '__pmm_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
