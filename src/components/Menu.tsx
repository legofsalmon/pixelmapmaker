'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { closeTopSurface, pushSurface } from '@/lib/surfaces';
import Icon, { type IconName } from './Icon';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: IconName;
  /** Renders a rule above this item, to group without adding chrome. */
  separated?: boolean;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

/**
 * A small dropdown for tier-3 commands.
 *
 * Everything that is used once a project — New, Open, the alternate exports —
 * used to be a button in the main bar competing with things used every minute.
 * Putting them behind a menu is not hiding them; it is declining to claim they
 * matter as much as Export.
 */
export default function Menu({
  label,
  items,
  icon,
  align = 'start',
  ariaLabel,
}: {
  label: string;
  items: MenuItem[];
  icon?: IconName;
  align?: 'start' | 'end';
  /** Required when `label` is empty, e.g. the chevron half of a split button. */
  ariaLabel?: string;
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
      e.stopImmediatePropagation();
      e.preventDefault();
      closeTopSurface();
    };
    const unregister = pushSurface({
      kind: 'transient',
      close: () => {
        setOpen(false);
        wrap.current?.querySelector('button')?.focus();
      },
    });
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      unregister();
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="menu" ref={wrap}>
      <button
        className="btn btn--quiet menu__trigger"
        type="button"
        aria-label={ariaLabel || undefined}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {icon && <Icon name={icon} />}
        {label}
        <Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div
          className={`menu__list menu__list--${align}`}
          id={id}
          /*
           * Deliberately not role="menu". That role promises arrow-key
           * navigation, Home/End and a roving tabindex; declaring it without
           * them is a worse experience than a plain list of buttons, which Tab
           * already handles correctly.
           */
          role="group"
          aria-label={ariaLabel || label}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`menu__item${item.danger ? ' menu__item--danger' : ''}${item.separated ? ' menu__item--separated' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                /*
                 * Focus the trigger BEFORE running the item. Selecting an item
                 * unmounts it in the same commit, so anything that mounts a
                 * dialog would otherwise read `document.activeElement` as
                 * <body> and have nowhere to return focus to on close.
                 */
                setOpen(false);
                wrap.current?.querySelector('button')?.focus();
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.hint && <em>{item.hint}</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
