/**
 * Whether to hold still: the design system's motion mode, read the way its
 * stylesheet reads it (docs/motion.md in the design-system repo).
 *
 * `data-motion="reduced"` on <html> forces it (a show machine short of GPU, a
 * screen recording), `data-motion="full"` opts back in, and anything else
 * follows the operating system's prefers-reduced-motion. Code that animates
 * without CSS (the canvas clock) asks here, so it and the stylesheet agree.
 */
export function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  const mode = document.documentElement.dataset.motion;
  if (mode === 'reduced') return true;
  if (mode === 'full') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
