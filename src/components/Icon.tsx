'use client';

/**
 * A small outlined icon set, drawn inline.
 *
 * Emoji were doing this job before, which meant every platform drew its own
 * thing — different weights, different colours, and a lock or an eye rendering
 * as a full-colour picture next to monochrome text. These are stroke paths on
 * a 24-unit grid that take their colour from `currentColor`, so they match the
 * text around them and change with the theme.
 *
 * Inline rather than an icon package: it is a dozen shapes and nothing to
 * install, load or tree-shake.
 */
export type IconName =
  | 'eye'
  | 'eye-off'
  | 'lock'
  | 'unlock'
  | 'arrow-up'
  | 'arrow-down'
  | 'duplicate'
  | 'close'
  | 'star'
  | 'plus'
  | 'minus'
  | 'external'
  | 'align-left'
  | 'align-hcentre'
  | 'align-right'
  | 'align-top'
  | 'align-vcentre'
  | 'align-bottom';

interface IconProps {
  name: IconName;
  /** Rendered size in pixels; the grid scales with it. */
  size?: number;
  /** Solid fill for the star, to show a favourite is set. */
  filled?: boolean;
  className?: string;
}

/** Guide line plus two bars, the shape every align icon shares. */
function alignIcon(guide: string, bars: Array<[number, number, number, number]>) {
  return (
    <>
      <path d={guide} />
      {bars.map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="1" />
      ))}
    </>
  );
}

const PATHS: Record<IconName, React.ReactNode> = {
  eye: (
    <>
      <path d="M2 12c2.2-3.8 5.7-6 10-6s7.8 2.2 10 6c-2.2 3.8-5.7 6-10 6s-7.8-2.2-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M4.5 7.2C3.4 8.5 2.6 10 2 12c2.2 3.8 5.7 6 10 6 1.7 0 3.3-.35 4.7-1" />
      <path d="M9.9 5.2A11 11 0 0 1 12 6c4.3 0 7.8 2.2 10 6a15 15 0 0 1-3.3 4" />
      <path d="M10 10a3 3 0 0 0 4 4" />
      <path d="m4 4 16 16" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 7.5-2" />
    </>
  ),
  'arrow-up': (
    <>
      <path d="M12 19.5V5" />
      <path d="m6 10.5 6-5.5 6 5.5" />
    </>
  ),
  'arrow-down': (
    <>
      <path d="M12 4.5V19" />
      <path d="m6 13.5 6 5.5 6-5.5" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8.5" y="3.5" width="12" height="12" rx="2" />
      <path d="M15.5 18.5a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  star: <path d="m12 3.6 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.99 6.75 19.75l1-5.85L3.5 9.75l5.9-.85Z" />,
  plus: (
    <>
      <path d="M12 5.5v13" />
      <path d="M5.5 12h13" />
    </>
  ),
  minus: <path d="M5.5 12h13" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="m20 4-8.5 8.5" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </>
  ),
  'align-left': alignIcon('M4 3.5v17', [
    [7, 5.5, 13, 5],
    [7, 13.5, 8, 5],
  ]),
  'align-hcentre': alignIcon('M12 3.5v17', [
    [5.5, 5.5, 13, 5],
    [8, 13.5, 8, 5],
  ]),
  'align-right': alignIcon('M20 3.5v17', [
    [4, 5.5, 13, 5],
    [9, 13.5, 8, 5],
  ]),
  'align-top': alignIcon('M3.5 4h17', [
    [5.5, 7, 5, 13],
    [13.5, 7, 5, 8],
  ]),
  'align-vcentre': alignIcon('M3.5 12h17', [
    [5.5, 5.5, 5, 13],
    [13.5, 8, 5, 8],
  ]),
  'align-bottom': alignIcon('M3.5 20h17', [
    [5.5, 4, 5, 13],
    [13.5, 9, 5, 8],
  ]),
};

export default function Icon({ name, size = 16, filled = false, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative: every icon sits in a control that already has a label.
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
