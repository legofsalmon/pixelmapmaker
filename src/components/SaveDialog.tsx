'use client';

import { useCallback, useEffect, useState } from 'react';
import { useEditor } from '@/state/store';
import {
  deleteNamed,
  isStorageAvailable,
  listNamed,
  loadNamed,
  saveNamed,
  type SaveSummary,
} from '@/lib/projectStore';
import { exportProjectJson } from '@/lib/export';
import ConfirmDialog from './ConfirmDialog';
import Dialog from './Dialog';

const formatBytes = (n: number) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);

export default function SaveDialog({ onClose }: { onClose: () => void }) {
  const name = useEditor((s) => s.name);
  const layers = useEditor((s) => s.layers);
  const serialise = useEditor((s) => s.serialise);
  const loadIntoEditor = useEditor((s) => s.loadProject);
  const setProjectName = useEditor((s) => s.setProjectName);

  const [saveName, setSaveName] = useState(name);
  // IndexedDB is asynchronous, so the list arrives after the first paint
  // rather than during it. Starting empty and filling in is the honest
  // version of that; the dialog is usable either way.
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SaveSummary | null>(null);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(() => {
    listNamed().then(setSaves).catch(() => setSaves([]));
  }, []);

  useEffect(() => {
    refresh();
    isStorageAvailable().then(setAvailable);
  }, [refresh]);

  const cabinets = layers.reduce((sum, l) => sum + l.cols * l.rows, 0);

  const handleSave = async () => {
    setError(null);
    const label = saveName.trim() || 'Untitled map';
    try {
      await saveNamed(label, JSON.parse(serialise()), { screens: layers.length, cabinets });
      refresh();
      setProjectName(label);
      setMessage(`Saved “${label}” in this browser.`);
    } catch (err) {
      const quota =
        err instanceof DOMException &&
        (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      setError(
        quota
          ? 'There is no room left in this browser. Delete a save, or download this project as a file.'
          : err instanceof Error ? err.message : 'Could not save.'
      );
    }
  };

  const handleLoad = async (id: string, label: string) => {
    setError(null);
    try {
      const project = await loadNamed(id);
      if (!project || typeof project !== 'object') throw new Error('That save could not be found.');
      loadIntoEditor(project as Parameters<typeof loadIntoEditor>[0]);
      setMessage(`Opened “${label}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that save.');
    }
  };

  return (
    <Dialog title="Save project" onClose={onClose}>
        <div className="sheet__body">
          {!available && (
            <p className="note note--warn">
              This browser is not allowing local storage (private window, or site data blocked),
              so in-browser saving is unavailable. Downloading a file still works.
            </p>
          )}

          <section>
            <h4>Save in this browser</h4>
            <div className="gap-row">
              <input
                className="input"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Project name"
                aria-label="Project name"
              />
              <button className="btn" type="button" onClick={handleSave} disabled={!available}>
                Save
              </button>
            </div>
            <p className="note">
              Kept on this device only — clearing site data removes it, and it does not follow you
              to another browser or machine. Download a file for anything you need to keep or share.
            </p>
          </section>

          <section>
            <h4>Download a file</h4>
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => exportProjectJson(name, serialise())}
            >
              Download .pixelmap.json
            </button>
          </section>

          <section>
            <h4>Saved in this browser ({saves.length})</h4>
            {saves.length === 0 && <p className="empty">Nothing saved here yet.</p>}
            <ul className="save-list">
              {saves.map((s) => (
                <li key={s.id} className="save">
                  <div className="save__main">
                    <strong>{s.name}</strong>
                    <span>
                      {new Date(s.savedAt).toLocaleString('en-GB')} · {s.screens} screen
                      {s.screens === 1 ? '' : 's'} · {s.cabinets} cabinets · {formatBytes(s.bytes)}
                    </span>
                  </div>
                  <div className="btn-row">
                    <button className="btn btn--secondary" type="button" onClick={() => handleLoad(s.id, s.name)}>
                      Open
                    </button>
                    <button
                      className="btn btn--danger"
                      type="button"
                      onClick={() => setPendingDelete(s)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {pendingDelete && (
            <ConfirmDialog
              title="Delete this save?"
              body={`“${pendingDelete.name}” will be removed from this browser. This cannot be undone.`}
              confirmLabel="Delete it"
              onConfirm={() => {
                void deleteNamed(pendingDelete.id).then(refresh);
                setMessage(`Deleted “${pendingDelete.name}”.`);
              }}
              onCancel={() => setPendingDelete(null)}
            />
          )}
          <p className="note" role="status">{message ?? ''}</p>
          <p className="note note--warn" role="alert">{error ?? ''}</p>
        </div>
    </Dialog>
  );
}
