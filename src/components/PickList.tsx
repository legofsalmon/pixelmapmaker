'use client';

import { useMemo, useState } from 'react';
import { useEditor } from '@/state/store';
import { PROCESSORS, customProcessor, findProcessor, pixelsPerPort } from '@/lib/processors';
import { buildPickList, pickListCsv } from '@/lib/picklist';
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
  const [tab, setTab] = useState<'list' | 'cabling'>('list');
  const name = useEditor((s) => s.name);
  const layers = useEditor((s) => s.layers);
  const processorId = useEditor((s) => s.processorId);
  const cabling = useEditor((s) => s.cabling);
  const options = useEditor((s) => s.pickList);
  const setProcessor = useEditor((s) => s.setProcessor);
  const setCabling = useEditor((s) => s.setCabling);
  const setPickList = useEditor((s) => s.setPickList);
  const customProcessors = useEditor((s) => s.customProcessors);
  const addCustomProcessor = useEditor((s) => s.addCustomProcessor);
  const removeCustomProcessor = useEditor((s) => s.removeCustomProcessor);
  const [showProcessorForm, setShowProcessorForm] = useState(false);

  const processor = findProcessor(processorId, customProcessors);
  const { lines, cabling: runs, processors } = useMemo(
    () => buildPickList(layers, cabling, processor, options),
    [layers, cabling, processor, options]
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
        </nav>

        <div className="sheet__body">
          <h3 className="sheet__title">{name}</h3>
          <p className="sheet__sub">
            {layers.length} screen{layers.length === 1 ? '' : 's'} · generated{' '}
            {new Date().toLocaleString('en-GB')}
          </p>

          <section className="no-print">
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

          <section className="no-print">
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
          ) : (
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

              <h4>Patch</h4>
              {runs.screens.map((s) => (
                <div key={s.layerId} className="patch">
                  <strong>{s.layerName}</strong>
                  <ol className="patch__runs">
                    {s.runOrder.map((run, i) => (
                      <li key={i}>
                        Port {i + 1}: {run.length} panel{run.length === 1 ? '' : 's'} — from
                        {' '}col {run[0][0] + 1}, row {run[0][1] + 1} to col{' '}
                        {run[run.length - 1][0] + 1}, row {run[run.length - 1][1] + 1}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
              <p className="note">
                Runs follow each screen&rsquo;s feed corner and run pattern, set in the screen inspector.
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
