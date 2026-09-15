/**
 * A stack of the transient surfaces currently open — dialogs, menus, popovers.
 *
 * Three problems made this necessary. Each surface bound its own Escape handler
 * to `document` in the capture phase and called `stopPropagation()`, which does
 * nothing between listeners on the same node, so one Escape closed every layer
 * at once. Editor and CanvasStage each kept their own idea of "is a surface
 * open", and they disagreed. And a `document.querySelector` on every keystroke
 * is the wrong way to ask.
 *
 * Now every surface registers here. Escape closes the topmost one only, and the
 * editor's shortcuts ask one question with one answer.
 */
export type SurfaceKind = 'modal' | 'docked' | 'transient';

interface Surface {
  kind: SurfaceKind;
  close: () => void;
}

const stack: Surface[] = [];
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

export function pushSurface(surface: Surface) {
  stack.push(surface);
  notify();
  return () => {
    const i = stack.indexOf(surface);
    if (i !== -1) stack.splice(i, 1);
    notify();
  };
}

/** True when something modal is open — the canvas must not act on keys. */
export const isModalOpen = () => stack.some((s) => s.kind === 'modal');

/**
 * True when any surface owns the keyboard. A docked panel is non-modal, but its
 * own controls still must not have Delete reach the canvas behind them.
 */
export const isAnySurfaceOpen = () => stack.length > 0;

export const subscribeSurfaces = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Close the most recently opened surface. Returns false if there was none. */
export function closeTopSurface() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/**
 * Controls that consume the key themselves. Kept in one place because Editor
 * and CanvasStage previously carried two copies that disagreed — the Editor's
 * omitted `select`, so Backspace on a dropdown deleted the selected screens.
 */
export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(type);
}
