'use client';

import { useRef, useState } from 'react';
import { CANVAS_PRESETS, useEditor } from '@/state/store';
import { PALETTES } from '@/lib/palettes';
import { exportCanvasPng, exportCompositionJson, readProjectFile } from '@/lib/export';

export default function Toolbar({
  onShowSpecSheet,
  onShowSave,
  onShowPickList,
  onShowSupport,
}: {
  onShowSpecSheet: () => void;
  onShowSave: () => void;
  onShowPickList: () => void;
  onShowSupport: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = useEditor((s) => s.name);
  const canvas = useEditor((s) => s.canvas);
  const layers = useEditor((s) => s.layers);
  const paletteId = useEditor((s) => s.paletteId);
  const snapEnabled = useEditor((s) => s.snapEnabled);
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);

  const setProjectName = useEditor((s) => s.setProjectName);
  const setCanvas = useEditor((s) => s.setCanvas);
  const setPalette = useEditor((s) => s.setPalette);
  const setSnapEnabled = useEditor((s) => s.setSnapEnabled);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const commit = useEditor((s) => s.commit);
  const fitCanvasToContent = useEditor((s) => s.fitCanvasToContent);
  const centreSelection = useEditor((s) => s.centreSelection);
  const tileLayersHorizontally = useEditor((s) => s.tileLayersHorizontally);
  const loadProject = useEditor((s) => s.loadProject);
  const resetProject = useEditor((s) => s.resetProject);

  const withBusy = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const presetValue =
    CANVAS_PRESETS.find((p) => p.width === canvas.width && p.height === canvas.height)?.name ?? '';

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="logo" aria-hidden />
        <div>
          <h1>Pixel Map Maker</h1>
          <input
            className="toolbar__name"
            value={name}
            onChange={(e) => setProjectName(e.target.value)}
            aria-label="Project name"
          />
        </div>
      </div>

      <div className="toolbar__group">
        <label className="field field--inline">
          <span>Canvas</span>
          <select
            className="input"
            value={presetValue}
            onChange={(e) => {
              const preset = CANVAS_PRESETS.find((p) => p.name === e.target.value);
              if (!preset) return;
              commit();
              setCanvas({ width: preset.width, height: preset.height });
            }}
          >
            <option value="">Custom</option>
            {CANVAS_PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </label>
        <input
          className="input input--num"
          type="number"
          min="16"
          max="32768"
          value={canvas.width}
          aria-label="Canvas width"
          onChange={(e) => setCanvas({ width: Math.max(16, Number(e.target.value)) })}
        />
        <span className="times">×</span>
        <input
          className="input input--num"
          type="number"
          min="16"
          max="32768"
          value={canvas.height}
          aria-label="Canvas height"
          onChange={(e) => setCanvas({ height: Math.max(16, Number(e.target.value)) })}
        />
        <input
          className="input input--color"
          type="color"
          value={canvas.background}
          aria-label="Canvas background"
          onChange={(e) => setCanvas({ background: e.target.value })}
        />
      </div>

      <div className="toolbar__group">
        <label className="field field--inline">
          <span>Palette</span>
          <select className="input" value={paletteId} onChange={(e) => setPalette(e.target.value)}>
            {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
          <span>Snap</span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={canvas.showCanvasGuides} onChange={(e) => setCanvas({ showCanvasGuides: e.target.checked })} />
          <span>Centre guides</span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={canvas.maskOutsideScreens} onChange={(e) => setCanvas({ maskOutsideScreens: e.target.checked })} />
          <span>Mask</span>
        </label>
      </div>

      <div className="toolbar__group">
        <button className="btn btn--ghost" type="button" onClick={undo} disabled={!past.length}>Undo</button>
        <button className="btn btn--ghost" type="button" onClick={redo} disabled={!future.length}>Redo</button>
        <button className="btn btn--ghost" type="button" onClick={centreSelection}>Centre</button>
        <button className="btn btn--ghost" type="button" onClick={tileLayersHorizontally}>Tile</button>
        <button className="btn btn--ghost" type="button" onClick={fitCanvasToContent}>Fit canvas</button>
      </div>

      <div className="toolbar__group toolbar__group--end">
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => withBusy(() => exportCanvasPng(name, canvas, layers, false))}
        >
          Export PNG
        </button>
        <button
          className="btn btn--ghost"
          type="button"
          disabled={busy}
          onClick={() => withBusy(() => exportCanvasPng(name, canvas, layers, true))}
        >
          PNG (alpha)
        </button>
        <button className="btn btn--ghost" type="button" onClick={onShowSpecSheet}>Spec sheet</button>
        <button className="btn btn--ghost" type="button" onClick={onShowPickList}>Pick list</button>
        <button className="btn btn--ghost" type="button" onClick={onShowSupport}>Support</button>
        <button className="btn btn--ghost" type="button" onClick={onShowSave}>Save</button>
        <button className="btn btn--ghost" type="button" onClick={() => fileRef.current?.click()}>Open</button>
        <button className="btn btn--ghost" type="button" onClick={() => exportCompositionJson(name, canvas, layers)}>
          Comp JSON
        </button>
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => {
            if (window.confirm('Start a new map? Unsaved changes will be lost.')) resetProject();
          }}
        >
          New
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            await withBusy(async () => loadProject(await readProjectFile(file)));
          }}
        />
      </div>

      {error && <p className="toolbar__error" role="alert">{error}</p>}
    </header>
  );
}
