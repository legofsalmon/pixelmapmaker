'use client';

import { useEditor } from '@/state/store';
import { findProcessor } from '@/lib/processors';
import {
  EMPTY_CUSTOM_RUNS,
  reportFor,
  runsOf,
  withRun,
  withoutRun,
  type RunKind,
} from '@/lib/customRuns';
import type { Layer } from '@/lib/types';
import Section from './Section';
import Icon from './Icon';

const KINDS: Array<{ value: RunKind; label: string }> = [
  { value: 'data', label: 'Data' },
  { value: 'power', label: 'Power' },
];

const fmt = (n: number) => n.toLocaleString('en-GB');

/**
 * Drawing cabling by hand, and watching each chain fill up as you do.
 *
 * The automatic plan divides the wall into equal chains, which is right until
 * the room has an opinion — the distro is stage left, a cable has to cross a
 * walkway, two cabinets hang off a different truss. The point of drawing one
 * is to say what will actually be patched, so the thing this panel owes you
 * is the running total: how full the chain you are drawing is, against what
 * is allowed, and which ceiling that is.
 */
export default function CablingSection({ layer }: { layer: Layer }) {
  const updateLayer = useEditor((s) => s.updateLayer);
  const commit = useEditor((s) => s.commit);
  const cabling = useEditor((s) => s.cabling);
  const processorId = useEditor((s) => s.processorId);
  const customProcessors = useEditor((s) => s.customProcessors);
  const cablingDraw = useEditor((s) => s.cablingDraw);
  const setCablingDraw = useEditor((s) => s.setCablingDraw);

  const processor = findProcessor(processorId, customProcessors);
  const drawingHere = cablingDraw?.layerId === layer.id ? cablingDraw : null;
  const kind: RunKind = drawingHere?.kind ?? 'data';
  const runs = runsOf(layer.customRuns, kind);
  const report = reportFor(kind, layer, runs, cabling, processor);
  const usingCustom = layer.cablingPlan === 'custom';

  const setRuns = (next: Layer['customRuns']) => {
    commit();
    updateLayer(layer.id, { customRuns: next });
  };

  /**
   * Start drawing, and make sure the chain will be visible while it is drawn.
   *
   * The overlay for the kind being drawn is switched on if it is not already:
   * drawing a cable you cannot see is not drawing. It is an ordinary change
   * to the screen, so it shows in the toggles and undoes with everything else.
   */
  const startDrawing = (index: number) => {
    const showing = kind === 'data' ? layer.showSignalFlow : layer.showPowerRuns;
    if (!showing) {
      updateLayer(layer.id, kind === 'data' ? { showSignalFlow: true } : { showPowerRuns: true });
    }
    setCablingDraw({ layerId: layer.id, kind, index });
  };

  const addRun = () => {
    const next = withRun(layer.customRuns ?? EMPTY_CUSTOM_RUNS, kind, runs.length, []);
    setRuns(next);
    startDrawing(runs.length);
  };

  return (
    <Section id="cabling" title="Cabling by hand" hint="draw the chains, watch them fill">
      <label className="field">
        <span>Plan</span>
        <select
          className="input"
          value={layer.cablingPlan ?? 'auto'}
          onChange={(e) => {
            commit();
            updateLayer(layer.id, { cablingPlan: e.target.value as 'auto' | 'custom' });
          }}
        >
          <option value="auto">Automatic</option>
          <option value="custom">Drawn by hand</option>
        </select>
      </label>

      <p className="note">
        {usingCustom
          ? 'The overlays, the patch list and the cable counts read the chains below. The automatic plan is still here — switch back and nothing you drew is lost.'
          : 'Chains you draw are kept but not used yet. Switch the plan to put them on the drawing and into the pick list.'}
      </p>

      <div className="seg" role="radiogroup" aria-label="Which runs to draw">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            className={kind === k.value ? 'is-on' : undefined}
            onClick={() => setCablingDraw({ layerId: layer.id, kind: k.value, index: -1 })}
          >
            {k.label}
          </button>
        ))}
      </div>

      {report.runs.length === 0 && (
        <p className="note">
          Nothing drawn yet. Add a chain, then drag across the cabinets to trace it — the arrow
          keys do the same from the keyboard.
        </p>
      )}

      <ul className="runlist">
        {report.runs.map((load, i) => {
          const editing = drawingHere?.index === i;
          const pct = Math.min(100, Math.round(load.fraction * 100));
          return (
            <li key={i} className={`runlist__item${load.over ? ' is-over' : ''}${editing ? ' is-editing' : ''}`}>
              <div className="runlist__head">
                <strong>{kind === 'data' ? `Port ${i + 1}` : `Circuit ${i + 1}`}</strong>
                <span className="runlist__count">
                  {load.count} of {load.cabinets ?? '—'} cabinets
                </span>
              </div>
              <div className="runlist__bar" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </div>
              <p className="runlist__why">
                {load.used != null && load.budget != null
                  ? `${fmt(Math.round(load.used))} of ${fmt(Math.round(load.budget))} ${load.unit} · ${load.limitedBy}`
                  : load.limitedBy}
              </p>
              {load.over && (
                <p className="note note--warn">
                  Over by {load.count - (load.cabinets ?? 0)}. Take cabinets off this chain or start another.
                </p>
              )}
              <div className="runlist__actions">
                <button
                  type="button"
                  onClick={() => (editing ? setCablingDraw(null) : startDrawing(i))}
                >
                  {editing ? 'Done' : 'Draw'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRuns(withRun(layer.customRuns, kind, i, []));
                  }}
                  disabled={load.count === 0}
                >
                  Clear
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${kind === 'data' ? 'port' : 'circuit'} ${i + 1}`}
                  onClick={() => {
                    if (editing) setCablingDraw(null);
                    setRuns(withoutRun(layer.customRuns, kind, i));
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <button type="button" className="btn" onClick={addRun}>
        Add a {kind === 'data' ? 'port' : 'circuit'}
      </button>

      {drawingHere && drawingHere.index >= 0 && (
        <p className="note note--live">
          Drawing. Drag across the cabinets, or use the arrow keys. Backspace takes one off,
          Ctrl lets the chain jump to a cabinet it is not touching, Escape stops.
        </p>
      )}

      <p className="note">
        {report.patched} of {layer.cols * layer.rows} cabinets on a chain
        {report.unpatched > 0 && `, ${report.unpatched} still to draw`}
        {report.doubled.length > 0 && ` · ${report.doubled.length} on two chains at once`}
      </p>
    </Section>
  );
}
