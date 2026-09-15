'use client';

import { useRef, useState } from 'react';
import { useEditor } from '@/state/store';
import { readLogoFile } from '@/lib/logos';
import { layerTotals, kgToLbs, mmToFeetInches } from '@/lib/calc';
import { exportLayerPng } from '@/lib/export';
import type { SignalPath, SignalStart } from '@/lib/types';
import NumberInput from './NumberInput';

const SIGNAL_STARTS: Array<{ value: SignalStart; label: string }> = [
  { value: 'tl', label: 'Top left' },
  { value: 'tr', label: 'Top right' },
  { value: 'bl', label: 'Bottom left' },
  { value: 'br', label: 'Bottom right' },
];

const SIGNAL_PATHS: Array<{ value: SignalPath; label: string }> = [
  { value: 'serpentine', label: 'Horizontal serpentine' },
  { value: 'raster', label: 'Horizontal raster' },
  { value: 'vertical-serpentine', label: 'Vertical serpentine' },
  { value: 'vertical-raster', label: 'Vertical raster' },
];

export default function Inspector() {
  const logoInput = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const layers = useEditor((s) => s.layers);
  const selectedIds = useEditor((s) => s.selectedIds);
  const updateLayer = useEditor((s) => s.updateLayer);
  const commit = useEditor((s) => s.commit);
  const canvasBackground = useEditor((s) => s.canvas.background);

  const layer = layers.find((l) => l.id === selectedIds[0]);

  if (!layer) {
    return (
      <section className="panel">
        <header className="panel__head"><h2>Screen</h2></header>
        <div className="panel__body">
          <p className="empty">Select a screen on the canvas to edit it.</p>
        </div>
      </section>
    );
  }

  const totals = layerTotals(layer);
  const spec = layer.spec;
  const change = <K extends keyof typeof layer>(key: K, value: (typeof layer)[K]) => {
    commit();
    updateLayer(layer.id, { [key]: value } as Partial<typeof layer>);
  };

  return (
    <section className="panel">
      <header className="panel__head">
        <h2>Screen</h2>
        <span className="panel__count">{spec.brand} {spec.model}</span>
      </header>
      <div className="panel__body">
        <label className="field">
          <span>Name</span>
          <input className="input" value={layer.name} onChange={(e) => updateLayer(layer.id, { name: e.target.value })} />
        </label>

        <div className="grid2">
          <label className="field">
            <span>Cabinets across</span>
            <NumberInput min={1} max={200} value={layer.cols} onChange={(cols) => change('cols', cols)} />
          </label>
          <label className="field">
            <span>Cabinets down</span>
            <NumberInput min={1} max={200} value={layer.rows} onChange={(rows) => change('rows', rows)} />
          </label>
          <label className="field">
            <span>X offset (px)</span>
            <NumberInput value={layer.x} onChange={(x) => change('x', x)} />
          </label>
          <label className="field">
            <span>Y offset (px)</span>
            <NumberInput value={layer.y} onChange={(y) => change('y', y)} />
          </label>
        </div>

        <div className="grid2">
          <label className="field">
            <span>Tile colour</span>
            <input className="input input--color" type="color" value={layer.color} onChange={(e) => updateLayer(layer.id, { color: e.target.value })} />
          </label>
          <label className="field">
            <span>Alternate tint</span>
            <input
              className="input"
              type="range"
              min="0"
              max="0.6"
              step="0.02"
              value={layer.checkerAmount}
              onChange={(e) => updateLayer(layer.id, { checkerAmount: Number(e.target.value) })}
            />
          </label>
        </div>

        <label className="field">
          <span>Centre label</span>
          <input
            className="input"
            value={layer.label}
            placeholder="e.g. Main wall"
            onChange={(e) => updateLayer(layer.id, { label: e.target.value })}
          />
        </label>

        <div className="field">
          <span>Logo</span>
          <div className="btn-row">
            <button className="btn btn--ghost" type="button" onClick={() => logoInput.current?.click()}>
              {layer.logo ? 'Replace' : 'Add an image'}
            </button>
            {layer.logo && (
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => updateLayer(layer.id, { logo: null })}
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={logoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setLogoError(null);
              try {
                commit();
                updateLayer(layer.id, { logo: await readLogoFile(file) });
              } catch (err) {
                setLogoError(err instanceof Error ? err.message : 'That image could not be loaded');
              }
            }}
          />
          {logoError && <p className="note note--warn">{logoError}</p>}
        </div>

        {layer.logo && (
          <div className="grid2">
            <label className="field">
              <span>Logo size</span>
              <input
                className="input"
                type="range"
                min="0.05"
                max="0.9"
                step="0.05"
                value={layer.logoScale}
                onChange={(e) => updateLayer(layer.id, { logoScale: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>Logo opacity</span>
              <input
                className="input"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={layer.logoOpacity}
                onChange={(e) => updateLayer(layer.id, { logoOpacity: Number(e.target.value) })}
              />
            </label>
          </div>
        )}

        <label className="checkbox">
          <input type="checkbox" checked={layer.showNumbers} onChange={(e) => updateLayer(layer.id, { showNumbers: e.target.checked })} />
          <span>Number the cabinets</span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={layer.showSignalFlow} onChange={(e) => updateLayer(layer.id, { showSignalFlow: e.target.checked })} />
          <span>Draw the signal run</span>
        </label>

        <div className="grid2">
          <label className="field">
            <span>Feed starts at</span>
            <select className="input" value={layer.signalStart} onChange={(e) => updateLayer(layer.id, { signalStart: e.target.value as SignalStart })}>
              {SIGNAL_STARTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Run pattern</span>
            <select className="input" value={layer.signalPath} onChange={(e) => updateLayer(layer.id, { signalPath: e.target.value as SignalPath })}>
              {SIGNAL_PATHS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <dl className="stats">
          <div><dt>Resolution</dt><dd>{totals.widthPx} × {totals.heightPx} px</dd></div>
          <div><dt>Aspect</dt><dd>{totals.aspectRatio}</dd></div>
          <div><dt>Physical</dt><dd>{(totals.widthMm / 1000).toFixed(2)} × {(totals.heightMm / 1000).toFixed(2)} m</dd></div>
          <div><dt>Imperial</dt><dd>{mmToFeetInches(totals.widthMm)} × {mmToFeetInches(totals.heightMm)}</dd></div>
          <div><dt>Cabinets</dt><dd>{totals.cabinets}</dd></div>
          <div><dt>Area</dt><dd>{totals.areaM2.toFixed(2)} m²</dd></div>
          <div><dt>Megapixels</dt><dd>{totals.megapixels.toFixed(2)} MP</dd></div>
          <div>
            <dt>Weight</dt>
            <dd>{totals.weightKg != null ? `${totals.weightKg.toFixed(0)} kg / ${kgToLbs(totals.weightKg).toFixed(0)} lb` : 'not published'}</dd>
          </div>
          <div>
            <dt>Power (max)</dt>
            <dd>{totals.powerMaxW != null ? `${(totals.powerMaxW / 1000).toFixed(2)} kW` : 'not published'}</dd>
          </div>
          <div>
            <dt>Current 230 V</dt>
            <dd>{totals.amps230 != null ? `${totals.amps230.toFixed(1)} A` : '—'}</dd>
          </div>
          <div>
            <dt>Current 120 V</dt>
            <dd>{totals.amps120 != null ? `${totals.amps120.toFixed(1)} A` : '—'}</dd>
          </div>
          <div>
            <dt>Heat</dt>
            <dd>{totals.btuPerHour != null ? `${Math.round(totals.btuPerHour).toLocaleString('en-GB')} BTU/h` : '—'}</dd>
          </div>
        </dl>

        <details className="spec-details">
          <summary>Cabinet datasheet</summary>
          <dl className="stats">
            <div><dt>Pitch</dt><dd>{spec.pixelPitch} mm</dd></div>
            <div><dt>Cabinet</dt><dd>{spec.cabinet.width} × {spec.cabinet.height}{spec.cabinet.depth ? ` × ${spec.cabinet.depth}` : ''} mm</dd></div>
            <div><dt>Cabinet pixels</dt><dd>{spec.resolution.w} × {spec.resolution.h}{spec.derivedResolution ? ' (derived)' : ''}</dd></div>
            {spec.brightnessNits != null && <div><dt>Brightness</dt><dd>{spec.brightnessNits} nits</dd></div>}
            {spec.refreshHz != null && <div><dt>Refresh</dt><dd>{spec.refreshHz} Hz</dd></div>}
            {spec.scanRate && <div><dt>Scan</dt><dd>{spec.scanRate}</dd></div>}
            {spec.ipRating && <div><dt>IP</dt><dd>{spec.ipRating}</dd></div>}
            {spec.maxHanging != null && <div><dt>Max hang</dt><dd>{spec.maxHanging} panels</dd></div>}
            {spec.maxStacking != null && <div><dt>Max stack</dt><dd>{spec.maxStacking} panels</dd></div>}
          </dl>
          {spec.derivedResolution && (
            <p className="note note--warn">
              This manufacturer does not publish a panel resolution — it is calculated from cabinet size ÷ pitch.
              Verify before you build a map from it.
            </p>
          )}
          {spec.sourceUrl && (
            <p className="note">
              <a href={spec.sourceUrl} target="_blank" rel="noopener noreferrer">Manufacturer spec page ↗</a>
            </p>
          )}
        </details>

        <div className="btn-row">
          <button className="btn btn--ghost" type="button" onClick={() => exportLayerPng(layer, canvasBackground, false)}>
            Export this screen
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => exportLayerPng(layer, canvasBackground, true)}>
            …transparent
          </button>
        </div>
      </div>
    </section>
  );
}
