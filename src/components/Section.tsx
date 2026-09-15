'use client';

import { useCallback, useSyncExternalStore } from 'react';
import Icon from './Icon';

/**
 * A collapsible group inside a panel.
 *
 * The inspector was a flat list of nineteen controls, which meant a user
 * placing their first screen saw the serpentine feed corner at the same weight
 * as how many cabinets wide the wall is. Grouping by when the work commits —
 * size first, then appearance, then signal — lets the rare things fold away
 * without being removed.
 *
 * Open/closed is remembered per section, because someone doing the same job all
 * week should not have to re-open the same group every time.
 */
/** Same-tab changes do not fire `storage`, so sections notify each other. */
const SECTION_EVENT = 'pixelmapmaker:section';

export default function Section({
  id,
  title,
  children,
  defaultOpen = false,
  hint,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  hint?: string;
}) {
  const key = `pixelmapmaker.section.${id}`;

  /*
   * localStorage is an external store, and this component is server-rendered
   * before it hydrates. useSyncExternalStore is the tool for exactly that: the
   * server snapshot is the default, the client snapshot is what was saved, and
   * React reconciles without a setState-in-effect cascade or a hydration
   * mismatch.
   */
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener('storage', notify);
    window.addEventListener(SECTION_EVENT, notify);
    return () => {
      window.removeEventListener('storage', notify);
      window.removeEventListener(SECTION_EVENT, notify);
    };
  }, []);

  const open = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const saved = window.localStorage.getItem(key);
        return saved === null ? defaultOpen : saved === '1';
      } catch {
        return defaultOpen;
      }
    },
    () => defaultOpen
  );

  const toggle = () => {
    try {
      window.localStorage.setItem(key, open ? '0' : '1');
    } catch {
      // Storage can be blocked; the section just will not remember.
    }
    window.dispatchEvent(new Event(SECTION_EVENT));
  };

  return (
    <div className={`section${open ? ' is-open' : ''}`}>
      <button className="section__head" type="button" onClick={toggle} aria-expanded={open}>
        <Icon name="chevron-down" size={14} className="section__chevron" />
        <span>{title}</span>
        {hint && !open && <em>{hint}</em>}
      </button>
      {open && <div className="section__body">{children}</div>}
    </div>
  );
}
