/**
 * The browser-side store for projects.
 *
 * localStorage was the wrong home for this and the measurement said so: one
 * logo took the saved project to 2.31 MB against a ~5 MB per-origin cap, so a
 * three-screen show with a logo each stopped saving. IndexedDB shares the
 * origin's real quota — hundreds of megabytes to gigabytes, depending on the
 * browser and free disk — and takes Blobs without base64, which is a third
 * smaller again.
 *
 * Small enough to hand-roll. A wrapper library would be more code than this
 * for a schema of two object stores and five operations.
 */

const DB_NAME = 'pixelmapmaker';
const DB_VERSION = 1;

/** Projects, keyed by id. The working autosave uses the fixed id below. */
export const PROJECTS = 'projects';
/** Logo images as Blobs, keyed `${projectId}:${layerId}`. */
export const LOGOS = 'logos';

export const WORKING_ID = 'working';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(LOGOS)) db.createObjectStore(LOGOS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
    // Another tab holding an old version open would otherwise hang this for ever.
    request.onblocked = () => reject(new Error('Close the app’s other tabs and try again'));
  });
  // A failed open must not be cached, or one transient failure disables saving
  // for the life of the page.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

/** Wrap one request in a promise, surfacing the transaction's error too. */
function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  body: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result: T;
    // Resolve on transaction completion, not on request success: a write is
    // not durable until the transaction commits, and a quota failure surfaces
    // as an abort rather than a request error.
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    wrap(body(tx.objectStore(store))).then((r) => { result = r; }, reject);
  });
}

export const idbGet = <T>(store: string, key: IDBValidKey) =>
  run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);

export const idbPut = (store: string, value: unknown, key?: IDBValidKey) =>
  run(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));

export const idbDelete = (store: string, key: IDBValidKey) =>
  run(store, 'readwrite', (s) => s.delete(key));

export const idbGetAll = <T>(store: string) =>
  run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);

export const idbKeys = (store: string) =>
  run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys());

/**
 * Ask the browser not to evict this origin's data under storage pressure.
 * Safari in particular clears unpersisted storage after about a week idle,
 * which for a saved project is indistinguishable from losing it.
 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Advisory only — the browser is free to say no, and older ones have no
    // opinion at all.
  }
}

/* ---------- data URL <-> Blob, the only place either form is converted ---------- */

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const type = /:(.*?);/.exec(head)?.[1] ?? 'application/octet-stream';
  if (!head.includes('base64')) return new Blob([decodeURIComponent(body)], { type });
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('That image could not be read'));
    reader.readAsDataURL(blob);
  });
}
