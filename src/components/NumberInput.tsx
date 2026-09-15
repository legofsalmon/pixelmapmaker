'use client';

import { useEffect, useRef, useState } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | string;
  className?: string;
  placeholder?: string;
  required?: boolean;
  'aria-label'?: string;
  id?: string;
}

/**
 * A number field you can actually type in.
 *
 * Two things a plain `<input type="number">` with a clamp in `onChange` gets
 * wrong:
 *
 *  - Clicking in leaves the caret next to the existing value, so a field
 *    showing 0 becomes 016 unless you select and delete first. Focus selects
 *    the contents instead, so typing just replaces it.
 *
 *  - Clamping on every keystroke makes a minimum impossible to type through:
 *    with `min=16`, typing the 1 of 1920 immediately rewrites the field to 16.
 *    The draft is held as text while the field is focused and only committed —
 *    and only then clamped — on blur or Enter. Intermediate values are still
 *    pushed upwards live when they are already inside the range, so dragging a
 *    canvas size around stays responsive.
 */
export default function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  className = 'input',
  placeholder,
  required,
  id,
  'aria-label': ariaLabel,
}: NumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  // A click fires focus (where we select) and then mouseup, which would put the
  // caret down and collapse that selection again. Swallow only that first
  // mouseup, so a later click inside the field still positions the caret.
  const selectingOnClick = useRef(false);

  // Track changes made elsewhere (dragging a screen, undo) unless mid-edit.
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const clamp = (n: number) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };

  const commit = () => {
    const parsed = Number(draft);
    // An empty or nonsense field snaps back to the last good value.
    const next = draft.trim() === '' || !Number.isFinite(parsed) ? value : clamp(parsed);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <input
      id={id}
      className={className}
      type="number"
      inputMode="decimal"
      value={draft}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      required={required}
      aria-label={ariaLabel}
      onFocus={(e) => {
        focused.current = true;
        selectingOnClick.current = true;
        e.target.select();
      }}
      onMouseUp={(e) => {
        if (!selectingOnClick.current) return;
        selectingOnClick.current = false;
        e.preventDefault();
      }}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const parsed = Number(text);
        if (text.trim() === '' || !Number.isFinite(parsed)) return;
        // Only push through while the value is already legal; anything outside
        // the range is a half-typed number and waits for blur.
        if (clamp(parsed) === parsed) onChange(parsed);
      }}
      onBlur={() => {
        focused.current = false;
        selectingOnClick.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).select();
        }
      }}
    />
  );
}
