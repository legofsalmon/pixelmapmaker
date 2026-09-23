'use client';

import { useMemo } from 'react';
import { useEditor } from '@/state/store';
import { planForLayer } from '@/lib/curve';
import { CF_PRESETS, TRUSS_PRESETS, supportForProject, type SupportMode } from '@/lib/support';
import NumberInput from './NumberInput';
import Dialog from './Dialog';

const MODES: Array<{ value: SupportMode; label: string; blurb: string }> = [
  {
    value: 'truss-baseplates',
    label: 'Truss and baseplates',
    blurb:
      'Vertical truss uprights, each on its own ballasted baseplate, with the screen on the front face.',
  },
  {
    value: 'ground-support',
    label: 'Ground support system',
    blurb:
      'Modelled the same way — ballasted uprights carrying the screen. A proprietary system is signed off against its own load data, so treat this as a sanity check on the ballast, not a design.',
  },
  {
    value: 'hanging',
    label: 'Hanging / flown',
    blurb:
      'Flown from rigging points. Works out how many points the weight and spacing need, and checks the column height against the panel’s own hanging rating.',
  },
];

const kg = (n: number) => `${Math.round(n).toLocaleString('en-GB')} kg`;

export default function SupportPanel({ onClose }: { onClose: () => void }) {
  const name = useEditor((s) => s.name);
  const layers = useEditor((s) => s.layers);
  const support = useEditor((s) => s.support);
  const setSupport = useEditor((s) => s.setSupport);

  const results = useMemo(() => supportForProject(layers, support), [layers, support]);
  const mode = MODES.find((m) => m.value === support.mode)!;
  const ballasted = support.mode !== 'hanging';

  return (
    <Dialog
      title="Support structure"
      onClose={onClose}
      wide
      actions={<button className="btn" type="button" onClick={() => window.print()}>Print / PDF</button>}
    >
        <div className="sheet__body">
          <h3 className="sheet__title">{name}</h3>
          <p className="sheet__sub">{mode.blurb}</p>

          <section className="no-print">
            <h4>How it is built</h4>
            <div className="opt-grid">
              <label className="field">
                <span>Support</span>
                <select
                  className="input"
                  value={support.mode}
                  onChange={(e) => setSupport({ mode: e.target.value as SupportMode })}
                >
                  {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>

              {ballasted ? (
                <>
                  <label className="field">
                    <span>Truss</span>
                    <select
                      className="input"
                      value={support.trussDepth}
                      onChange={(e) => {
                        const preset = TRUSS_PRESETS.find((p) => p.depth === Number(e.target.value));
                        if (preset) setSupport({ trussDepth: preset.depth!, trussLinearMass: preset.value });
                      }}
                    >
                      {TRUSS_PRESETS.map((p) => (
                        <option key={p.label} value={p.depth}>{p.label} · {p.value} kg/m</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Upright height (m)</span>
                    <NumberInput step="0.5" min={1} value={support.trussHeight}
                      onChange={(trussHeight) => setSupport({ trussHeight })} />
                  </label>
                  <label className="field">
                    <span>Screen bottom (m)</span>
                    <NumberInput step="0.1" min={0} value={support.wallBottom}
                      onChange={(wallBottom) => setSupport({ wallBottom })} />
                  </label>
                  <label className="field">
                    <span>Plate front / back (m)</span>
                    <NumberInput step="0.1" min={0.1} max={5} value={support.plateFront}
                      onChange={(reach) => setSupport({ plateFront: reach, plateBack: reach })} />
                  </label>
                  <label className="field">
                    <span>Plate width (m)</span>
                    <NumberInput step="0.1" min={0.1} value={support.plateWidth}
                      onChange={(plateWidth) => setSupport({ plateWidth })} />
                  </label>
                  <label className="field">
                    <span>Plate mass (kg)</span>
                    <NumberInput step="5" min={0} value={support.plateMass}
                      onChange={(plateMass) => setSupport({ plateMass })} />
                  </label>
                  <label className="field">
                    <span>Ballast per plate (kg)</span>
                    <NumberInput step="25" min={0} value={support.ballastMass}
                      onChange={(ballastMass) => setSupport({ ballastMass })} />
                  </label>
                  <label className="field">
                    <span>Design wind (m/s)</span>
                    <NumberInput step="1" min={0} value={support.windSpeed}
                      onChange={(windSpeed) => setSupport({ windSpeed })} />
                  </label>
                  <label className="field">
                    <span>Force coefficient</span>
                    <select className="input" value={support.forceCoefficient}
                      onChange={(e) => setSupport({ forceCoefficient: Number(e.target.value) })}>
                      {CF_PRESETS.map((p) => <option key={p.label} value={p.value}>{p.label}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Safety factor</span>
                    <NumberInput step="0.1" min={1} value={support.safetyFactor}
                      onChange={(safetyFactor) => setSupport({ safetyFactor })} />
                  </label>
                  <label className="field">
                    <span>Max upright spacing (m)</span>
                    <NumberInput step="0.5" min={0.5} value={support.maxSpacing}
                      onChange={(maxSpacing) => setSupport({ maxSpacing })} />
                  </label>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>Point capacity (kg)</span>
                    <NumberInput step="50" min={1} value={support.pointCapacityKg}
                      onChange={(pointCapacityKg) => setSupport({ pointCapacityKg })} />
                  </label>
                  <label className="field">
                    <span>Max point spacing (m)</span>
                    <NumberInput step="0.5" min={0.5} value={support.maxPointSpacing}
                      onChange={(maxPointSpacing) => setSupport({ maxPointSpacing })} />
                  </label>
                </>
              )}
            </div>
          </section>

          {results.map((r) => (
            <section key={r.layerId} className="support-result">
              <h4>{r.layerName} — {r.widthM.toFixed(2)} × {r.heightM.toFixed(2)} m</h4>

              {r.unavailable && <p className="note note--warn">{r.unavailable}</p>}

              {r.ground && (
                <>
                  <dl className="stats stats--wide">
                    <div><dt>Uprights</dt><dd>{r.ground.uprights}</dd></div>
                    <div><dt>Spacing</dt><dd>{r.ground.spacing.toFixed(2)} m</dd></div>
                    <div><dt>Ballast per plate</dt><dd>{kg(r.ground.ballastNeededPerUpright)}</dd></div>
                    <div><dt>Ballast total</dt><dd>{kg(r.ground.ballastNeededPerUpright * r.ground.uprights)}</dd></div>
                    <div><dt>Load per upright</dt><dd>{kg(r.ground.loadPerUpright)}</dd></div>
                    <div><dt>Total mass</dt><dd>{kg(r.ground.totalMass)}</dd></div>
                    <div>
                      <dt>Holds to</dt>
                      <dd>{r.ground.limitingWindSpeed.toFixed(1)} m/s</dd>
                    </div>
                    <div>
                      <dt>Goes over at</dt>
                      <dd>{r.ground.tippingWindSpeed.toFixed(1)} m/s</dd>
                    </div>
                  </dl>
                  {/* Two separate questions: does it stay up in the design wind,
                      and can the scheme physically be built as configured. */}
                  <p className={r.ground.passes ? 'verdict verdict--ok' : 'verdict verdict--bad'}>
                    <strong>Wind:</strong>{' '}
                    {r.ground.passes
                      ? `holds at ${support.windSpeed} m/s, margin ${r.ground.worstRatio.toFixed(2)} against the ${r.ground.safetyFactor} required.`
                      : `does not hold at ${support.windSpeed} m/s — margin ${r.ground.worstRatio.toFixed(2)} against the ${r.ground.safetyFactor} required. Needs ${kg(r.ground.ballastNeededPerUpright)} per plate.`}
                  </p>
                  <p className={r.ground.buildable ? 'verdict verdict--ok' : 'verdict verdict--bad'}>
                    <strong>Buildable:</strong>{' '}
                    {r.ground.buildable
                      ? `${r.ground.uprights} uprights at ${r.ground.spacing.toFixed(2)} m fit as configured.`
                      : 'not as configured — see below.'}
                  </p>
                  {r.ground.errors.map((e, i) => <p key={i} className="note note--warn">{e}</p>)}
                  {r.ground.warnings.map((w, i) => <p key={i} className="note note--warn">{w}</p>)}
                </>
              )}

              {r.hanging && (
                <>
                  <dl className="stats stats--wide">
                    <div><dt>Hang points</dt><dd>{r.hanging.points}</dd></div>
                    <div><dt>Load per point</dt><dd>{kg(r.hanging.loadPerPointKg)}</dd></div>
                    <div><dt>Total mass</dt><dd>{kg(r.hanging.totalMassKg)}</dd></div>
                    <div><dt>Panels per column</dt><dd>{r.hanging.panelsPerColumn}</dd></div>
                  </dl>
                  {r.hanging.warnings.map((w, i) => <p key={i} className="note note--warn">{w}</p>)}
                </>
              )}
            </section>
          ))}

          {/*
            A curve changes the two numbers the solver cares about most — the
            wind area is the distance across the ends rather than the width of
            screen, and the footprint is far deeper — and it is a flat-wall
            solver. Saying so is the only honest option until the curved case is
            built; a figure that looks right and is not is worse than no figure.
          */}
          {layers.some((l) => !planForLayer(l).flat) && (
            <p className="note note--warn">
              One or more of these screens is curved or angled, and these figures treat every
              screen as flat. A curved wall presents less to the wind and stands on a deeper
              footprint, so take the numbers below as the flat-wall case, not as this build.
            </p>
          )}

          <p className="note">
            Ballast and overturning come from the{' '}
            <a href="https://github.com/legofsalmon/tipping-point" target="_blank" rel="noopener noreferrer">
              tipping-point
            </a>{' '}
            solver. This is a first pass and a sanity check on someone else&rsquo;s numbers — not a
            substitute for a structural engineer. Ground support is life-safety kit, and real designs
            are signed off against the manufacturer&rsquo;s load data and a wind standard.
          </p>
        </div>
    </Dialog>
  );
}
