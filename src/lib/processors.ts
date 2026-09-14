/**
 * LED processors, for working out how many you need and how many ports.
 *
 * Only figures taken from a manufacturer's own datasheet carry a `sourceUrl`.
 * Real capacity moves with bit depth, refresh rate and frame rate, so every
 * number here is a planning figure the user can override.
 */
export interface Processor {
  id: string;
  brand: string;
  model: string;
  /** Output ports available for panels. */
  ports: number;
  portType: '1G' | '10G';
  /** Nominal total pixel capacity across all ports. */
  totalPixels: number;
  /** Null for generic entries that are an assumption rather than a spec. */
  sourceUrl: string | null;
  note?: string;
}

export const PROCESSORS: Processor[] = [
  {
    id: 'brompton-sx40',
    brand: 'Brompton',
    model: 'Tessera SX40',
    ports: 4,
    portType: '10G',
    totalPixels: 9_000_000,
    sourceUrl: 'https://www.bromptontech.com/product/sx40/',
    note: 'Four 10GBASE-T outputs, nominally 9 million pixels at 36 bits per pixel, 60 Hz.',
  },
  {
    id: 'novastar-mx40-pro',
    brand: 'NovaStar',
    model: 'MX40 Pro',
    ports: 20,
    portType: '1G',
    totalPixels: 9_000_000,
    sourceUrl: 'https://www.novastar.tech/',
    note: 'Twenty Gigabit Ethernet ports, load capacity up to 9 million pixels.',
  },
  {
    id: 'generic-1g',
    brand: 'Generic',
    model: '1G port system',
    ports: 8,
    portType: '1G',
    totalPixels: 8 * 650_000,
    sourceUrl: null,
    note: 'Planning assumption only: 650,000 pixels per Gigabit port at 8-bit. Adjust to your kit.',
  },
  {
    id: 'generic-10g',
    brand: 'Generic',
    model: '10G port system',
    ports: 4,
    portType: '10G',
    totalPixels: 4 * 2_250_000,
    sourceUrl: null,
    note: 'Planning assumption only: 2.25 million pixels per 10G port. Adjust to your kit.',
  },
];

export const pixelsPerPort = (p: Processor) => Math.floor(p.totalPixels / Math.max(1, p.ports));

export const findProcessor = (id: string) =>
  PROCESSORS.find((p) => p.id === id) ?? PROCESSORS[0];
