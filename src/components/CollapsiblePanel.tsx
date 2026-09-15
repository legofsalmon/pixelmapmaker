'use client';

import { useCallback, useSyncExternalStore } from 'react';
import Icon from './Icon';

/** Same-tab changes do not fire `storage`, so panels notify each other. */
const PANEL_EVENT = 'pixelmapmaker:panel';

/**
 * A rail panel that can be folded away.
 *
 * The right rail stacks the inspector above the screens list in one scroll
 * container. On a short screen — or with a logo attached and the datasheet
 * open — the screens list is pushed off the bottom and has to be hunted for.
 * Folding one recovers the other, and the choice is remembered, because
 * someone doing the same job all week should not have to make it again every
 * morning.
 *
 * Markup follows the APG accordion pattern: a heading whose only child is the
 * toggle button. The content is unmounted rather than hidden when closed, so
 * `aria-controls` is deliberately omitted — APG allows that, and pointing at
 * an absent id would be worse than not pointing at all.
 */
export default function CollapsiblePanel({
  id,
  title,
  aside,
  children,
  defaultOpen = true,
}: {
  id: string;
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const key = `pixelmapmaker.panel.${id}`;

  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener('storage', notify);
    window.addEventListener(PANEL_EVENT, notify);
    return () => {
      window.removeEventListener('storage', notify);
      window.removeEventListener(PANEL_EVENT, notify);
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
      // Storage can be blocked; the panel just will not remember.
    }
    window.dispatchEvent(new Event(PANEL_EVENT));
  };

  return (
    <section className={`panel${open ? ' is-open' : ''}`}>
      <header className="panel__head">
        <h2 className="panel__heading">
          <button className="panel__toggle" type="button" onClick={toggle} aria-expanded={open}>
            <Icon name="chevron-down" size={14} className="panel__chevron" />
            <span>{title}</span>
          </button>
        </h2>
        {aside}
      </header>
      {open && children}
    </section>
  );
}
