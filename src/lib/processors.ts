/**
 * LED processors, for working out how many you need and how many ports.
 *
 * Only figures taken from a manufacturer's own datasheet or support
 * documentation carry a `sourceUrl`. Real capacity moves with bit depth,
 * refresh rate and frame rate — a 3D or top-and-bottom mode halves it on some
 * of these — so every number here is a planning figure the user can override.
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
  /** Null for generic entries and user-defined kit, which are not specs. */
  sourceUrl: string | null;
  note?: string;
  custom?: boolean;
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
    id: 'megapixel-helios',
    brand: 'Megapixel',
    model: 'HELIOS',
    ports: 8,
    portType: '10G',
    totalPixels: 35_000_000,
    sourceUrl:
      'https://support.megapixelvr.com/support/solutions/articles/103000262246-helios-system-capacity-basics',
    note: 'Eight 10G fibre SFP+ outputs, processing up to 35 million pixels.',
  },
  {
    id: 'novastar-vx2000-pro',
    brand: 'NovaStar',
    model: 'VX2000 Pro',
    ports: 20,
    portType: '1G',
    totalPixels: 13_000_000,
    sourceUrl: 'https://www.novastar.tech/',
    note: 'Twenty Gigabit Ethernet ports, up to 13 million pixels. Halved in top-and-bottom 3D.',
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
    id: 'novastar-mctrl4k',
    brand: 'NovaStar',
    model: 'MCTRL4K',
    ports: 16,
    portType: '1G',
    // 4096 x 2160 at 60 Hz, the loading capacity NovaStar quotes for one unit.
    totalPixels: 4096 * 2160,
    sourceUrl: 'https://www.novastar.tech/',
    note: 'Sixteen Gigabit Ethernet ports, loading capacity 4096 × 2160 at 60 Hz.',
  },
  {
    id: 'novastar-vx1000',
    brand: 'NovaStar',
    model: 'VX1000',
    ports: 10,
    portType: '1G',
    totalPixels: 6_500_000,
    sourceUrl: 'https://www.novastar.tech/',
    note: 'Ten Gigabit Ethernet ports, driving up to 6.5 million pixels.',
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

/** Look a processor up across the built-in list and the user's own. */
export function findProcessor(id: string, custom: Processor[] = []) {
  return [...custom, ...PROCESSORS].find((p) => p.id === id) ?? PROCESSORS[0];
}

/** Build a processor the user entered by hand. */
export function customProcessor(input: {
  model: string;
  brand?: string;
  ports: number;
  portType: '1G' | '10G';
  totalPixels: number;
}): Processor {
  return {
    id: `proc-${Date.now().toString(36)}`,
    brand: input.brand?.trim() || 'Custom',
    model: input.model.trim() || 'My processor',
    ports: Math.max(1, Math.round(input.ports)),
    portType: input.portType,
    totalPixels: Math.max(1, Math.round(input.totalPixels)),
    sourceUrl: null,
    note: 'Your own figures.',
    custom: true,
  };
}
