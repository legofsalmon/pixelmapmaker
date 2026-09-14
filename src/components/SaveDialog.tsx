'use client';

import { useState } from 'react';
import { useEditor } from '@/state/store';
import {
  StorageFullError,
  deleteSave,
  isStorageAvailable,
  listSaves,
  loadProject,
  saveProject,
  type SaveSummary,
} from '@/lib/browserStore';
import { exportProjectJson } from '@/lib/export';

const formatBytes = (n: number) => (n < 1024 ? `${n} B` : `${Math.round(n / 1024)} KB`);

export default function SaveDialog({ onClose }: { onClose: () => void }) {
  const name = useEditor((s) => s.name);
  const layers = useEditor((s) => s.layers);
  const serialise = useEditor((s) => s.serialise);
  const loadIntoEditor = useEditor((s) => s.loadProject);
  const setProjectName = useEditor((s) => s.setProjectName);

  const [saveName, setSaveName] = useState(name);
  // The dialog only ever mounts from a click, so reading storage in the lazy
  // initialiser is safe and avoids a setState cascade on mount.
  const [saves, setSaves] = useState<SaveSummary[]>(listSaves);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = isStorageAvailable();

  const cabinets = layers.reduce((sum, l) => sum + l.cols * l.rows, 0);

  const handleSave = () => {
    setError(null);
    try {
      const summary = saveProject(saveName, serialise(), { screens: layers.length, cabinets });
      setSaves(listSaves());
      setProjectName(summary.name);
      setMessage(`Saved “${summary.name}” in this browser.`);
    } catch (err) {
      setError(
        err instanceof StorageFullError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not save.'
      );
    }
  };

  const handleLoad = (id: string, label: string) => {
    setError(null);
    try {
      loadIntoEditor(loadProject(id));
      setMessage(`Opened “${label}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that save.');
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Save project">
      <div className="modal__panel modal__panel--narrow">
        <header className="modal__head">
          <h2>Save project</h2>
          <button className="btn btn--ghost" type="button" onClick={onClose}>Close</button>
        </header>

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
              className="btn btn--ghost"
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
                    <button className="btn btn--ghost" type="button" onClick={() => handleLoad(s.id, s.name)}>
                      Open
                    </button>
                    <button
                      className="btn btn--ghost"
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Delete the saved project “${s.name}”?`)) return;
                        deleteSave(s.id);
                        setSaves(listSaves());
                        setMessage(`Deleted “${s.name}”.`);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {message && <p className="note" role="status">{message}</p>}
          {error && <p className="note note--warn" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  );
}
