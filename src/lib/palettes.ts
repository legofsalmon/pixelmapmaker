/** Tile colour presets. Grid line and text colours are derived per tile. */
export interface Palette {
  id: string;
  name: string;
  colors: string[];
}

export const PALETTES: Palette[] = [
  { id: 'classic', name: 'Classic', colors: ['#1b6ef3', '#e8453c', '#12a150', '#f2a20c', '#8b5cf6', '#0ea5b7'] },
  { id: 'mono', name: 'Mono', colors: ['#3f3f46', '#52525b', '#71717a', '#27272a', '#18181b', '#a1a1aa'] },
  { id: 'neon', name: 'Neon', colors: ['#ff2e88', '#00f0ff', '#b6ff00', '#ff8a00', '#7c4dff', '#00ff9d'] },
  { id: 'broadcast', name: 'Broadcast', colors: ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000'] },
  { id: 'pastel', name: 'Pastel', colors: ['#8ab6f9', '#f9a8a8', '#9be0b3', '#f7d488', '#c9b0f5', '#8fd8e0'] },
  { id: 'grayscale', name: 'Grayscale', colors: ['#111111', '#333333', '#555555', '#777777', '#999999', '#bbbbbb'] },
];

export const DEFAULT_PALETTE = PALETTES[0];

export function nextColor(palette: Palette, index: number) {
  return palette.colors[index % palette.colors.length];
}

/** Readable ink for a given tile fill. */
export function contrastInk(hex: string) {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Rec. 709 luma.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? '#000000' : '#ffffff';
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour. */
export function shade(hex: string, amount: number) {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const channel = (i: number) => {
    const v = parseInt(full.slice(i, i + 2), 16);
    const next = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}
