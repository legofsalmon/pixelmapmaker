'use client';

import { useEditor } from '@/state/store';
import { kgToLbs, layerTotals, mmToFeetInches, projectTotals } from '@/lib/calc';
import { planForLayer } from '@/lib/curve';
import { mmLabel } from '@/lib/plan';
import { cablingForProject } from '@/lib/cabling';
import { findProcessor } from '@/lib/processors';
import { planPower } from '@/lib/power';
import { SMPTE_MIN_ANGLE_DEG, VIEWING_GRADES, viewingForProject } from '@/lib/viewing';
import { contrastForProject } from '@/lib/contrast';
import Dialog from './Dialog';

/**
 * Printable summary of the whole build. `window.print()` plus the print
 * stylesheet gives a PDF without pulling in a PDF library.
 */
export default function SpecSheet({ onClose }: { onClose: () => void }) {
  const name = useEditor((s) => s.name);
  const canvas = useEditor((s) => s.canvas);
  const layers = useEditor((s) => s.layers);
  const cabling = useEditor((s) => s.cabling);
  const power = useEditor((s) => s.power);
  const processorId = useEditor((s) => s.processorId);
  const customProcessors = useEditor((s) => s.customProcessors);
  const audience = useEditor((s) => s.audience);
  const totals = projectTotals(layers);
  const viewing = viewingForProject(layers, audience);
  const ambient = useEditor((s) => s.ambient);
  const contrast = contrastForProject(layers, ambient);
  const nearestM = Math.min(audience.nearestM, audience.furthestM);
  const furthestM = Math.max(audience.nearestM, audience.furthestM);

  /*
   * The distro plan goes on the sheet rather than only in the pick list,
   * because the service is what a venue has to be asked for weeks ahead — and
   * the sheet is the thing that leaves with the quote.
   */
  const processor = findProcessor(processorId, customProcessors);
  const supplyPlan = planPower(layers, cabling, cablingForProject(layers, cabling, processor), power);

  return (
    <Dialog
      title="Specification sheet"
      onClose={onClose}
      wide
      actions={<button className="btn" type="button" onClick={() => window.print()}>Print / save as PDF</button>}
    >
        <div className="sheet__body">
          <h3 className="sheet__title">{name}</h3>
          <p className="sheet__sub">
            Canvas {canvas.width} × {canvas.height} px · generated {new Date().toLocaleString('en-GB')}
          </p>

          <section>
            <h4>Totals</h4>
            <dl className="stats stats--wide">
              <div><dt>Screens</dt><dd>{totals.layers}</dd></div>
              <div><dt>Cabinets</dt><dd>{totals.cabinets}</dd></div>
              <div><dt>Surface area</dt><dd>{totals.areaM2.toFixed(2)} m²</dd></div>
              <div><dt>Pixels</dt><dd>{totals.megapixels.toFixed(2)} MP</dd></div>
              <div>
                <dt>Weight</dt>
                <dd>
                  {totals.weightKg != null
                    ? `${totals.weightKg.toFixed(0)} kg / ${kgToLbs(totals.weightKg).toFixed(0)} lb`
                    : '—'}
                  {totals.weightIncomplete && <em> (partial — some panels publish no weight)</em>}
                </dd>
              </div>
              <div>
                <dt>Power, max</dt>
                <dd>
                  {totals.powerMaxW != null ? `${(totals.powerMaxW / 1000).toFixed(2)} kW` : '—'}
                  {totals.powerIncomplete && <em> (partial)</em>}
                </dd>
              </div>
              <div>
                <dt>Power, average</dt>
                <dd>{totals.powerAvgW != null ? `${(totals.powerAvgW / 1000).toFixed(2)} kW` : '—'}</dd>
              </div>
              <div>
                <dt>Heat load</dt>
                <dd>{totals.btuPerHour != null ? `${Math.round(totals.btuPerHour).toLocaleString('en-GB')} BTU/h` : '—'}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h4>Power distribution</h4>
            <dl className="stats stats--wide">
              <div><dt>Supply</dt><dd>{supplyPlan.supply.label}</dd></div>
              <div>
                <dt>Circuits</dt>
                <dd>
                  {supplyPlan.circuits} at {cabling.maxAmpsPerCircuit} A
                  <br />
                  <small>{supplyPlan.distros} distro{supplyPlan.distros === 1 ? '' : 's'}, {supplyPlan.waysPerDistro} ways each</small>
                </dd>
              </div>
              <div>
                <dt>Worst leg</dt>
                <dd>
                  {supplyPlan.worstLegAmps.toFixed(1)} A
                  {supplyPlan.incomplete && <em> (partial)</em>}
                </dd>
              </div>
              <div>
                <dt>Feed wanted</dt>
                <dd>
                  {supplyPlan.recommendedService != null
                    ? `${supplyPlan.recommendedService} A a leg`
                    : 'more than anything stocked'}
                  {supplyPlan.connector && supplyPlan.recommendedService != null && (
                    <><br /><small>{supplyPlan.connector}</small></>
                  )}
                </dd>
              </div>
            </dl>
            <table className="sheet__table">
              <thead>
                <tr>
                  <th>Leg</th>
                  <th>Circuits</th>
                  <th>Max power</th>
                  <th>Current</th>
                  <th>Of a {supplyPlan.serviceAmpsPerLeg} A feed</th>
                </tr>
              </thead>
              <tbody>
                {supplyPlan.legs.map((leg) => (
                  <tr key={leg.name}>
                    <td>{leg.name}</td>
                    <td>{leg.circuits.length}</td>
                    <td>{(leg.maxW / 1000).toFixed(2)} kW</td>
                    <td>{leg.amps.toFixed(1)} A</td>
                    <td>{Math.round(leg.utilisation * 100)}%{leg.overloaded ? ' — over' : ''}</td>
                  </tr>
                ))}
                {supplyPlan.neutralAmps != null && (
                  <tr>
                    <td>Neutral</td>
                    <td>—</td>
                    <td>—</td>
                    <td>{supplyPlan.neutralAmps.toFixed(1)} A</td>
                    <td>size it for a full leg</td>
                  </tr>
                )}
              </tbody>
            </table>
            {supplyPlan.warnings.map((warning) => (
              <p key={warning} className="note note--warn">{warning}</p>
            ))}
          </section>

          <section>
            <h4>Screens</h4>
            <table className="sheet__table">
              <thead>
                <tr>
                  <th>Screen</th>
                  <th>Cabinet</th>
                  <th>Pitch</th>
                  <th>Grid</th>
                  <th>Resolution</th>
                  <th>Size</th>
                  <th>Shape</th>
                  <th>Position</th>
                  <th>Weight</th>
                  <th>Max power</th>
                </tr>
              </thead>
              <tbody>
                {layers.map((layer) => {
                  const t = layerTotals(layer);
                  const plan = planForLayer(layer);
                  return (
                    <tr key={layer.id}>
                      <td>{layer.name}</td>
                      <td>{layer.spec.brand} {layer.spec.model}</td>
                      <td>{layer.spec.pixelPitch} mm</td>
                      <td>{layer.cols} × {layer.rows}</td>
                      <td>{t.widthPx} × {t.heightPx}</td>
                      <td>
                        {(t.widthMm / 1000).toFixed(2)} × {(t.heightMm / 1000).toFixed(2)} m
                        <br />
                        <small>{mmToFeetInches(t.widthMm)} × {mmToFeetInches(t.heightMm)}</small>
                      </td>
                      {/*
                        Width in the column before this one is measured along
                        the wall, which for a curve is not the space it needs on
                        the floor. A crew marking out a room wants both, so a
                        shaped screen carries its footprint here.
                      */}
                      <td>
                        {plan.flat ? (
                          'Flat'
                        ) : (
                          <>
                            {plan.radiusMm != null
                              ? `Curved, R ${mmLabel(plan.radiusMm)}`
                              : `Angled, ${plan.jointAngles.filter((a) => a !== 0).length} corner${
                                  plan.jointAngles.filter((a) => a !== 0).length === 1 ? '' : 's'
                                }`}
                            <br />
                            <small>
                              {mmLabel(plan.spanMm)} across, {mmLabel(plan.footprintMm.depth)} deep,{' '}
                              {plan.includedAngleDeg.toFixed(0)}° turn
                            </small>
                          </>
                        )}
                      </td>
                      <td>{layer.x}, {layer.y}</td>
                      <td>{t.weightKg != null ? `${t.weightKg.toFixed(0)} kg` : '—'}</td>
                      <td>{t.powerMaxW != null ? `${(t.powerMaxW / 1000).toFixed(2)} kW` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {viewing.length > 0 && (
            <section>
              <h4>Viewing</h4>
              <p className="sheet__sub">
                Read against an audience from {nearestM.toFixed(1)} m to {furthestM.toFixed(0)} m.
                Arcminutes are how much of the field of view one pixel takes up; 20/20 vision
                separates detail down to one.
              </p>
              <table className="sheet__table">
                <thead>
                  <tr>
                    <th>Screen</th>
                    <th>Pitch</th>
                    <th>At {nearestM.toFixed(1)} m</th>
                    <th>At {furthestM.toFixed(0)} m</th>
                    <th>Pixels vanish at</th>
                    <th>Fills the view</th>
                    <th>Detail at the back</th>
                  </tr>
                </thead>
                <tbody>
                  {viewing.map((v) => (
                    <tr key={v.layerId}>
                      <td>{v.layerName}</td>
                      <td>{v.pitchMm} mm</td>
                      <td>
                        {v.near.arcminutesPerPixel.toFixed(1)}&#8242;
                        <br />
                        <small>{VIEWING_GRADES[v.near.grade].label}</small>
                      </td>
                      <td>
                        {v.far.arcminutesPerPixel.toFixed(1)}&#8242;
                        <br />
                        <small>{VIEWING_GRADES[v.far.grade].label}</small>
                      </td>
                      <td>{v.acuityDistanceM.toFixed(1)} m</td>
                      <td>
                        {v.near.angleDeg.toFixed(1)}&deg; &rarr; {v.far.angleDeg.toFixed(1)}&deg;
                        <br />
                        <small>SMPTE asks {SMPTE_MIN_ANGLE_DEG}&deg;</small>
                      </td>
                      <td>{Math.round(v.far.resolvedFraction * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {contrast.length > 0 && (
            <section>
              <h4>Brightness</h4>
              <p className="sheet__sub">
                Read at {ambient.lux.toLocaleString('en-GB')} lux on the screen face, a{' '}
                {(ambient.reflectance * 100).toFixed(1)}% reflectance and a {ambient.targetContrast}:1
                target. Reflected light lands under the blacks, so it is what sets the contrast.
              </p>
              <table className="sheet__table">
                <thead>
                  <tr>
                    <th>Screen</th>
                    <th>Panel brightness</th>
                    <th>Reflected floor</th>
                    <th>Contrast here</th>
                    <th>Needed for {ambient.targetContrast}:1</th>
                    <th>Holds to</th>
                  </tr>
                </thead>
                <tbody>
                  {contrast.map((c) => (
                    <tr key={c.layerId}>
                      <td>{c.layerName}</td>
                      <td>
                        {c.peakNits != null ? `${c.peakNits.toLocaleString('en-GB')} nits` : '—'}
                        {c.peakNits == null && (
                          <>
                            <br />
                            <small>{c.implausibleNits != null ? 'published figure not credible' : 'not published'}</small>
                          </>
                        )}
                      </td>
                      <td>{Math.round(c.floorNits).toLocaleString('en-GB')} nits</td>
                      <td>
                        {c.contrast != null ? `${c.contrast.toFixed(1)}:1` : '—'}
                        {c.meetsTarget === false && (
                          <>
                            <br />
                            <small>under target</small>
                          </>
                        )}
                      </td>
                      <td>{Math.round(c.nitsForTarget).toLocaleString('en-GB')} nits</td>
                      <td>
                        {c.luxAtTarget == null
                          ? '—'
                          : Number.isFinite(c.luxAtTarget)
                            ? `${Math.round(c.luxAtTarget).toLocaleString('en-GB')} lux`
                            : 'any light'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <p className="note">
            Figures come from published manufacturer specifications and are for planning only.
            Confirm weights, power and rigging limits against the current datasheet and a
            qualified rigger before load-in.
          </p>
        </div>
    </Dialog>
  );
}
