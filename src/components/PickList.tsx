'use client';

import { useMemo, useState } from 'react';
import { useEditor } from '@/state/store';
import { PROCESSORS, customProcessor, findProcessor, pixelsPerPort, pixelsPerPortAt, signalScale } from '@/lib/processors';
import { buildPickList, pickListCsv } from '@/lib/picklist';
import { assignPorts } from '@/lib/cabling';
import { SUPPLIES, getSupply } from '@/lib/power';
import { RUN_COLOURS } from '@/lib/render';
import type { LineCategory } from '@/lib/picklist';
import NumberInput from './NumberInput';
import Icon from './Icon';
import Dialog from './Dialog';

const CATEGORY_ORDER: LineCategory[] = ['Cabinets', 'Processing', 'Data', 'Power', 'Transport'];

function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9-_]+/gi, '_') || 'picklist'}_picklist.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function PickList({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'list' | 'cabling' | 'power'>('list');
  const name = useEditor((s) => s.name);
  const layers = useEditor((s) => s.layers);
  const processorId = useEditor((s) => s.processorId);
  const cabling = useEditor((s) => s.cabling);
  const options = useEditor((s) => s.pickList);
  const power = useEditor((s) => s.power);
  const setPower = useEditor((s) => s.setPower);
  const setProcessor = useEditor((s) => s.setProcessor);
  const setCabling = useEditor((s) => s.setCabling);
  const setPickList = useEditor((s) => s.setPickList);
  const customProcessors = useEditor((s) => s.customProcessors);
  const addCustomProcessor = useEditor((s) => s.addCustomProcessor);
  const removeCustomProcessor = useEditor((s) => s.removeCustomProcessor);
  const [showProcessorForm, setShowProcessorForm] = useState(false);

  const processor = findProcessor(processorId, customProcessors);
  const { lines, cabling: runs, processors, power: supplyPlan } = useMemo(
    () => buildPickList(layers, cabling, processor, options, power),
    [layers, cabling, processor, options, power]
  );
  // Ports belong to the project, not to a screen, so they are dealt out once
  // across every run rather than numbered from 1 inside each screen.
  const portMap = useMemo(
    () => assignPorts(runs.screens, processor, processors.count, cabling.backupPorts),
    [runs.screens, processor, processors.count, cabling.backupPorts]
  );

  return (
    <Dialog
      title="Pick list"
      onClose={onClose}
      wide
      actions={
        <>
          <button className="btn" type="button" onClick={() => window.print()}>Print / PDF</button>
          <button className="btn btn--secondary" type="button" onClick={() => downloadCsv(name, pickListCsv(lines, name))}>
            CSV
          </button>
        </>
      }
    >
        <nav className="tabs no-print">
          <button type="button" className={tab === 'list' ? 'is-active' : ''} aria-current={tab === 'list'} onClick={() => setTab('list')}>
            Pick list
          </button>
          <button type="button" className={tab === 'cabling' ? 'is-active' : ''} aria-current={tab === 'cabling'} onClick={() => setTab('cabling')}>
            Cabling
          </button>
          <button type="button" className={tab === 'power' ? 'is-active' : ''} aria-current={tab === 'power'} onClick={() => setTab('power')}>
            Power
          </button>
        </nav>

        <div className="sheet__body">
          <h3 className="sheet__title">{name}</h3>
          <p className="sheet__sub">
            {layers.length} screen{layers.length === 1 ? '' : 's'} · generated{' '}
            {new Date().toLocaleString('en-GB')}
          </p>

          <section className="no-print" hidden={tab === 'power'}>
            <h4>Processing and cabling</h4>
            <div className="opt-grid">
              <label className="field">
                <span>Processor</span>
                <select className="input" value={processorId} onChange={(e) => setProcessor(e.target.value)}>
                  {customProcessors.length > 0 && (
                    <optgroup label="Yours">
                      {customProcessors.map((p) => (
                        <option key={p.id} value={p.id}>{p.brand} {p.model}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Library">
                    {PROCESSORS.map((p) => (
                      <option key={p.id} value={p.id}>{p.brand} {p.model}</option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <label className="field">
                <span>Cabling</span>
                <select
                  className="input"
                  value={cabling.mode}
                  onChange={(e) => setCabling({ mode: e.target.value as 'auto' | 'manual' })}
                >
                  <option value="auto">Work it out for me</option>
                  <option value="manual">I will set the runs</option>
                </select>
              </label>

              {cabling.mode === 'manual' ? (
                <>
                  <label className="field">
                    <span>Panels per data run</span>
                    <NumberInput
                      min={1}
                      value={cabling.cabinetsPerDataRun}
                      onChange={(cabinetsPerDataRun) => setCabling({ cabinetsPerDataRun })}
                    />
                  </label>
                  <label className="field">
                    <span>Panels per circuit</span>
                    <NumberInput
                      min={1}
                      value={cabling.cabinetsPerPowerRun}
                      onChange={(cabinetsPerPowerRun) => setCabling({ cabinetsPerPowerRun })}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>Supply voltage</span>
                    <NumberInput
                      min={100}
                      max={480}
                      value={cabling.supplyVoltage}
                      onChange={(supplyVoltage) => setCabling({ supplyVoltage })}
                    />
                  </label>
                  <label className="field">
                    <span>Amps per circuit</span>
                    <NumberInput
                      min={1}
                      max={200}
                      value={cabling.maxAmpsPerCircuit}
                      onChange={(maxAmpsPerCircuit) => setCabling({ maxAmpsPerCircuit })}
                    />
                  </label>
                  <label className="field">
                    <span>Colour depth</span>
                    <select
                      className="input"
                      value={cabling.bitDepth}
                      onChange={(e) => setCabling({ bitDepth: Number(e.target.value) })}
                    >
                      <option value={8}>8-bit</option>
                      <option value={10}>10-bit</option>
                      <option value={12}>12-bit</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Refresh</span>
                    <select
                      className="input"
                      value={cabling.refreshHz}
                      onChange={(e) => setCabling({ refreshHz: Number(e.target.value) })}
                    >
                      <option value={50}>50 Hz</option>
                      <option value={60}>60 Hz</option>
                      <option value={100}>100 Hz</option>
                      <option value={120}>120 Hz</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Longest chain</span>
                    <NumberInput
                      min={1}
                      max={200}
                      value={cabling.maxCabinetsPerChain}
                      onChange={(maxCabinetsPerChain) => setCabling({ maxCabinetsPerChain })}
                    />
                  </label>
                  <label className="field">
                    <span>Circuit loaded to</span>
                    <select
                      className="input"
                      value={cabling.circuitUtilisation}
                      onChange={(e) => setCabling({ circuitUtilisation: Number(e.target.value) })}
                    >
                      <option value={1}>100%</option>
                      <option value={0.9}>90%</option>
                      <option value={0.8}>80%</option>
                      <option value={0.7}>70%</option>
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="btn-row">
              <button className="btn btn--secondary" type="button" onClick={() => setShowProcessorForm((v) => !v)}>
                {showProcessorForm ? 'Cancel' : '+ Add your own processor'}
              </button>
              {processor.custom && (
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={() => removeCustomProcessor(processor.id)}
                >
                  Remove {processor.model}
                </button>
              )}
            </div>

            {showProcessorForm && (
              <ProcessorForm
                onCreate={(p) => {
                  addCustomProcessor(p);
                  setShowProcessorForm(false);
                }}
              />
            )}

            <p className="note">
              {processor.note}{' '}
              {processor.sourceUrl ? (
                <a href={processor.sourceUrl} target="_blank" rel="noopener noreferrer">Manufacturer <Icon name="external" size={12} /></a>
              ) : null}{' '}
              Port capacity works out at {pixelsPerPort(processor).toLocaleString('en-GB')} pixels — real
              capacity moves with bit depth and refresh rate.
            </p>
          </section>

          <section className="no-print" hidden={tab === 'power'}>
            <h4>Quantities</h4>
            <div className="opt-grid">
              <label className="field">
                <span>Contingency</span>
                <select
                  className="input"
                  value={options.contingency}
                  onChange={(e) => setPickList({ contingency: Number(e.target.value) })}
                >
                  <option value={0}>None</option>
                  <option value={0.05}>+5%</option>
                  <option value={0.1}>+10%</option>
                  <option value={0.15}>+15%</option>
                  <option value={0.2}>+20%</option>
                </select>
              </label>
              <label className="field">
                <span>Panels per case</span>
                <NumberInput
                  min={0}
                  max={64}
                  value={options.cabinetsPerCase}
                  onChange={(cabinetsPerCase) => setPickList({ cabinetsPerCase })}
                />
              </label>
              <label className="field">
                <span>Cables per bundle</span>
                <NumberInput
                  min={0}
                  max={100}
                  value={options.cablesPerBundle}
                  onChange={(cablesPerBundle) => setPickList({ cablesPerBundle })}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={options.roundToPacks}
                  onChange={(e) => setPickList({ roundToPacks: e.target.checked })}
                />
                <span>Round up to whole cases and bundles</span>
              </label>
            </div>
          </section>

          {tab === 'list' ? (
            <section>
              <h4>To pull</h4>
              <table className="sheet__table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Required</th>
                    <th>+{Math.round(options.contingency * 100)}%</th>
                    <th>Pull</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                {CATEGORY_ORDER.filter((c) => lines.some((l) => l.category === c)).map((category) => (
                  <tbody key={category}>
                    <tr className="group-row">
                      <th colSpan={5}>{category}</th>
                    </tr>
                    {lines
                      .filter((l) => l.category === category)
                      .map((l) => (
                        <tr key={`${l.category}-${l.item}`}>
                          <td>
                            {l.item}
                            {l.detail && <><br /><small>{l.detail}</small></>}
                          </td>
                          <td>{l.required}</td>
                          <td>{l.withContingency}</td>
                          <td>
                            <strong>{l.quantity}</strong>
                            {l.packs != null && <><br /><small>{l.packs} {l.packName}{l.packs === 1 ? '' : 's'}</small></>}
                          </td>
                          <td>{l.unit}</td>
                        </tr>
                      ))}
                  </tbody>
                ))}
              </table>
              <p className="note">
                {processors.count} × {processor.model} — {processors.byPixels} by pixel count,{' '}
                {processors.byPorts} by port count, so {processors.limitedBy} decides.
                Cabling and quantities are a planning aid, not a signed-off design.
              </p>
            </section>
          ) : tab === 'cabling' ? (
            <section>
              <h4>Runs per screen</h4>
              <table className="sheet__table">
                <thead>
                  <tr>
                    <th>Screen</th>
                    <th>Panels</th>
                    <th>Data runs</th>
                    <th>Panels per run</th>
                    <th>Limited by</th>
                    <th>Circuits</th>
                    <th>Panels per circuit</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.screens.map((s) => (
                    <tr key={s.layerId}>
                      <td>{s.layerName}</td>
                      <td>{s.cabinets}</td>
                      <td>{s.data.runs}</td>
                      <td>{s.data.cabinetsPerRun}</td>
                      <td><small>{s.data.limitedBy}</small></td>
                      <td>{s.power.runs}</td>
                      <td>{s.power.cabinetsPerRun}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/*
                Stated rather than left to be inferred: both of these cost
                ports, and the number they cost depends on the wall, so the
                reader needs the rule and the table together.
              */}
              <div className="btn-row">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={cabling.dataRunsEndAtEdge}
                    onChange={(e) => setCabling({ dataRunsEndAtEdge: e.target.checked })}
                  />
                  <span>End data runs at the screen edge</span>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={cabling.powerRunsEndAtEdge}
                    onChange={(e) => setCabling({ powerRunsEndAtEdge: e.target.checked })}
                  />
                  <span>End power runs at the screen edge</span>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={cabling.backupPorts}
                    onChange={(e) => setCabling({ backupPorts: e.target.checked })}
                  />
                  <span>Close each data run to a backup port</span>
                </label>
              </div>
              {cabling.backupPorts && (
                <p className="note">
                  Each chain is fed at the head and picked up at the tail by a second port, so a
                  break anywhere in it is covered from the other side and the processor swaps over
                  within a frame. It costs a port and a long cable per run:{' '}
                  {runs.portsNeeded} ports for {runs.dataRuns} runs, and {runs.backupFeeds} return
                  cables from the far end of each chain back to the rack.
                </p>
              )}
              <p className="note">
                A run that stops mid-wall leaves its tail cable hanging on the face of the
                screen. Ending on an edge puts every termination where the racks are, at the
                cost of shortening each run to a whole number of rows — the capacity that
                leaves unused comes back as extra ports and circuits, which the table above
                already counts.
              </p>
              <p className="note">
                Capacity moves with the signal, not just the panel. A pixel costs three
                channels of colour on every refresh, so {cabling.bitDepth}-bit at{' '}
                {cabling.refreshHz} Hz carries{' '}
                {Math.round(signalScale(processor, cabling.bitDepth, cabling.refreshHz) * 100)}% of
                what {processor.model} is quoted at ({processor.baselineBitDepth}-bit,{' '}
                {processor.baselineHz} Hz) — {pixelsPerPortAt(processor, cabling.bitDepth, cabling.refreshHz).toLocaleString('en-GB')}{' '}
                pixels a port against {pixelsPerPort(processor).toLocaleString('en-GB')}. Doubling
                the refresh halves it; going 8-bit to 10-bit costs a fifth.
              </p>

              <h4>Patch</h4>
              {runs.screens.map((s) => {
                const ports = portMap.get(s.layerId) ?? [];
                return (
                  <div key={s.layerId} className="patch">
                    <strong>{s.layerName}</strong>
                    <ol className="patch__runs">
                      {s.runOrder.map((run, i) => (
                        <li key={i}>
                          {/* Same colour the canvas draws this run in, so the
                              list and the diagram read as one thing. */}
                          <span
                            className="patch__swatch"
                            style={{ background: RUN_COLOURS[i % RUN_COLOURS.length] }}
                            aria-hidden="true"
                          />
                          {/* A loop is patched at both ends, so both are named. */}
                          {ports[i]
                            ? ports[i].backup
                              ? `${ports[i].label} → ${ports[i].backup.label} (backup)`
                              : ports[i].label
                            : `Port ${i + 1}`}
                          : {run.length} panel
                          {run.length === 1 ? '' : 's'} — from col {run[0][0] + 1}, row {run[0][1] + 1}
                          {' '}to col {run[run.length - 1][0] + 1}, row {run[run.length - 1][1] + 1}
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
              <p className="note">
                Runs follow each screen&rsquo;s feed corner and run pattern, set in the screen inspector.
                Ports are dealt out across the whole project, so no two screens share one.
              </p>
              {runs.longHops > 0 && (
                <p className="note note--warn">
                  {runs.longHops} hop{runs.longHops === 1 ? '' : 's'} in these runs land on a cabinet
                  that is not touching the one before it, so they need a cable back across the screen
                  rather than a short jumper. A serpentine run pattern removes them.
                </p>
              )}
            </section>
          ) : (
            <section>
              <h4 className="no-print">The supply</h4>
              <div className="opt-grid no-print">
                <label className="field">
                  <span>Supply</span>
                  <select
                    className="input"
                    value={power.supplyId}
                    onChange={(e) => {
                      const supply = getSupply(e.target.value);
                      setPower({ supplyId: supply.id });
                      /*
                       * Circuits are sized by the cabling rules, and a cabinet
                       * sits between one line and neutral — so the voltage that
                       * sizes a circuit is this supply's phase voltage, not the
                       * name on the service. Setting both from one control is
                       * what keeps the pick list and this tab agreeing.
                       */
                      setCabling({ supplyVoltage: supply.phaseVolts });
                    }}
                  >
                    {SUPPLIES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Feed per leg</span>
                  <NumberInput
                    min={1}
                    max={600}
                    value={power.serviceAmpsPerLeg}
                    onChange={(serviceAmpsPerLeg) => setPower({ serviceAmpsPerLeg })}
                  />
                </label>
                <label className="field">
                  <span>Ways per distro</span>
                  <NumberInput
                    min={1}
                    max={48}
                    value={power.waysPerDistro}
                    onChange={(waysPerDistro) => setPower({ waysPerDistro })}
                  />
                </label>
                <label className="field">
                  <span>Power factor</span>
                  <NumberInput
                    step="0.01"
                    min={0.5}
                    max={1}
                    value={power.powerFactor}
                    onChange={(powerFactor) => setPower({ powerFactor })}
                  />
                </label>
              </div>

              <h4>
                {supplyPlan.supply.label} — {supplyPlan.supply.where}
              </h4>
              <dl className="stats stats--wide">
                <div>
                  <dt>Load, max</dt>
                  <dd>{(supplyPlan.totalMaxW / 1000).toFixed(2)} kW</dd>
                </div>
                <div>
                  <dt>Load, average</dt>
                  <dd>{(supplyPlan.totalAvgW / 1000).toFixed(2)} kW</dd>
                </div>
                <div>
                  <dt>Worst leg</dt>
                  <dd>{supplyPlan.worstLegAmps.toFixed(1)} A</dd>
                </div>
                <div>
                  <dt>If it split evenly</dt>
                  <dd>{supplyPlan.balancedAmps.toFixed(1)} A a leg</dd>
                </div>
                {supplyPlan.neutralAmps != null && (
                  <div>
                    <dt>Neutral</dt>
                    <dd>{supplyPlan.neutralAmps.toFixed(1)} A</dd>
                  </div>
                )}
                {supplyPlan.supply.legs === 3 && (
                  <div>
                    <dt>Legs apart</dt>
                    <dd>{supplyPlan.imbalancePercent.toFixed(0)}%</dd>
                  </div>
                )}
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
                <div>
                  <dt>Distros</dt>
                  <dd>
                    {supplyPlan.distros}
                    <br />
                    <small>{supplyPlan.ways.length} of {supplyPlan.distros * supplyPlan.waysPerDistro} ways used</small>
                  </dd>
                </div>
              </dl>

              {supplyPlan.warnings.map((warning) => (
                <p key={warning} className="note note--warn">{warning}</p>
              ))}

              <h4>Across the legs</h4>
              <table className="sheet__table">
                <thead>
                  <tr>
                    <th>Leg</th>
                    <th>Circuits</th>
                    <th>Max</th>
                    <th>Current</th>
                    <th>Of the {supplyPlan.serviceAmpsPerLeg} A feed</th>
                  </tr>
                </thead>
                <tbody>
                  {supplyPlan.legs.map((leg) => (
                    <tr key={leg.name}>
                      <td>{leg.name}</td>
                      <td>{leg.circuits.length}</td>
                      <td>{(leg.maxW / 1000).toFixed(2)} kW</td>
                      <td>{leg.amps.toFixed(1)} A</td>
                      <td>
                        {Math.round(leg.utilisation * 100)}%
                        {leg.overloaded && <> — <strong>over</strong></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {supplyPlan.ways.length > 0 && (
                <>
                  <h4>Way by way</h4>
                  <table className="sheet__table">
                    <thead>
                      <tr>
                        <th>Distro</th>
                        <th>Way</th>
                        <th>Leg</th>
                        <th>Screen</th>
                        <th>Panels</th>
                        <th>Current</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplyPlan.ways.map((w) => (
                        <tr key={`${w.distro}-${w.way}`}>
                          <td>{w.distro}</td>
                          <td>{w.way}</td>
                          <td>{w.leg}</td>
                          <td>{w.circuit.layerName}</td>
                          <td>{w.circuit.cabinets}</td>
                          <td>{w.circuit.amps != null ? `${w.circuit.amps.toFixed(1)} A` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <p className="note">
                A cabinet&rsquo;s power supply sits between one line and neutral, so it sees{' '}
                {supplyPlan.supply.phaseVolts} V and its leg carries the watts on it divided by that
                — the &radic;3 in the three-phase formula is for a load wired across all three lines,
                and using it per leg reads 42% low.
                {supplyPlan.supply.legs === 3 && (
                  <>
                    {' '}Ways rotate L1, L2, L3 across the distro, and circuits are dealt heaviest
                    first onto whichever leg is lightest. The neutral figure is the fundamental
                    only: switch-mode panel supplies add third-harmonic current that does not
                    cancel, so size the neutral for a full leg rather than for that number.
                  </>
                )}
              </p>
            </section>
          )}
        </div>
    </Dialog>
  );
}

function ProcessorForm({ onCreate }: { onCreate: (p: ReturnType<typeof customProcessor>) => void }) {
  const [model, setModel] = useState('');
  const [brand, setBrand] = useState('');
  const [ports, setPorts] = useState(8);
  const [portType, setPortType] = useState<'1G' | '10G'>('1G');
  const [megapixels, setMegapixels] = useState(4.5);

  const perPort = Math.floor((megapixels * 1_000_000) / Math.max(1, ports));

  return (
    <form
      className="custom-form"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate(
          customProcessor({ model, brand, ports, portType, totalPixels: megapixels * 1_000_000 })
        );
      }}
    >
      <div className="opt-grid">
        <label className="field">
          <span>Make</span>
          <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brompton" />
        </label>
        <label className="field">
          <span>Model</span>
          <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Tessera S8" required />
        </label>
        <label className="field">
          <span>Output ports</span>
          <NumberInput min={1} max={64} value={ports} onChange={setPorts} required />
        </label>
        <label className="field">
          <span>Port type</span>
          <select className="input" value={portType} onChange={(e) => setPortType(e.target.value as '1G' | '10G')}>
            <option value="1G">1G copper</option>
            <option value="10G">10G</option>
          </select>
        </label>
        <label className="field">
          <span>Capacity (MP)</span>
          <NumberInput step="0.1" min={0.1} max={200} value={megapixels} onChange={setMegapixels} required />
        </label>
      </div>
      <p className="note">
        That works out at {perPort.toLocaleString('en-GB')} pixels a port. It is saved with the
        project.
      </p>
      <button className="btn" type="submit">Add it</button>
    </form>
  );
}
