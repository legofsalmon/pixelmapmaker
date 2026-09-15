'use client';

import { useEffect, useRef } from 'react';
import { drawEffect, EFFECT_LABELS, type EffectKind, type EffectSettings } from '@/lib/effects';

/** Thumbnail size in CSS pixels. Wide enough to read a pattern, small enough
 *  that all eight fit the docked panel without pushing the canvas away. */
const W = 104;
const H = 58;

/**
 * A moment part-way through the cycle rather than the start, where several
 * patterns have not yet entered the frame and would all draw an empty box.
 */
const SAMPLE_MS = 1400;

/**
 * Pick a test pattern by looking at it.
 *
 * "Sonar", "Pulse" and "Ripple" are three names for three things you cannot
 * picture, so choosing used to mean selecting one, closing the dropdown,
 * watching the canvas, and going back. The effects are pure functions of time
 * over a 2D context, so a thumbnail is the same renderer at 104x58 — the
 * picker shows the thing itself rather than a word for it.
 *
 * Deliberately static. Eight live canvases animating beside a canvas that is
 * already animating buys nothing: each pattern is recognisable from one frame,
 * and the real one is playing full-size behind this panel anyway.
 */
function Thumb({ kind, settings }: { kind: EffectKind; settings: EffectSettings }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, W, H);
    if (kind === 'none') return;
    // Full opacity and a fat line: at 104px the panel's own settings would
    // render several patterns as a barely visible smudge.
    drawEffect(ctx, { x: 0, y: 0, width: W, height: H }, {
      ...settings,
      kind,
      opacity: 1,
      thickness: Math.max(settings.thickness, 0.05),
    }, SAMPLE_MS);
  }, [kind, settings]);

  return <canvas ref={ref} style={{ width: W, height: H }} className="fx__canvas" aria-hidden="true" />;
}

export default function EffectPicker({
  value,
  settings,
  onChange,
}: {
  value: EffectKind;
  settings: EffectSettings;
  onChange: (kind: EffectKind) => void;
}) {
  return (
    /* A radio group, not a list of buttons: arrow keys move between patterns
       and only the selected one is a tab stop, which is what someone reaching
       for the keyboard expects of a set of mutually exclusive choices. */
    <div className="fx" role="radiogroup" aria-label="Test pattern">
      {EFFECT_LABELS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          className={`fx__item${value === o.value ? ' is-on' : ''}`}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
              : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            const i = EFFECT_LABELS.findIndex((x) => x.value === value);
            const next = EFFECT_LABELS[(i + step + EFFECT_LABELS.length) % EFFECT_LABELS.length];
            onChange(next.value);
            // Follow the selection, or focus is left on a control that is no
            // longer the group's tab stop.
            const group = e.currentTarget.parentElement;
            const buttons = group?.querySelectorAll<HTMLButtonElement>('.fx__item');
            buttons?.[EFFECT_LABELS.indexOf(next)]?.focus();
          }}
        >
          {/* Every tile previews what the canvas will look like, so the
              honest preview for "None" is an empty one. The label beneath
              says which it is; repeating "Off" inside the tile only made the
              same word appear twice. */}
          {o.value === 'none'
            ? <span className="fx__none" aria-hidden="true" />
            : <Thumb kind={o.value} settings={settings} />}
          <span className="fx__label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
