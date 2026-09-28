'use client';

import { useMemo } from 'react';
import { useEditor } from '@/state/store';
import {
  ETHERNET_OCTETS,
  FRAME_RATES,
  LINK_LOADS,
  LINK_SPEEDS,
  SAMPLINGS,
  XS_RATIOS,
  bitsPerPixel,
  describeFeed,
  formatRate,
  planSt2110,
  sdpFileName,
  sdpForFlow,
  type Depth,
  type Sampling,
  type Transport,
} from '@/lib/st2110';
import { zip } from '@/lib/zip';
import NumberInput from './NumberInput';

function downloadZip(name: string, bytes: Uint8Array<ArrayBuffer>) {
  const blob = new Blob([bytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9-_]+/gi, '_') || 'pixelmap'}_sdp.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * An address typed in full before it counts.
 *
 * Committed on blur or Enter rather than per keystroke: halfway through typing
 * 239.20.1.1 the field holds 239.2, and a warning that it is not a multicast
 * address would flash up at every character. Keyed on the stored value, so a
 * project loaded from elsewhere replaces what is shown.
 */
function AddressField(props: { label: string; value: string; placeholder?: string; onCommit: (v: string) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        key={props.value}
        className="input"
        defaultValue={props.value}
        placeholder={props.placeholder}
        spellCheck={false}
        autoComplete="off"
        onBlur={(e) => e.target.value !== props.value && props.onCommit(e.target.value.trim())}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
}

export default function St2110Section() {
  const name = useEditor((s) => s.name);
  const layers = useEditor((s) => s.layers);
  const canvas = useEditor((s) => s.canvas);
  const settings = useEditor((s) => s.st2110);
  const setSt2110 = useEditor((s) => s.setSt2110);

  const plan = useMemo(() => planSt2110(layers, canvas, settings), [layers, canvas, settings]);
  const sdps = useMemo(() => plan.flows.map((f) => sdpForFlow(f, settings)), [plan, settings]);

  const planned = settings.transport !== 'none';
  const xs = settings.transport === 'jpeg-xs';
  const bits = bitsPerPixel(settings.sampling, settings.depth);
  const link = settings.linkGbps * 1e9;
  const pct = (bps: number) => `${Math.round((bps / link) * 100)}% of a link`;
  const overhead = plan.dataBps > 0 ? (plan.wireBps / plan.dataBps - 1) * 100 : 0;
  const canExport = !xs && sdps.length > 0 && sdps.every((s) => s !== null);

  return (
    <section>
      <h4 className="no-print">The feed</h4>
      <div className="opt-grid no-print">
        <label className="field">
          <span>Send the screens as</span>
          <select
            className="input"
            value={settings.transport}
            onChange={(e) => setSt2110({ transport: e.target.value as Transport })}
          >
            <option value="none">Not planned here</option>
            <option value="uncompressed">Uncompressed</option>
            <option value="jpeg-xs">JPEG XS</option>
          </select>
        </label>
        {planned && (
          <>
            <label className="field">
              <span>Sampling</span>
              <select
                className="input"
                value={settings.sampling}
                onChange={(e) => setSt2110({ sampling: e.target.value as Sampling })}
              >
                {SAMPLINGS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Depth</span>
              <select
                className="input"
                value={settings.depth}
                onChange={(e) => setSt2110({ depth: Number(e.target.value) as Depth })}
              >
                <option value={8}>8-bit</option>
                <option value={10}>10-bit</option>
                <option value={12}>12-bit</option>
              </select>
            </label>
            <label className="field">
              <span>Frame rate</span>
              <select
                className="input"
                value={settings.frameRate}
                onChange={(e) => setSt2110({ frameRate: e.target.value })}
              >
                {FRAME_RATES.map((r) => (
                  <option key={r.id} value={r.id}>{r.id} fps</option>
                ))}
              </select>
            </label>
            {xs && (
              <label className="field">
                <span>Compression</span>
                <select
                  className="input"
                  value={settings.xsRatio}
                  onChange={(e) => setSt2110({ xsRatio: Number(e.target.value) })}
                >
                  {XS_RATIOS.map((r) => (
                    <option key={r} value={r}>{r}:1</option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Links</span>
              <select
                className="input"
                value={settings.linkGbps}
                onChange={(e) => setSt2110({ linkGbps: Number(e.target.value) })}
              >
                {LINK_SPEEDS.map((g) => (
                  <option key={g} value={g}>{g} GbE</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Links loaded to</span>
              <select
                className="input"
                value={settings.linkLoad}
                onChange={(e) => setSt2110({ linkLoad: Number(e.target.value) })}
              >
                {LINK_LOADS.map((load) => (
                  <option key={load} value={load}>{Math.round(load * 100)}%</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {planned && (
        <div className="btn-row no-print">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.redundancy}
              onChange={(e) => setSt2110({ redundancy: e.target.checked })}
            />
            <span>Send every flow twice, on two networks (ST 2022-7)</span>
          </label>
        </div>
      )}

      {!planned ? (
        <p className="note">
          Feed the screens over ST 2110 and this works out what each one costs on the network: its
          flow in Gb/s, how many links carry them all, a multicast group for every flow, and an SDP
          file for each receiver to load.
        </p>
      ) : (
        <>
          <h4>{describeFeed(settings)}</h4>
          <dl className="stats stats--wide">
            <div>
              <dt>Flows</dt>
              <dd>
                {plan.flows.length}
                <br />
                <small>{plan.networks === 2 ? 'on each of two networks' : 'on one network'}</small>
              </dd>
            </div>
            <div>
              <dt>On the wire</dt>
              <dd>
                {formatRate(plan.wireBps)}
                <br />
                <small>{plan.networks === 2 ? 'on each network' : 'framing included'}</small>
              </dd>
            </div>
            <div>
              <dt>Links</dt>
              <dd>
                {plan.links} × {settings.linkGbps} GbE
                <br />
                <small>sending side{plan.networks === 2 ? ', each network' : ''}</small>
              </dd>
            </div>
            <div>
              <dt>Largest flow</dt>
              <dd>
                {plan.largest ? formatRate(plan.largest.wireBps) : '—'}
                {plan.largest && <><br /><small>{pct(plan.largest.wireBps)}</small></>}
              </dd>
            </div>
          </dl>

          {plan.warnings.map((warning) => (
            <p key={warning} className="note note--warn">{warning}</p>
          ))}

          <h4>Flows</h4>
          <div className="sheet__scroll">
            <table className="sheet__table">
              <thead>
                <tr>
                  <th>Flow</th>
                  <th>Pixels</th>
                  <th>On the wire</th>
                  <th>Packets a second</th>
                  <th>Group, port {settings.port}</th>
                </tr>
              </thead>
              <tbody>
                {plan.flows.map((f) => (
                  <tr key={`${f.layerId}-${f.part}`}>
                    <td>
                      {f.label}
                      {f.parts > 1 && (
                        <>
                          <br />
                          <small>
                            {f.across === 'columns'
                              ? `cabinet columns ${f.cols[0] + 1} to ${f.cols[1]}`
                              : `cabinet rows ${f.rows[0] + 1} to ${f.rows[1]}`}
                          </small>
                        </>
                      )}
                    </td>
                    <td>{f.width} × {f.height}</td>
                    <td>
                      {formatRate(f.wireBps)}
                      <br />
                      <small>{pct(f.wireBps)}</small>
                    </td>
                    <td>{Math.round(f.packetsPerSecond).toLocaleString('en-GB')}</td>
                    <td>
                      {f.primary ?? '—'}
                      {plan.networks === 2 && <><br /><small>{f.secondary ?? '—'}</small></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className="no-print">{xs ? 'Addresses' : 'Addresses and SDP files'}</h4>
          <div className="opt-grid no-print">
            <AddressField
              label={plan.networks === 2 ? 'Groups from, first network' : 'Groups from'}
              value={settings.primaryBase}
              onCommit={(primaryBase) => setSt2110({ primaryBase })}
            />
            {plan.networks === 2 && (
              <AddressField
                label="Groups from, second network"
                value={settings.secondaryBase}
                onCommit={(secondaryBase) => setSt2110({ secondaryBase })}
              />
            )}
            <label className="field">
              <span>Port</span>
              <NumberInput min={1} max={65535} value={settings.port} onChange={(port) => setSt2110({ port })} />
            </label>
            {/* The sender and the clock only go into SDP files, which JPEG XS flows do not get. */}
            {!xs && (
              <>
                <AddressField
                  label={plan.networks === 2 ? 'Sender, first network' : 'Sender address'}
                  value={settings.primarySource}
                  placeholder="if there is one"
                  onCommit={(primarySource) => setSt2110({ primarySource })}
                />
                {plan.networks === 2 && (
                  <AddressField
                    label="Sender, second network"
                    value={settings.secondarySource}
                    placeholder="if there is one"
                    onCommit={(secondarySource) => setSt2110({ secondarySource })}
                  />
                )}
                <AddressField
                  label="PTP clock"
                  value={settings.clock}
                  placeholder="traceable"
                  onCommit={(clock) => setSt2110({ clock })}
                />
              </>
            )}
          </div>
          {!xs && (
            <div className="btn-row no-print">
              <button
                className="btn btn--secondary"
                type="button"
                disabled={!canExport}
                onClick={() =>
                  downloadZip(
                    name,
                    zip(plan.flows.map((f, i) => ({ name: sdpFileName(f, i), text: sdps[i] ?? '' })))
                  )
                }
              >
                Download SDP files
              </button>
            </div>
          )}

          <p className="note">
            {xs ? (
              <>
                At {settings.xsRatio}:1, JPEG XS carries {(bits / settings.xsRatio).toFixed(1)} of the{' '}
                {bits} bits a pixel, the same size every frame as ST 2110-22 requires, packed as
                RFC 9134 packs it.
              </>
            ) : (
              <>
                Each flow is its screen&rsquo;s pixels at {bits} bits each, cut into packets as
                ST 2110-20&rsquo;s general packing cuts them: every row split evenly under the
                standard 1460-octet UDP limit, or narrow rows sent two or three to a packet.
              </>
            )}{' '}
            RTP, UDP and IP headers and Ethernet&rsquo;s framing add {ETHERNET_OCTETS + 40} octets to
            every packet, and the payload header a few more: {overhead.toFixed(1)}% on top of the{' '}
            {xs ? 'codestream' : 'pixels'} here, so {formatRate(plan.dataBps)} becomes{' '}
            {formatRate(plan.wireBps)} on the wire, which is what links are sized on.
          </p>
          <p className="note">
            Links is how many {settings.linkGbps} GbE ports the sending side needs with none loaded
            past {Math.round(settings.linkLoad * 100)}%. A flow is never split across links, so a
            screen that outgrows one is cut between cabinets into flows that do fit, and each receiver
            needs a port of its own besides.
          </p>
          {plan.canvasWireBps > plan.wireBps * 1.05 && (
            <p className="note">
              Sent whole as one {canvas.width} × {canvas.height} flow, the canvas would take{' '}
              {formatRate(plan.canvasWireBps)}, {(plan.canvasWireBps / plan.wireBps).toFixed(1)}× what
              the screens&rsquo; own flows take: a pixel map leaves room around its screens, and a flow
              per screen does not send it.
            </p>
          )}
          <p className="note">
            {settings.sampling === 'YCbCr-4:2:2'
              ? '4:2:2 sends colour for every other pixel. It costs a third less than RGB, and the halved colour shows on the text and hard edges an LED wall is often given.'
              : 'RGB and 4:4:4 keep every pixel’s colour. YCbCr 4:2:2 costs a third less, and halves the colour detail, which shows on text and hard edges.'}
          </p>
          <p className="note">
            {xs
              ? 'SDP files are written for uncompressed flows only: a JPEG XS flow’s profile and level are its encoder’s to choose.'
              : 'Two things in the SDP files are the plan’s assumptions, not a sender’s facts: TP=2110TPN, the narrow timing hardware senders keep, and the PTP clock. Once the sender exists, its own SDP file is the one to load.'}{' '}
            All of this is a planning aid, not a network design.
          </p>
        </>
      )}
    </section>
  );
}
