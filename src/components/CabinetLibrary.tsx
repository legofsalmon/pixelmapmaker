'use client';

import { useMemo, useState } from 'react';
import {
  BRANDS,
  CABINETS,
  CATEGORIES,
  EMPTY_FILTER,
  LIBRARY_GENERATED_AT,
  customCabinet,
  filterCabinets,
  impliedPitch,
  type CabinetFilter,
} from '@/lib/cabinets';
import { useEditor } from '@/state/store';
import type { CabinetSpec } from '@/lib/types';
import NumberInput from './NumberInput';
import Icon from './Icon';

const FAVOURITES_KEY = 'pixelmapmaker.favourites.v1';

function loadFavourites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(FAVOURITES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function CabinetRow({
  cabinet,
  favourite,
  onAdd,
  onToggleFavourite,
}: {
  cabinet: CabinetSpec;
  favourite: boolean;
  onAdd: () => void;
  onToggleFavourite: () => void;
}) {
  return (
    <li className="cab">
      <button className="cab__main" type="button" onClick={onAdd} title="Add this cabinet as a new screen">
        <span className="cab__title">
          <strong>{cabinet.model}</strong>
          <em>{cabinet.brand}</em>
        </span>
        <span className="cab__meta">
          <span className="pill">{cabinet.pixelPitch} mm</span>
          <span>{cabinet.cabinet.width} × {cabinet.cabinet.height} mm</span>
          <span>{cabinet.resolution.w} × {cabinet.resolution.h} px</span>
          {cabinet.weightKg != null && <span>{cabinet.weightKg} kg</span>}
        </span>
        <span className="cab__add">+ Add screen</span>
      </button>
      <button
        className={`cab__fav${favourite ? ' is-on' : ''}`}
        type="button"
        onClick={onToggleFavourite}
        /* Stable name plus aria-pressed, so state can be queried without
           activating the control. */
        aria-pressed={favourite}
        aria-label={`Favourite ${cabinet.model}`}
      >
        <Icon name="star" filled={favourite} />
      </button>
    </li>
  );
}

export default function CabinetLibrary() {
  const [filter, setFilter] = useState<CabinetFilter>(EMPTY_FILTER);
  const [favourites, setFavourites] = useState<string[]>(loadFavourites);
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  const [customPanels, setCustomPanels] = useState<CabinetSpec[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const addLayer = useEditor((s) => s.addLayer);

  const all = useMemo(() => [...customPanels, ...CABINETS], [customPanels]);
  const results = useMemo(() => {
    const filtered = filterCabinets(all, filter);
    return showFavouritesOnly ? filtered.filter((c) => favourites.includes(c.id)) : filtered;
  }, [all, filter, showFavouritesOnly, favourites]);

  const toggleFavourite = (id: string) => {
    setFavourites((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      try {
        window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(next));
      } catch {
        // Non-fatal: favourites just will not persist.
      }
      return next;
    });
  };

  const set = (patch: Partial<CabinetFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <section className="panel">
      <header className="panel__head">
        <h2>Cabinet library</h2>
        <span className="panel__count" role="status">{results.length} of {all.length}</span>
      </header>

      <div className="panel__body">
        <p className="note">Click a cabinet to drop another screen on the canvas — add as many as you need.</p>
        <input
          className="input"
          type="search"
          aria-label="Search the cabinet library"
          placeholder="Search brand, series, model or pitch…"
          value={filter.query}
          onChange={(e) => set({ query: e.target.value })}
        />

        <div className="filters">
          <select className="input" aria-label="Filter by brand" value={filter.brand ?? ''} onChange={(e) => set({ brand: e.target.value || null })}>
            <option value="">All brands</option>
            {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="input" aria-label="Filter by cabinet type" value={filter.category ?? ''} onChange={(e) => set({ category: e.target.value || null })}>
            <option value="">All types</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className="input"
            aria-label="Filter by indoor or outdoor"
            value={filter.environment ?? ''}
            onChange={(e) => set({ environment: (e.target.value || null) as CabinetFilter['environment'] })}
          >
            <option value="">Indoor + outdoor</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </select>
        </div>

        <div className="filters">
          <label className="field">
            <span>Pitch from</span>
            <input
              className="input"
              type="number"
              step="0.1"
              min="0"
              value={filter.minPitch ?? ''}
              onFocus={(e) => e.target.select()}
              onChange={(e) => set({ minPitch: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
          <label className="field">
            <span>to (mm)</span>
            <input
              className="input"
              type="number"
              step="0.1"
              min="0"
              value={filter.maxPitch ?? ''}
              onFocus={(e) => e.target.select()}
              onChange={(e) => set({ maxPitch: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={showFavouritesOnly}
              onChange={(e) => setShowFavouritesOnly(e.target.checked)}
            />
            <span>Favourites</span>
          </label>
        </div>

        <ul className="cab-list">
          {results.slice(0, 300).map((cabinet) => (
            <CabinetRow
              key={cabinet.id}
              cabinet={cabinet}
              favourite={favourites.includes(cabinet.id)}
              onAdd={() => addLayer(cabinet)}
              onToggleFavourite={() => toggleFavourite(cabinet.id)}
            />
          ))}
          {!results.length && <li className="empty">No cabinets match those filters.</li>}
        </ul>

        <button className="btn btn--ghost" type="button" onClick={() => setShowCustomForm((v) => !v)}>
          {showCustomForm ? 'Cancel' : '+ Add a custom panel'}
        </button>

        {showCustomForm && (
          <CustomPanelForm
            onCreate={(spec) => {
              setCustomPanels((c) => [spec, ...c]);
              addLayer(spec);
              setShowCustomForm(false);
            }}
          />
        )}

        <p className="note">
          Library scraped from manufacturer spec pages
          {LIBRARY_GENERATED_AT ? ` on ${new Date(LIBRARY_GENERATED_AT).toLocaleDateString('en-GB')}` : ''}.
          Always confirm against the current datasheet before ordering.
        </p>
      </div>
    </section>
  );
}

function CustomPanelForm({ onCreate }: { onCreate: (spec: CabinetSpec) => void }) {
  const [model, setModel] = useState('');
  const [width, setWidth] = useState(500);
  const [height, setHeight] = useState(500);
  const [resW, setResW] = useState(128);
  const [resH, setResH] = useState(128);
  const [weight, setWeight] = useState('');
  const [power, setPower] = useState('');

  const pitchW = impliedPitch(width, resW);
  const pitchH = impliedPitch(height, resH);
  const square = Math.abs(pitchW - pitchH) < 0.01;

  return (
    <form
      className="custom-form"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate(
          customCabinet({
            model,
            pixelPitch: Number(pitchW.toFixed(3)),
            width,
            height,
            resW,
            resH,
            weightKg: weight ? Number(weight) : null,
            powerMaxW: power ? Number(power) : null,
          })
        );
      }}
    >
      <label className="field">
        <span>Model name</span>
        <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="My panel" required />
      </label>
      <div className="grid2">
        <label className="field">
          <span>Width (mm)</span>
          <NumberInput min={1} max={3000} value={width} onChange={setWidth} required />
        </label>
        <label className="field">
          <span>Height (mm)</span>
          <NumberInput min={1} max={3000} value={height} onChange={setHeight} required />
        </label>
        <label className="field">
          <span>Pixels across</span>
          <NumberInput min={1} max={8192} value={resW} onChange={setResW} required />
        </label>
        <label className="field">
          <span>Pixels down</span>
          <NumberInput min={1} max={8192} value={resH} onChange={setResH} required />
        </label>
        <label className="field">
          <span>Weight (kg)</span>
          <input className="input" type="number" step="0.1" min="0" value={weight} onFocus={(e) => e.target.select()} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="field">
          <span>Max power (W)</span>
          <input className="input" type="number" min="0" value={power} onFocus={(e) => e.target.select()} onChange={(e) => setPower(e.target.value)} />
        </label>
      </div>
      <p className={`note${square ? '' : ' note--warn'}`}>
        Pitch works out at {pitchW.toFixed(3)} mm across and {pitchH.toFixed(3)} mm down.
        {square ? '' : ' Those differ — check the resolution figures.'}
      </p>
      <button className="btn" type="submit">Create and place</button>
    </form>
  );
}
