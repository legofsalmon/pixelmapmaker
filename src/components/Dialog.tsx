'use client';

import { useEffect, useId, useRef } from 'react';
import Icon from './Icon';
import { closeTopSurface, pushSurface } from '@/lib/surfaces';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Header actions, placed before the close control. */
  actions?: React.ReactNode;
  /**
   * A docked dialog sits beside the canvas instead of over it, for surfaces
   * whose whole point is watching the canvas change. It is deliberately not
   * modal: no backdrop, no focus trap, no `aria-modal`.
   */
  docked?: boolean;
  wide?: boolean;
  /**
   * The control to return focus to. A menu item cannot be used: it is
   * unmounted in the same commit that mounts this dialog, so by the time the
   * mount effect reads `document.activeElement` it is already `<body>`.
   */
  restoreFocusTo?: HTMLElement | null;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * The one dialog wrapper.
 *
 * Every overlay previously declared `aria-modal="true"` and implemented none of
 * what that promises — focus stayed on the button behind the backdrop, Tab
 * wandered into the page underneath, Escape did nothing and the only way out
 * was one ghost button in the header. Telling assistive tech to hide a page
 * that focus can still reach is worse than not claiming modality at all.
 *
 * So this handles it once: focus moves in on open, Tab is contained, Escape and
 * a backdrop click close, focus returns to whatever opened it, and the title is
 * referenced with `aria-labelledby` rather than duplicated into an `aria-label`
 * that would drift from the visible heading on the next edit.
 */
export default function Dialog({
  title,
  onClose,
  children,
  actions,
  docked = false,
  wide = false,
  restoreFocusTo,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    // Ignore <body>: that is what a menu leaves behind when it unmounts.
    restoreTo.current = restoreFocusTo ?? (active && active !== document.body ? active : null);
    heading.current?.focus();
    return () => {
      // Put the user back where they were, not at the top of the document.
      restoreTo.current?.focus?.();
    };
    // restoreFocusTo is captured once, deliberately: it is the opener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register in the surface stack so Escape closes only the topmost layer and
  // the editor's shortcuts know a surface owns the keyboard.
  useEffect(() => pushSurface({ kind: docked ? 'docked' : 'modal', close: onClose }), [docked, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only the top of the stack closes, and nothing else sees the key.
        e.stopImmediatePropagation();
        e.preventDefault();
        closeTopSurface();
        return;
      }
      // A docked panel is non-modal on purpose — let Tab leave it.
      if (e.key !== 'Tab' || docked || !panel.current) return;

      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === heading.current
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Focus outside the panel entirely — which is where a click on any
      // non-focusable text inside it leaves you — must come back in.
      if (!active || !panel.current.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (!e.shiftKey && (active === last || active === heading.current)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === heading.current)) {
        e.preventDefault();
        last.focus();
      }
    };
    // Capture, so the editor's global shortcuts never see keys typed in here.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose, docked]);

  return (
    <div
      className={`modal${docked ? ' modal--docked' : ''}`}
      role={docked ? 'region' : 'dialog'}
      aria-modal={docked ? undefined : true}
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        // Only a press that starts *and* ends on the backdrop dismisses, so a
        // drag that happens to finish outside the panel does not close it.
        if (!docked && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={`modal__panel${docked ? ' modal__panel--docked' : ''}${wide ? ' sheet' : ' modal__panel--narrow'}`}
      >
        <header className="modal__head no-print">
          <h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2>
          <div className="btn-row">
            {actions}
            <button className="btn--icon" type="button" onClick={onClose} aria-label={`Close ${title}`}>
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
