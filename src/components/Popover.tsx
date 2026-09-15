'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Icon, { type IconName } from './Icon';

/**
 * A small anchored panel for settings that used to sit loose in the toolbar.
 *
 * Snap, centre guides, mask and palette are configuration, not commands — they
 * are set once and left. Mixing them into a row of verbs made both harder to
 * scan, so they live behind a labelled trigger that shows the current value
 * where there is one.
 */
export default function Popover({
  label,
  title,
  icon,
  children,
}: {
  label: string;
  title: string;
  icon?: IconName;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      wrap.current?.querySelector('button')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="menu" ref={wrap}>
      <button
        className="btn btn--quiet menu__trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {icon && <Icon name={icon} />}
        {label}
        <Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div className="popover" id={id} role="group" aria-label={title}>
          <p className="popover__title">{title}</p>
          {children}
        </div>
      )}
    </div>
  );
}
