/**
 * The colours the canvases paint their own chrome in: the workspace behind
 * the map, and the selection drawn over it.
 *
 * They come from the shared design system's dark roles, the same values the
 * stylesheet's --canvas and --accent resolve to, so a canvas and the CSS
 * around it cannot drift apart. The map itself (cabinet colours, run and
 * power colours, the patterns) is the user's content and keeps its own
 * palettes in render.ts and palettes.ts.
 */
import { color } from '../ds/tokens.js';

const dark = color.dark;

export const CHROME = {
  /** The workspace the project canvas sits on, and the effect thumbnails' ground. */
  canvas: dark.surface.canvas,
  /** The selection: the outline, its resize handles and the marquee. */
  accent: dark.accent.default,
  /** The marquee's fill. */
  accentSoft: dark.accent.soft,
  /** The edge of a handle drawn in the accent, so it holds on any cabinet colour. */
  accentOn: dark.accent.on,
} as const;
