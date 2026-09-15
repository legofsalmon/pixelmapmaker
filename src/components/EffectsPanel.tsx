'use client';

import { useState } from 'react';
import { useEditor } from '@/state/store';
import { DIRECTION_LABELS, EFFECT_LABELS, isAnimated, type EffectDirection, type EffectKind } from '@/lib/effects';
import { canRecordVideo, exportVideo } from '@/lib/export';

/**
 * Live test patterns for commissioning a wall, and recording them out as
 * footage to play back from a media server.
 */
export default function EffectsPanel({ onClose }: { onClose: () => void }) {
  const name = useEditor((s) => s.name);
  const canvas = useEditor((s) => s.canvas);
  const layers = useEditor((s) => s.layers);
  const effect = useEditor((s) => s.effect);
  const setEffect = useEditor((s) => s.setEffect);
  const setCanvas = useEditor((s) => s.setCanvas);

  const [seconds, setSeconds] = useState(10);
  const [fps, setFps] = useState(30);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const recordable = canRecordVideo();

  const record = async () => {
    setError(null);
    setDone(null);
    setProgress(0);
    try {
      const extension = await exportVideo(name, canvas, layers, effect, {
        seconds,
        fps,
        onProgress: setProgress,
      });
      setDone(`Recorded ${seconds}s at ${canvas.width} × ${canvas.height} as .${extension}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording failed');
    } finally {
      setProgress(null);
    }
  };

  return (
    /* Docked rather than centred: the whole point is watching the pattern play
       on the canvas while the controls are open. */
    <div className="modal modal--docked" role="dialog" aria-label="Test patterns">
      <div className="modal__panel modal__panel--docked">
        <header className="modal__head">
          <h2>Test patterns</h2>
          <button className="btn btn--ghost" type="button" onClick={onClose}>Close</button>
        </header>

        <div className="sheet__body">
          <p className="note">
            Something moving across the wall shows up dead tiles, a mis-patched cabinet and
            processing latency in a way a static grid never will. The pattern plays live on the
            canvas as you change it.
          </p>

          <section>
            <h4>Pattern</h4>
            <div className="opt-grid">
              <label className="field">
                <span>Effect</span>
                <select
                  className="input"
                  value={effect.kind}
                  onChange={(e) => setEffect({ kind: e.target.value as EffectKind })}
                >
                  {EFFECT_LABELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Direction</span>
                <select
                  className="input"
                  value={effect.direction}
                  onChange={(e) => setEffect({ direction: e.target.value as EffectDirection })}
                >
                  {DIRECTION_LABELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Colour</span>
                <input
                  className="input input--color"
                  type="color"
                  value={effect.color}
                  onChange={(e) => setEffect({ color: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Covers</span>
                <select
                  className="input"
                  value={canvas.effectScope}
                  onChange={(e) => setCanvas({ effectScope: e.target.value as 'canvas' | 'per-screen' })}
                >
                  <option value="canvas">The whole canvas</option>
                  <option value="per-screen">Each screen separately</option>
                </select>
              </label>
            </div>

            <div className="opt-grid">
              <label className="field">
                <span>Speed — {effect.speed.toFixed(2)}/s</span>
                <input
                  className="input"
                  type="range"
                  min="0.05"
                  max="3"
                  step="0.05"
                  value={effect.speed}
                  onChange={(e) => setEffect({ speed: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>Opacity — {Math.round(effect.opacity * 100)}%</span>
                <input
                  className="input"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={effect.opacity}
                  onChange={(e) => setEffect({ opacity: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>Trail — {Math.round(effect.trail * 100)}%</span>
                <input
                  className="input"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={effect.trail}
                  onChange={(e) => setEffect({ trail: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>Thickness — {(effect.thickness * 100).toFixed(1)}%</span>
                <input
                  className="input"
                  type="range"
                  min="0.002"
                  max="0.06"
                  step="0.002"
                  value={effect.thickness}
                  onChange={(e) => setEffect({ thickness: Number(e.target.value) })}
                />
              </label>
            </div>
          </section>

          <section>
            <h4>Record it out</h4>
            {!recordable && (
              <p className="note note--warn">
                This browser cannot record a canvas to video. The pattern still plays live.
              </p>
            )}
            <div className="opt-grid">
              <label className="field">
                <span>Length (s)</span>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="120"
                  value={seconds}
                  onChange={(e) => setSeconds(Math.max(1, Math.min(120, Number(e.target.value))))}
                />
              </label>
              <label className="field">
                <span>Frame rate</span>
                <select className="input" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                  <option value={24}>24</option>
                  <option value={25}>25</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={60}>60</option>
                </select>
              </label>
              <button
                className="btn"
                type="button"
                disabled={!recordable || !isAnimated(effect) || progress !== null}
                onClick={record}
              >
                {progress !== null ? `Recording ${Math.round(progress * 100)}%` : 'Record'}
              </button>
            </div>
            <p className="note">
              Recorded at the canvas&rsquo;s native {canvas.width} × {canvas.height}, one frame at a
              time rather than off a wall clock, so the speed is right regardless of how fast the tab
              renders. A long recording at 4K takes a while.
            </p>
            {!isAnimated(effect) && <p className="note note--warn">Choose a pattern above to record.</p>}
            {done && <p className="note" role="status">{done}</p>}
            {error && <p className="note note--warn" role="alert">{error}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
