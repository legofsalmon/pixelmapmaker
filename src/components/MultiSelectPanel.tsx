'use client';

import { useState } from 'react';
import { useEditor } from '@/state/store';
import type { AlignEdge } from '@/state/store';
import { projectTotals } from '@/lib/calc';
import { PALETTES } from '@/lib/palettes';
import { nextColor } from '@/lib/palettes';
import NumberInput from './NumberInput';
import Icon, { type IconName } from './Icon';

const ALIGN: Array<{ edge: AlignEdge; icon: IconName; title: string }> = [
  { edge: 'left', icon: 'align-left', title: 'Align left edges' },
  { edge: 'hcentre', icon: 'align-hcentre', title: 'Align horizontal centres' },
  { edge: 'right', icon: 'align-right', title: 'Align right edges' },
  { edge: 'top', icon: 'align-top', title: 'Align top edges' },
  { edge: 'vcentre', icon: 'align-vcentre', title: 'Align vertical centres' },
  { edge: 'bottom', icon: 'align-bottom', title: 'Align bottom edges' },
];

/** Shown in place of the single-screen inspector when several are selected. */
export default function MultiSelectPanel() {
  const [gap, setGap] = useState(0);
  const layers = useEditor((s) => s.layers);
  const selectedIds = useEditor((s) => s.selectedIds);
  const alignLayers = useEditor((s) => s.alignLayers);
  const distributeLayers = useEditor((s) => s.distributeLayers);
  const spaceLayers = useEditor((s) => s.spaceLayers);
  const updateManyLayers = useEditor((s) => s.updateManyLayers);
  const duplicateSelection = useEditor((s) => s.duplicateSelection);
  const removeSelection = useEditor((s) => s.removeSelection);
  const setSelection = useEditor((s) => s.setSelection);
  const paletteId = useEditor((s) => s.paletteId);

  const selected = layers.filter((l) => selectedIds.includes(l.id));
  const totals = projectTotals(selected);
  const palette = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];

  return (
    <section className="panel">
      <header className="panel__head">
        <h2>{selected.length} screens selected</h2>
        <button className="linkish" type="button" onClick={() => setSelection([])}>Deselect</button>
      </header>
      <div className="panel__body">
        <div className="field">
          <span>Align</span>
          <div className="icon-row">
            {ALIGN.map((a) => (
              <button key={a.edge} type="button" title={a.title} aria-label={a.title} onClick={() => alignLayers(a.edge)}>
                <Icon name={a.icon} size={18} />
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Distribute evenly</span>
          <div className="btn-row">
            <button
              className="btn btn--secondary"
              type="button"
              disabled={selected.length < 3}
              title={selected.length < 3 ? 'Needs three or more screens' : undefined}
              onClick={() => distributeLayers('horizontal')}
            >
              Horizontally
            </button>
            <button
              className="btn btn--secondary"
              type="button"
              disabled={selected.length < 3}
              title={selected.length < 3 ? 'Needs three or more screens' : undefined}
              onClick={() => distributeLayers('vertical')}
            >
              Vertically
            </button>
          </div>
        </div>

        <div className="field">
          <span>Pack with a fixed gap</span>
          <div className="gap-row">
            <NumberInput className="input input--num" value={gap} aria-label="Gap in pixels" onChange={setGap} />
            <button className="btn btn--secondary" type="button" onClick={() => spaceLayers('horizontal', gap)}>
              Row
            </button>
            <button className="btn btn--secondary" type="button" onClick={() => spaceLayers('vertical', gap)}>
              Column
            </button>
          </div>
        </div>

        <div className="field">
          <span>Apply to all selected</span>
          <div className="btn-row">
            <button className="btn btn--secondary" type="button" onClick={() => updateManyLayers(selectedIds, { showNumbers: true })}>
              Number on
            </button>
            <button className="btn btn--secondary" type="button" onClick={() => updateManyLayers(selectedIds, { showNumbers: false })}>
              off
            </button>
            <button className="btn btn--secondary" type="button" onClick={() => updateManyLayers(selectedIds, { showSignalFlow: true })}>
              Signal on
            </button>
            <button className="btn btn--secondary" type="button" onClick={() => updateManyLayers(selectedIds, { showSignalFlow: false })}>
              off
            </button>
          </div>
          <div className="swatch-row">
            {palette.colors.map((c) => (
              <button
                key={c}
                type="button"
                className="swatch"
                style={{ background: c }}
                aria-label={`Colour all selected ${c}`}
                onClick={() => updateManyLayers(selectedIds, { color: c })}
              />
            ))}
            <button
              className="btn btn--secondary"
              type="button"
              title="Give each selected screen the next palette colour"
              onClick={() => {
                // Re-colour in selection order so adjacent walls stay distinct.
                selectedIds.forEach((id, i) => updateManyLayers([id], { color: nextColor(palette, i) }));
              }}
            >
              Vary
            </button>
          </div>
        </div>

        <dl className="stats">
          <div><dt>Cabinets</dt><dd>{totals.cabinets}</dd></div>
          <div><dt>Area</dt><dd>{totals.areaM2.toFixed(2)} m²</dd></div>
          <div><dt>Pixels</dt><dd>{totals.megapixels.toFixed(2)} MP</dd></div>
          <div>
            <dt>Weight</dt>
            <dd>{totals.weightKg != null ? `${totals.weightKg.toFixed(0)} kg` : '—'}{totals.weightIncomplete ? '*' : ''}</dd>
          </div>
          <div>
            <dt>Power max</dt>
            <dd>{totals.powerMaxW != null ? `${(totals.powerMaxW / 1000).toFixed(2)} kW` : '—'}{totals.powerIncomplete ? '*' : ''}</dd>
          </div>
        </dl>

        <div className="btn-row">
          <button className="btn btn--secondary" type="button" onClick={duplicateSelection}>Duplicate</button>
          <button className="btn btn--danger" type="button" onClick={removeSelection}>Delete</button>
        </div>
      </div>
    </section>
  );
}
