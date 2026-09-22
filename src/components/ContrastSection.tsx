'use client';

import { useEditor } from '@/state/store';
import { AMBIENT_PRESETS, contrastForLayer } from '@/lib/contrast';
import type { Layer } from '@/lib/types';
import NumberInput from './NumberInput';
import Section from './Section';

const nits = (n: number) => `${Math.round(n).toLocaleString('en-GB')} nits`;

export default function ContrastSection({ layer }: { layer: Layer }) {
  const ambient = useEditor((s) => s.ambient);
  const setAmbient = useEditor((s) => s.setAmbient);

  const c = contrastForLayer(layer, ambient);

  return (
    <Section id="ambient" title="Brightness" hint="ambient light, contrast">
      {/*
        Light belongs to the room, like audience distance, so it is held once
        for the project. Reflectance is the one assumption in here and it is
        exposed rather than buried, because it moves the answer as much as the
        panel does and nobody publishes it.
      */}
      <label className="field">
        <span>Light on the screen</span>
        <select
          className="input"
          value={ambient.lux}
          onChange={(e) => setAmbient({ lux: Number(e.target.value) })}
        >
          {AMBIENT_PRESETS.map((p) => (
            <option key={p.label} value={p.lux}>
              {p.label} — {p.lux.toLocaleString('en-GB')} lux ({p.note})
            </option>
          ))}
          {!AMBIENT_PRESETS.some((p) => p.lux === ambient.lux) && (
            <option value={ambient.lux}>{ambient.lux.toLocaleString('en-GB')} lux (measured)</option>
          )}
        </select>
      </label>

      <div className="grid2">
        <label className="field">
          <span>Measured (lux)</span>
          <NumberInput min={0} step={10} value={ambient.lux} onChange={(lux) => setAmbient({ lux })} />
        </label>
        <label className="field">
          <span>Face reflectance (%)</span>
          <NumberInput
            min={0.5}
            max={40}
            step={0.5}
            value={Number((ambient.reflectance * 100).toFixed(1))}
            onChange={(pct) => setAmbient({ reflectance: pct / 100 })}
          />
        </label>
        <label className="field">
          <span>Contrast needed</span>
          <NumberInput
            min={1}
            step={5}
            value={ambient.targetContrast}
            onChange={(targetContrast) => setAmbient({ targetContrast })}
          />
        </label>
      </div>

      {c.contrast != null ? (
        <p className={`verdict ${c.meetsTarget ? 'verdict--ok' : 'verdict--bad'}`}>
          <strong>{c.contrast.toFixed(1)}:1 here.</strong>{' '}
          {c.meetsTarget
            ? `Clear of the ${ambient.targetContrast}:1 you asked for.`
            : `Short of the ${ambient.targetContrast}:1 you asked for.`}
        </p>
      ) : (
        <p className="verdict verdict--warn">
          <strong>No usable brightness figure.</strong> The contrast cannot be worked out for this
          panel.
        </p>
      )}

      <dl className="stats stats--stacked">
        <div>
          <dt>Panel brightness</dt>
          <dd>
            {c.peakNits != null ? nits(c.peakNits) : '—'}
            <em>{c.peakNits != null ? 'published' : 'not published'}</em>
          </dd>
        </div>
        <div>
          <dt>Reflected floor</dt>
          <dd>
            {nits(c.floorNits)}
            <em>under every black pixel</em>
          </dd>
        </div>
        <div>
          <dt>Needed for {ambient.targetContrast}:1</dt>
          <dd>
            {nits(c.nitsForTarget)}
            <em>peak, in this light</em>
          </dd>
        </div>
        <div>
          <dt>Holds {ambient.targetContrast}:1 to</dt>
          <dd>
            {c.luxAtTarget == null
              ? '—'
              : Number.isFinite(c.luxAtTarget)
                ? `${Math.round(c.luxAtTarget).toLocaleString('en-GB')} lux`
                : 'any light'}
            <em>on the screen face</em>
          </dd>
        </div>
      </dl>

      {c.notes.map((note, i) => (
        <p key={i} className={c.implausibleNits != null && i === 0 ? 'note note--warn' : 'note'}>
          {note}
        </p>
      ))}

      <p className="note">
        Reflected light is ambient × reflectance ÷ π, and the panel&rsquo;s own black is taken as
        zero because it sits far below that floor in any lit room. The contrast your content needs
        is yours to set — ANSI/AVIXA V201.01:2021 is where a specified figure comes from.
      </p>
    </Section>
  );
}
