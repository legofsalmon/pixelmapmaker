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
  /**
   * Most cabinets a manufacturer will address on one output port. This is a
   * different limit from pixel capacity and neither implies the other: a 10G
   * port has the pixels for hundreds of small cabinets but will not address
   * them. Null where the figure is not published — the planning default in
   * CablingSettings then applies on its own.
   */
  maxCabinetsPerPort: number | null;
  /**
   * The colour depth and refresh the quoted capacity assumes.
   *
   * Capacity figures are meaningless without them and manufacturers do not
   * share a baseline: Brompton quote the SX40 at 36 bits per pixel, which is
   * 12 bits a channel, while NovaStar's familiar 650,000 pixels a Gigabit port
   * is 24 bits per pixel at 60 Hz. Comparing the two as printed compares
   * different things.
   */
  baselineBitDepth: number;
  baselineHz: number;
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
    maxCabinetsPerPort: 50,
    baselineBitDepth: 12,
    baselineHz: 60,
    sourceUrl: 'https://www.bromptontech.com/product/sx40/',
    note:
      'Four 10GBASE-T outputs, nominally 9 million pixels at 36 bits per pixel, 60 Hz. '+
      'Brompton state a single chain of up to 50 fixtures per output, or up to 500 through switches.',
  },
  {
    id: 'megapixel-helios',
    brand: 'Megapixel',
    model: 'HELIOS',
    ports: 8,
    portType: '10G',
    totalPixels: 35_000_000,
    maxCabinetsPerPort: null,
    baselineBitDepth: 8,
    baselineHz: 60,
    sourceUrl:
      'https://support.megapixelvr.com/support/solutions/articles/103000262246-helios-system-capacity-basics',
    note:
      'Eight 10G fibre SFP+ outputs, processing up to 35 million pixels. Megapixel publish their daisy-chain limits per panel type rather than as one figure, so none is set here.',
  },
  {
    id: 'novastar-vx2000-pro',
    brand: 'NovaStar',
    model: 'VX2000 Pro',
    ports: 20,
    portType: '1G',
    totalPixels: 13_000_000,
    maxCabinetsPerPort: 512,
    baselineBitDepth: 8,
    baselineHz: 60,
    sourceUrl: 'https://www.novastar.tech/',
    note:
      'Twenty Gigabit Ethernet ports, up to 13 million pixels. Halved in top-and-bottom 3D. '+
      'A Gigabit port addresses up to 512 receiving cards, so pixel capacity binds long first.',
  },
  {
    id: 'novastar-mx40-pro',
    brand: 'NovaStar',
    model: 'MX40 Pro',
    ports: 20,
    portType: '1G',
    totalPixels: 9_000_000,
    maxCabinetsPerPort: 512,
    baselineBitDepth: 8,
    baselineHz: 60,
    sourceUrl: 'https://www.novastar.tech/',
    note: 'Twenty Gigabit Ethernet ports, load capacity up to 9 million pixels.',
  },
  {
    id: 'novastar-mx30',
    brand: 'NovaStar',
    model: 'MX30',
    ports: 10,
    portType: '1G',
    totalPixels: 6_500_000,
    /*
     * NovaStar publish no per-port receiving-card limit for this one, and the
     * MX40 Pro's 512 does not carry over — a sibling's figure is not this
     * one's. They cap the port by bandwidth instead: "the used load capacity
     * of Ethernet ports is the sum of the resolutions of all cabinets with
     * load". So the planning chain length in CablingSettings decides, which
     * is what null means here.
     */
    maxCabinetsPerPort: null,
    baselineBitDepth: 8,
    baselineHz: 60,
    sourceUrl:
      'https://oss.novastar.tech/uploads/2025/10/MX30-LED-Display-Controller-Specifications-V1.5.0.pdf',
    note:
      'Ten Gigabit Ethernet ports and 6.5 million pixels across the device, which lands just '
      + 'under the ten ports\u2019 own 659,722 each at 8-bit 60 Hz, so the device cap binds first. '
      + 'The two 10G optical ports add no capacity: OPT 1 carries the data of ports 1 to 10 and '
      + 'OPT 2 is a copy of it. At 10-bit the receiving cards decide, not the processor \u2014 '
      + 'NovaStar quote 494,792 a port on A10s Pro/A8s Pro and 329,861 on other Armor cards.',
  },
  {
    id: 'novastar-mctrl4k',
    brand: 'NovaStar',
    model: 'MCTRL4K',
    ports: 16,
    portType: '1G',
    // 4096 x 2160 at 60 Hz, the loading capacity NovaStar quotes for one unit.
    totalPixels: 4096 * 2160,
    maxCabinetsPerPort: 512,
    baselineBitDepth: 8,
    baselineHz: 60,
    sourceUrl: 'https://www.novastar.tech/',
    note: 'Sixteen Gigabit Ethernet ports, loading capacity 4096 × 2160 at 60 Hz.',
  },
  {
    id: 'novastar-vx16s',
    brand: 'NovaStar',
    model: 'VX16s',
    ports: 16,
    portType: '1G',
    totalPixels: 10_400_000,
    maxCabinetsPerPort: 512,
    baselineBitDepth: 8,
    baselineHz: 60,
    sourceUrl: 'https://www.novastar.tech/',
    note: 'Sixteen Gigabit Ethernet ports, loading up to 10.4 million pixels.',
  },
  {
    id: 'novastar-vx600',
    brand: 'NovaStar',
    model: 'VX600',
    ports: 6,
    portType: '1G',
    totalPixels: 3_900_000,
    maxCabinetsPerPort: 512,
    baselineBitDepth: 8,
    baselineHz: 60,
    sourceUrl: 'https://www.novastar.tech/',
    note: 'Six Gigabit Ethernet ports, driving up to 3.9 million pixels.',
  },
  {
    id: 'novastar-vx400',
    brand: 'NovaStar',
    model: 'VX400',
    ports: 4,
    portType: '1G',
    totalPixels: 2_600_000,
    maxCabinetsPerPort: 512,
    baselineBitDepth: 8,
    baselineHz: 60,
    sourceUrl: 'https://www.novastar.tech/',
    note: 'Four Gigabit Ethernet ports, driving up to 2.6 million pixels.',
  },
  {
    id: 'novastar-mx2000-pro',
    brand: 'NovaStar',
    model: 'MX2000 Pro',
    ports: 20,
    portType: '1G',
    totalPixels: 35_380_000,
    maxCabinetsPerPort: 512,
    baselineBitDepth: 8,
    baselineHz: 60,
    sourceUrl: 'https://www.novastar.tech/',
    note:
      'COEX controller quoted at 35.38 million pixels. Output is by fitted card, so the twenty '
      + 'Gigabit ports here are the common configuration rather than a fixed count — set your own if it differs.',
  },
  {
    id: 'novastar-mx6000-pro',
    brand: 'NovaStar',
    model: 'MX6000 Pro',
    ports: 20,
    portType: '10G',
    totalPixels: 141_000_000,
    maxCabinetsPerPort: 512,
    baselineBitDepth: 8,
    baselineHz: 60,
    sourceUrl: 'https://www.novastar.tech/',
    note:
      'Flagship COEX controller quoted at 141 million pixels. Output is by fitted card — 4 x 10G '
      + 'fibre or 1 x 40G per slot — so the port count here is a planning figure, not a fixed one.',
  },
  {
    id: 'novastar-vx1000',
    brand: 'NovaStar',
    model: 'VX1000',
    ports: 10,
    portType: '1G',
    totalPixels: 6_500_000,
    maxCabinetsPerPort: 512,
    baselineBitDepth: 8,
    baselineHz: 60,
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
    maxCabinetsPerPort: null,
    baselineBitDepth: 8,
    baselineHz: 60,
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
    maxCabinetsPerPort: null,
    baselineBitDepth: 8,
    baselineHz: 60,
    sourceUrl: null,
    note: 'Planning assumption only: 2.25 million pixels per 10G port. Adjust to your kit.',
  },
];

export const pixelsPerPort = (p: Processor) => Math.floor(p.totalPixels / Math.max(1, p.ports));

/**
 * How a port's capacity moves with colour depth and refresh rate.
 *
 * A pixel costs three channels of colour, every refresh: 24 bits at 60 Hz is
 * 1,440 bits a second, which is why a Gigabit port carries about 650,000 of
 * them and no more. Both terms are linear and both divide, so asking for more
 * bits or more hertz buys fewer pixels in exact proportion — 8-bit 60 Hz
 * halves going to 8-bit 120 Hz, and loses a fifth going to 10-bit.
 *
 * Returned as a multiplier against whatever the manufacturer quoted, rather
 * than as an absolute, so each processor is scaled from its own baseline.
 *
 * The refresh term is exact, but the bit-depth one is optimistic: hardware
 * pads colour that does not fill a byte, so 10-bit costs more on the wire
 * than ten eighths of 8-bit. NovaStar publish both endings for the MX30 —
 * 10-bit runs at 32 bits a pixel on an A10s Pro and 48 on other Armor cards,
 * against the 30 this assumes — and which you get is the receiving card's
 * doing, not the processor's. So a 10-bit port reads high here: about a
 * twentieth over the A10s Pro figure, and some three fifths over the other
 * one. Pinning it down needs a receiving-card field the app does not have
 * yet; until then 10-bit is the number to treat with suspicion.
 */
export function signalScale(p: Processor, bitDepth: number, refreshHz: number) {
  const bits = Math.max(1, bitDepth);
  const hz = Math.max(1, refreshHz);
  return (p.baselineBitDepth / bits) * (p.baselineHz / hz);
}

/** Pixels one port will carry at the chosen colour depth and refresh. */
export const pixelsPerPortAt = (p: Processor, bitDepth: number, refreshHz: number) =>
  Math.floor(pixelsPerPort(p) * signalScale(p, bitDepth, refreshHz));

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
  maxCabinetsPerPort?: number | null;
  baselineBitDepth?: number;
  baselineHz?: number;
}): Processor {
  return {
    id: `proc-${Date.now().toString(36)}`,
    brand: input.brand?.trim() || 'Custom',
    model: input.model.trim() || 'My processor',
    ports: Math.max(1, Math.round(input.ports)),
    portType: input.portType,
    totalPixels: Math.max(1, Math.round(input.totalPixels)),
    maxCabinetsPerPort:
      input.maxCabinetsPerPort && input.maxCabinetsPerPort > 0
        ? Math.round(input.maxCabinetsPerPort)
        : null,
    // Your own figure is whatever you measured it at; 8-bit 60Hz is the
    // assumption if you did not say.
    baselineBitDepth: input.baselineBitDepth ?? 8,
    baselineHz: input.baselineHz ?? 60,
    sourceUrl: null,
    note: 'Your own figures.',
    custom: true,
  };
}
