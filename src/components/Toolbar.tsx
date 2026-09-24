'use client';

import { useRef, useState } from 'react';
import { CANVAS_PRESETS, useEditor } from '@/state/store';
import { PALETTES } from '@/lib/palettes';
import { exportCanvasPng, exportCompositionJson, readProjectFile } from '@/lib/export';
import { useRunOverlays } from '@/state/useRunOverlays';
import Icon from './Icon';
import Menu from './Menu';
import NumberInput from './NumberInput';
import ConfirmDialog from './ConfirmDialog';
import Popover from './Popover';

/**
 * The command bar, in three tiers.
 *
 * It used to be 25 controls in one row at one weight, 12 of them sharing a
 * single button style — so a destructive "New" looked exactly like a read-only
 * "Spec sheet". Now: one primary action (Export), a short row of secondary
 * commands, and everything occasional behind the document menu, the view
 * popover or the reports menu. Nothing was removed.
 */
export default function Toolbar({
  onShowSpecSheet,
  onShowSave,
  onShowPickList,
  onShowSupport,
  onShowEffects,
}: {
  onShowSpecSheet: () => void;
  onShowSave: () => void;
  onShowPickList: () => void;
  onShowSupport: () => void;
  onShowEffects: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<null | { title: string; body: string; label: string; run: () => void }>(null);
  const [error, setError] = useState<string | null>(null);

  const name = useEditor((s) => s.name);
  const canvas = useEditor((s) => s.canvas);
  const layers = useEditor((s) => s.layers);
  const paletteId = useEditor((s) => s.paletteId);
  const overlays = useRunOverlays();
  const snapEnabled = useEditor((s) => s.snapEnabled);
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  const effectKind = useEditor((s) => s.effect.kind);

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

  const hasScreens = layers.length > 0;

  const withBusy = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  /** Replacing the project loses unsaved work, so both routes ask first. */
  const askBeforeReplacing = (title: string, body: string, label: string, run: () => void) => {
    if (!layers.length) return run();
    setConfirming({ title, body, label, run });
  };

  const presetValue =
    CANVAS_PRESETS.find((p) => p.width === canvas.width && p.height === canvas.height)?.name ?? '';

  return (
    <header className="toolbar">
      {/* Identity and document-level commands, the way every editor does it. */}
      <div className="toolbar__brand">
        <span className="logo" aria-hidden />
        <div className="toolbar__doc">
          <input
            className="toolbar__name"
            value={name}
            onChange={(e) => setProjectName(e.target.value)}
            aria-label="Project name"
          />
          <Menu
            label="File"
            items={[
              { label: 'Save…', onSelect: onShowSave },
              {
                label: 'Open…',
                onSelect: () =>
                  askBeforeReplacing(
                    'Open a different map?',
                    'The map you have open will be replaced. Save it first if you need it — the browser save is under File → Save.',
                    'Open a file',
                    () => fileRef.current?.click()
                  ),
              },
              {
                label: 'Composition JSON',
                hint: 'After Effects, Resolume',
                separated: true,
                disabled: !hasScreens,
                onSelect: () => exportCompositionJson(name, canvas, layers),
              },
              {
                label: 'New map',
                separated: true,
                danger: true,
                onSelect: () =>
                  askBeforeReplacing(
                    'Start a new map?',
                    'The map you have open will be cleared. Save it first if you need it — the browser save is under File → Save.',
                    'Start a new map',
                    resetProject
                  ),
              },
            ]}
          />
        </div>
      </div>

      {/* Tier 2 — reached several times a session. */}
      <div className="toolbar__group" role="group" aria-label="History">
        <button className="btn btn--quiet" type="button" onClick={undo} disabled={!past.length} aria-label="Undo">
          <Icon name="arrow-undo" /> Undo
        </button>
        <button className="btn btn--quiet" type="button" onClick={redo} disabled={!future.length} aria-label="Redo">
          <Icon name="arrow-redo" /> Redo
        </button>
      </div>

      <div className="toolbar__group" role="group" aria-label="Canvas and view">
        <Popover
          label={`${canvas.width} × ${canvas.height}`}
          ariaLabel={`Canvas size, ${canvas.width} by ${canvas.height} pixels`}
          icon="frame"
          title="Canvas"
        >
          <label className="field">
            <span>Preset</span>
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
          <div className="grid2">
            <label className="field">
              <span>Width (px)</span>
              <NumberInput min={16} max={32768} value={canvas.width} onChange={(width) => { commit(); setCanvas({ width }); }} />
            </label>
            <label className="field">
              <span>Height (px)</span>
              <NumberInput min={16} max={32768} value={canvas.height} onChange={(height) => { commit(); setCanvas({ height }); }} />
            </label>
          </div>
          <label className="field">
            <span>Background</span>
            <input
              className="input input--color"
              type="color"
              value={canvas.background}
              onChange={(e) => setCanvas({ background: e.target.value })}
            />
          </label>
          <button className="btn btn--secondary" type="button" onClick={fitCanvasToContent} disabled={!hasScreens}>
            Fit canvas to the screens
          </button>
        </Popover>

        <Popover label="View" ariaLabel="View options" icon="settings" title="View options">
          <label className="checkbox">
            <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
            <span>Snap while dragging</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={canvas.showCanvasGuides} onChange={(e) => setCanvas({ showCanvasGuides: e.target.checked })} />
            <span>Centre guides</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={canvas.maskOutsideScreens} onChange={(e) => setCanvas({ maskOutsideScreens: e.target.checked })} />
            <span>Dim outside the screens</span>
          </label>
          <label className="field">
            <span>Palette</span>
            <select className="input" value={paletteId} onChange={(e) => setPalette(e.target.value)}>
              {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </Popover>
      </div>

      {/* Arrange only exists once there is something to arrange. */}
      {hasScreens && (
        <div className="toolbar__group" role="group" aria-label="Arrange">
          {/* Centre works on one screen; only Tile needs two to mean anything. */}
          <button className="btn btn--quiet" type="button" onClick={centreSelection}>Centre</button>
          {layers.length > 1 && (
            <button className="btn btn--quiet" type="button" onClick={tileLayersHorizontally}>Tile</button>
          )}
        </div>
      )}

      <div className="toolbar__spacer" />

      {/* Tier 3 grouped by job, then the one primary action. */}
      <div className="toolbar__group toolbar__group--end">
        <button
          className={`btn btn--quiet${effectKind !== 'none' ? ' is-on' : ''}`}
          type="button"
          onClick={onShowEffects}
          aria-haspopup="dialog"
        >
          <Icon name="pattern" /> Patterns
        </button>

        <Menu
          label="Reports"
          icon="document"
          align="end"
          items={[
            { label: 'Specification sheet', hint: 'size, weight, power', disabled: !hasScreens, onSelect: onShowSpecSheet },
            { label: 'Pick list', hint: 'kit, cabling, contingency', disabled: !hasScreens, onSelect: onShowPickList },
            { label: 'Support structure', hint: 'ballast and rigging', disabled: !hasScreens, onSelect: onShowSupport },
          ]}
        />

        <div className="split">
          <button
            className="btn"
            type="button"
            disabled={busy || !hasScreens}
            onClick={() => withBusy(() => exportCanvasPng(name, canvas, layers, false, overlays))}
          >
            Export PNG
          </button>
          <Menu
            label=""
            ariaLabel="More export options"
            align="end"
            items={[
              { label: 'Export PNG', hint: 'opaque background', disabled: busy || !hasScreens, onSelect: () => withBusy(() => exportCanvasPng(name, canvas, layers, false, overlays)) },
              { label: 'Export PNG with alpha', hint: 'transparent background', disabled: busy || !hasScreens, onSelect: () => withBusy(() => exportCanvasPng(name, canvas, layers, true, overlays)) },
            ]}
          />
        </div>
      </div>

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

      {/* Present at all times so a screen reader announces the change, not the node. */}
      {confirming && (
        <ConfirmDialog
          title={confirming.title}
          body={confirming.body}
          confirmLabel={confirming.label}
          onConfirm={confirming.run}
          onCancel={() => setConfirming(null)}
        />
      )}

      <p className="toolbar__status" role="status">{busy ? 'Rendering the PNG…' : ''}</p>
      <p className="toolbar__error" role="alert">{error ?? ''}</p>
    </header>
  );
}
