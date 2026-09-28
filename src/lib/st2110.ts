/**
 * Video over IP: what each screen's feed costs on an ST 2110 network.
 *
 * A screen fed over ST 2110 receives its picture as a stream of RTP packets on
 * a multicast group. Planning one is arithmetic that nobody wants to do by
 * hand: the pixels at the chosen sampling and depth, cut into packets the way
 * ST 2110-20 cuts them, plus the framing every packet carries, packed onto
 * links that must not run full. This module does that arithmetic, gives each
 * flow a multicast group, and writes the SDP file a receiver loads.
 *
 * Packets are cut exactly as the st2110 project's sender cuts them
 * (github.com/legofsalmon/st2110), so the counts here are the counts a capture
 * of that sender shows: `scripts/test-st2110.mjs` holds the two together.
 */
import type { Layer } from './types';

export type Transport = 'none' | 'uncompressed' | 'jpeg-xs';
export type Sampling = 'RGB' | 'YCbCr-4:4:4' | 'YCbCr-4:2:2';
export type Depth = 8 | 10 | 12;

export const SAMPLINGS: Array<{ id: Sampling; label: string }> = [
  { id: 'RGB', label: 'RGB' },
  { id: 'YCbCr-4:4:4', label: 'YCbCr 4:4:4' },
  { id: 'YCbCr-4:2:2', label: 'YCbCr 4:2:2' },
];

export interface FrameRate {
  id: string;
  num: number;
  den: number;
}

/** The rates ST 2110 carries in practice, the fractional ones as SMPTE writes them. */
export const FRAME_RATES: FrameRate[] = [
  { id: '23.98', num: 24000, den: 1001 },
  { id: '24', num: 24, den: 1 },
  { id: '25', num: 25, den: 1 },
  { id: '29.97', num: 30000, den: 1001 },
  { id: '30', num: 30, den: 1 },
  { id: '50', num: 50, den: 1 },
  { id: '59.94', num: 60000, den: 1001 },
  { id: '60', num: 60, den: 1 },
  { id: '100', num: 100, den: 1 },
  { id: '119.88', num: 120000, den: 1001 },
  { id: '120', num: 120, den: 1 },
];

export const findFrameRate = (id: string) => FRAME_RATES.find((r) => r.id === id) ?? FRAME_RATES[7];

/** `exactframerate` as ST 2110-20 §7.2 writes it: a whole number, or a ratio. */
export const exactFrameRate = (rate: FrameRate) => (rate.den === 1 ? `${rate.num}` : `${rate.num}/${rate.den}`);

/** Ethernet line rates, in Gb/s. */
export const LINK_SPEEDS = [10, 25, 40, 50, 100, 200, 400];

/** How full a link may be planned to run. */
export const LINK_LOADS = [1, 0.9, 0.8, 0.7];

/** JPEG XS ratios against the uncompressed pixel, 10 for 10:1. */
export const XS_RATIOS = [4, 6, 8, 10, 15, 20];

export interface St2110Settings {
  /** 'none' leaves the feed unplanned, and the plan off the spec sheet. */
  transport: Transport;
  sampling: Sampling;
  /** Bits per sample. */
  depth: Depth;
  /** An id from FRAME_RATES. */
  frameRate: string;
  /** JPEG XS compression, against the uncompressed pixel: 10 for 10:1. */
  xsRatio: number;
  /** Speed of the links the flows are packed onto, Gb/s. */
  linkGbps: number;
  /**
   * How full a link may run. Flows meeting on one switch port queue behind
   * each other, so a link planned to 100% has no room for the moment two
   * flows' packets arrive together.
   */
  linkLoad: number;
  /** ST 2022-7: every flow sent twice, once on each of two networks. */
  redundancy: boolean;
  /** First multicast group on each network; later flows count up from it. */
  primaryBase: string;
  secondaryBase: string;
  port: number;
  /** The sending machine's address on each network, or '' when there are several. */
  primarySource: string;
  secondarySource: string;
  /** `traceable`, or a grandmaster and domain such as `08-00-11-FF-FE-21-E4-9B:127`. */
  clock: string;
}

export const DEFAULT_ST2110: St2110Settings = {
  transport: 'none',
  sampling: 'RGB',
  depth: 10,
  frameRate: '60',
  xsRatio: 10,
  linkGbps: 25,
  linkLoad: 0.9,
  redundancy: false,
  primaryBase: '239.20.1.1',
  secondaryBase: '239.21.1.1',
  port: 5004,
  primarySource: '',
  secondarySource: '',
  clock: 'traceable',
};

/**
 * Settings read back from a saved or hand-edited project, with anything the
 * tab could not have set replaced by its default. The maths trusts what it is
 * given, and a depth with no pixel group, or a clock that is not text, would
 * throw in the middle of drawing the spec sheet.
 */
export function normaliseSt2110(saved: unknown): St2110Settings {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<keyof St2110Settings, unknown>>;
  const d = DEFAULT_ST2110;
  const oneOf = <T>(value: unknown, allowed: readonly T[], fallback: T) =>
    allowed.includes(value as T) ? (value as T) : fallback;
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
  return {
    transport: oneOf<Transport>(s.transport, ['none', 'uncompressed', 'jpeg-xs'], d.transport),
    sampling: oneOf(s.sampling, SAMPLINGS.map((x) => x.id), d.sampling),
    depth: oneOf<Depth>(s.depth, [8, 10, 12], d.depth),
    frameRate: oneOf(s.frameRate, FRAME_RATES.map((r) => r.id), d.frameRate),
    xsRatio: oneOf(s.xsRatio, XS_RATIOS, d.xsRatio),
    linkGbps: oneOf(s.linkGbps, LINK_SPEEDS, d.linkGbps),
    linkLoad: oneOf(s.linkLoad, LINK_LOADS, d.linkLoad),
    redundancy: typeof s.redundancy === 'boolean' ? s.redundancy : d.redundancy,
    primaryBase: text(s.primaryBase, d.primaryBase),
    secondaryBase: text(s.secondaryBase, d.secondaryBase),
    port: Number.isInteger(s.port) && (s.port as number) >= 1 && (s.port as number) <= 65535 ? (s.port as number) : d.port,
    primarySource: text(s.primarySource, d.primarySource),
    secondarySource: text(s.secondarySource, d.secondarySource),
    clock: text(s.clock, d.clock),
  };
}

/**
 * A pixel group: the fewest pixels whose samples end on a whole octet, and
 * those octets. ST 2110-20 never splits one across packets, so a row must be a
 * whole number of them (Tables 1 and 2 of the standard).
 */
export interface PixelGroup {
  octets: number;
  pixels: number;
}

export function pixelGroup(sampling: Sampling, depth: Depth): PixelGroup {
  if (sampling === 'YCbCr-4:2:2') {
    return { 8: { octets: 4, pixels: 2 }, 10: { octets: 5, pixels: 2 }, 12: { octets: 6, pixels: 2 } }[depth];
  }
  return { 8: { octets: 3, pixels: 1 }, 10: { octets: 15, pixels: 4 }, 12: { octets: 9, pixels: 2 } }[depth];
}

/** Bits a pixel takes uncompressed: three samples, or two where 4:2:2 shares its colour. */
export const bitsPerPixel = (sampling: Sampling, depth: Depth) => (sampling === 'YCbCr-4:2:2' ? 2 : 3) * depth;

/**
 * The largest RTP payload under ST 2110-10's standard UDP size limit: a
 * datagram of 1460 octets, less the 8 of the UDP header and the 12 of RTP.
 */
export const PAYLOAD_LIMIT = 1440;

/** The extended sequence number and one sample row data header (ST 2110-20 §6.1). */
const ESN = 2;
const SRD = 6;
/** RTP, UDP and IPv4 headers. */
const HEADERS = 12 + 8 + 20;
/**
 * What Ethernet adds to every packet on the wire: its header and FCS (18), the
 * preamble and start delimiter (8), and the gap before the next frame (12). A
 * link's rate counts all of it, so all of it has to fit.
 */
export const ETHERNET_OCTETS = 38;
/** RFC 9134's JPEG XS payload header. */
const XS_HEADER = 4;
/** JPEG XS data a packet: the most under the limit that is a whole number of 8 octets. */
const XS_DATA = Math.floor((PAYLOAD_LIMIT - XS_HEADER) / 8) * 8;

/** One frame of a flow, cut into packets. */
export interface Packing {
  packets: number;
  /** Octets of pixel data, or of JPEG XS codestream. */
  dataOctets: number;
  /** Octets at the IP layer: what a capture and SDP's `b=AS` count. */
  ipOctets: number;
  /** Octets on the wire, framing and gaps included: what fills a link. */
  wireOctets: number;
}

/**
 * Cut an uncompressed frame into packets, as ST 2110-20's general packing
 * mode (2110GPM) does in the st2110 sender: each row split evenly into as few
 * packets as the size limit allows or, where rows are short, up to three whole
 * rows in one packet, each with its own row header.
 *
 * `width` must be a whole number of pixel groups; `paddedWidth` makes it one.
 */
export function packUncompressed(width: number, height: number, group: PixelGroup): Packing {
  const row = (width / group.pixels) * group.octets;
  // Octets of pixel groups that fit beside `headers` row headers.
  const fits = (headers: number) => Math.floor((PAYLOAD_LIMIT - ESN - SRD * headers) / group.octets) * group.octets;

  let packets: number;
  let rowHeaders: number;
  if (row <= fits(1)) {
    const perPacket = [3, 2, 1].find((m) => m * row <= fits(m)) ?? 1;
    packets = Math.ceil(height / perPacket);
    rowHeaders = height;
  } else {
    packets = height * Math.ceil(row / fits(1));
    rowHeaders = packets;
  }
  const dataOctets = row * height;
  const ipOctets = dataOctets + packets * (ESN + HEADERS) + rowHeaders * SRD;
  return { packets, dataOctets, ipOctets, wireOctets: ipOctets + packets * ETHERNET_OCTETS };
}

/**
 * A JPEG XS frame at a constant `bpp`, as ST 2110-22 requires: the same
 * octets every frame, carried in codestream mode (RFC 9134) in packets whose
 * data is a whole number of 8 octets but the last, as VSF TR-08 asks.
 */
export function packJpegXs(width: number, height: number, bpp: number): Packing {
  const dataOctets = Math.ceil((width * height * bpp) / 8);
  const packets = Math.ceil(dataOctets / XS_DATA);
  const ipOctets = dataOctets + packets * (XS_HEADER + HEADERS);
  return { packets, dataOctets, ipOctets, wireOctets: ipOctets + packets * ETHERNET_OCTETS };
}

/** Round a width up to whole pixel groups. */
export const paddedWidth = (width: number, group: PixelGroup) => Math.ceil(width / group.pixels) * group.pixels;

export interface FlowRate {
  width: number;
  height: number;
  /** Pixels added on the right to make whole pixel groups. */
  padding: number;
  packetsPerFrame: number;
  packetsPerSecond: number;
  /** Bits a second of pixels or codestream alone. */
  dataBps: number;
  ipBps: number;
  wireBps: number;
}

/** What a picture of this size costs as one flow. */
export function flowRate(width: number, height: number, settings: St2110Settings): FlowRate {
  const rate = findFrameRate(settings.frameRate);
  const fps = rate.num / rate.den;
  let w = width;
  let packing: Packing;
  if (settings.transport === 'jpeg-xs') {
    const bpp = bitsPerPixel(settings.sampling, settings.depth) / Math.max(1, settings.xsRatio);
    packing = packJpegXs(width, height, bpp);
  } else {
    const group = pixelGroup(settings.sampling, settings.depth);
    w = paddedWidth(width, group);
    packing = packUncompressed(w, height, group);
  }
  return {
    width: w,
    height,
    padding: w - width,
    packetsPerFrame: packing.packets,
    packetsPerSecond: packing.packets * fps,
    dataBps: packing.dataOctets * 8 * fps,
    ipBps: packing.ipOctets * 8 * fps,
    wireBps: packing.wireOctets * 8 * fps,
  };
}

/**
 * The fewest links that carry every flow, none running past `capacity`.
 *
 * A flow cannot be split across links, so this is bin packing. First fit on
 * the flows sorted largest first answers at once, and is usually right: it is
 * whenever it lands on the floor below, which is most of the time. When it does
 * not, each smaller count is searched for in turn. Two flows of 40% and four of
 * 30% are the kind of plan that needs it: first fit puts the two big ones
 * together and takes three links, where 40, 30 and 30 twice takes two.
 *
 * The search stops after a fixed amount of work, and first fit's answer then
 * stands, so it is never slow. A flow bigger than a link takes one to itself.
 */
export function linksFor(rates: number[], capacity: number) {
  const oversize = rates.filter((r) => r > capacity).length;
  const sorted = rates.filter((r) => r <= capacity).sort((a, b) => b - a);

  const firstFit: number[] = [];
  for (const rate of sorted) {
    const i = firstFit.findIndex((used) => used + rate <= capacity);
    if (i >= 0) firstFit[i] += rate;
    else firstFit.push(rate);
  }

  // No packing does better than the total over one link's worth, nor than
  // the flows too big to share a link k ways, k to a link.
  let floor = Math.ceil(sorted.reduce((a, b) => a + b, 0) / capacity);
  for (let k = 1; k <= sorted.length; k++) {
    const big = sorted.filter((r) => r > capacity / (k + 1)).length;
    floor = Math.max(floor, Math.ceil(big / k));
  }

  // What is left to place after each flow, and the smallest flow of all.
  const after = sorted.map((_, i) => sorted.slice(i).reduce((a, b) => a + b, 0));
  const smallest = sorted[sorted.length - 1];
  let work = 200_000;
  // Whether the flows go on `count` links, or null when the work ran out.
  const fits = (count: number): boolean | null => {
    const loads = new Array<number>(count).fill(0);
    const place = (i: number): boolean | null => {
      if (i === sorted.length) return true;
      if ((work -= count) < 0) return null;
      // Room too small for even the smallest flow is lost; if what is left
      // cannot fit in the rest, nothing placed from here will change that.
      const room = loads.reduce((a, load) => (capacity - load >= smallest ? a + capacity - load : a), 0);
      if (after[i] > room) return false;
      const tried: number[] = [];
      for (let b = 0; b < count; b++) {
        const before = loads[b];
        // A link as full as one already tried leads where that one did.
        if (before + sorted[i] > capacity || tried.includes(before)) continue;
        tried.push(before);
        loads[b] = before + sorted[i];
        const placed = place(i + 1);
        loads[b] = before;
        if (placed !== false) return placed;
      }
      return false;
    };
    return place(0);
  };

  let best = firstFit.length;
  for (let count = floor; count < best; count++) {
    const found = fits(count);
    if (found === null) break;
    if (found) best = count;
  }
  return best + oversize;
}

export function parseIpv4(text: string): number | null {
  const parts = text.trim().split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
  return parts.reduce((n, p) => n * 256 + Number(p), 0);
}

export const formatIpv4 = (n: number) => [24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256).join('.');

/** 224.0.0.0 to 239.255.255.255. */
export const isMulticast = (n: number) => n >= 0xe0000000 && n <= 0xefffffff;

/**
 * The low 23 bits of a group, which is all of it that reaches its Ethernet
 * address: 32 groups share every multicast MAC.
 */
export const groupMac = (n: number) => n % 2 ** 23;

/**
 * `count` groups counting up from `base`, or null when there is no such run.
 *
 * Addresses ending .0 or .255 are skipped. They are valid groups, but plenty
 * of equipment validates an address field as though it held a host, and
 * refuses them; leaving them out costs nothing.
 */
export function groupsFrom(base: number, count: number): number[] | null {
  if (!isMulticast(base)) return null;
  const groups: number[] = [];
  for (let n = base; groups.length < count; n++) {
    if (n > 0xefffffff) return null;
    const last = n % 256;
    if (last !== 0 && last !== 255) groups.push(n);
  }
  return groups;
}

/** The value for `a=ts-refclk:ptp=IEEE1588-2008:`, or null when `text` is not one. */
export function parseClock(text: string): string | null {
  const value = text.trim();
  if (value.toLowerCase() === 'traceable') return 'traceable';
  const match = /^((?:[0-9a-f]{2}-){7}[0-9a-f]{2}):(\d{1,3})$/i.exec(value);
  if (!match || Number(match[2]) > 127) return null;
  return `${match[1].toUpperCase()}:${Number(match[2])}`;
}

export interface Flow extends FlowRate {
  layerId: string;
  /** The screen's name, and which part of it when it is split. */
  label: string;
  part: number;
  parts: number;
  /** Which way a split screen was cut. */
  across: 'columns' | 'rows';
  /** Cabinet columns and rows the flow carries, from and to (exclusive). */
  cols: [number, number];
  rows: [number, number];
  /** One line of cabinets is still more than a link carries. */
  tooBig: boolean;
  primary: string | null;
  secondary: string | null;
}

export interface St2110Plan {
  flows: Flow[];
  /** Two when every flow is sent twice. */
  networks: number;
  /** Bits a second on each network, on the wire. */
  wireBps: number;
  dataBps: number;
  /** Links on the sending side, on each network. */
  links: number;
  /** What a link may carry at the planned load. */
  capacityBps: number;
  largest: Flow | null;
  /** The canvas sent whole as one flow, for comparison. */
  canvasWireBps: number;
  warnings: string[];
}

/** Sizes of `parts` pieces of `n`, as even as they go, larger first. */
function pieces(n: number, parts: number) {
  return Array.from({ length: parts }, (_, i) => Math.floor(n / parts) + (i < n % parts ? 1 : 0));
}

/**
 * Cut a screen into as few flows as fit a link each.
 *
 * Cuts fall between cabinets, along whichever way the screen has more of
 * them, because that is where a processor's region can end: a receiver takes a
 * rectangle of the wall, and a rectangle that stopped inside a cabinet would
 * need the cabinet itself to be split between two inputs.
 */
function flowsForLayer(layer: Layer, settings: St2110Settings, capacity: number) {
  const { w: cw, h: ch } = layer.spec.resolution;
  const acrossCols = layer.cols >= layer.rows;
  const n = acrossCols ? layer.cols : layer.rows;
  const rateOf = (size: number) =>
    acrossCols ? flowRate(size * cw, layer.rows * ch, settings) : flowRate(layer.cols * cw, size * ch, settings);

  // When one line of cabinets is already too much, cutting finer only makes
  // more flows that do not fit either: it stays whole, and says so.
  const tooBig = rateOf(1).wireBps > capacity;
  let sizes = [n];
  for (let parts = 1; !tooBig && parts <= n; parts++) {
    sizes = pieces(n, parts);
    if (rateOf(sizes[0]).wireBps <= capacity) break;
  }

  let at = 0;
  return sizes.map((size, i): Flow => {
    const span: [number, number] = [at, at + size];
    at += size;
    return {
      ...rateOf(size),
      layerId: layer.id,
      label: sizes.length > 1 ? `${layer.name}, part ${i + 1} of ${sizes.length}` : layer.name,
      part: i + 1,
      parts: sizes.length,
      across: acrossCols ? 'columns' : 'rows',
      cols: acrossCols ? span : ([0, layer.cols] as [number, number]),
      rows: acrossCols ? ([0, layer.rows] as [number, number]) : span,
      tooBig,
      primary: null,
      secondary: null,
    };
  });
}

/**
 * Does a group share its Ethernet address with a control group — 224.0.0.x,
 * which switches flood to every port, or 224.0.1.x, where PTP's 224.0.1.129
 * sits and which every device joins? A switch that forwards multicast by
 * Ethernet address sends such a flow wherever its twin goes, which for a video
 * flow is everywhere.
 *
 * Groups counted up from one base never clash with each other: any run of 2²³
 * consecutive addresses maps to as many different Ethernet addresses. The
 * control groups are the clash a plan can walk into.
 */
export const sharesControlMac = (group: number) => groupMac(group) < 512;

export function planSt2110(
  layers: Layer[],
  canvas: { width: number; height: number },
  settings: St2110Settings
): St2110Plan {
  const capacity = settings.linkGbps * 1e9 * settings.linkLoad;
  const link = `${settings.linkGbps} GbE link`;
  const warnings: string[] = [];

  const flows = layers
    .filter((l) => l.cols > 0 && l.rows > 0)
    .flatMap((layer) => flowsForLayer(layer, settings, capacity));

  const samplingLabel = SAMPLINGS.find((s) => s.id === settings.sampling)?.label ?? settings.sampling;
  for (const layer of layers) {
    const own = flows.filter((f) => f.layerId === layer.id);
    const first = own[0];
    if (!first) continue;
    if (first.tooBig) {
      warnings.push(
        `${layer.name} is more than a ${link} carries even one line of cabinets at a time. Choose a faster link.`
      );
    } else if (own.length > 1) {
      const cuts = own.slice(1).map((f) => (f.across === 'columns' ? f.cols[0] : f.rows[0]));
      const which = cuts.length === 1 ? first.across.slice(0, -1) : first.across;
      warnings.push(
        `${layer.name} is more than one ${link} carries at ${Math.round(settings.linkLoad * 100)}%, so it goes as ` +
          `${own.length} flows, cut after cabinet ${which} ${cuts.join(', ')}.`
      );
    }
    if (first.padding > 0) {
      const group = pixelGroup(settings.sampling, settings.depth);
      warnings.push(
        `${layer.name} is ${first.width - first.padding} pixels wide, and ${settings.depth}-bit ${samplingLabel} ` +
          `goes in groups of ${group.pixels} pixels, so its flow is ${first.width} wide, ` +
          `with ${first.padding} unused on the right.`
      );
    }
  }

  const networks = settings.redundancy ? 2 : 1;
  const bases = [settings.primaryBase, ...(settings.redundancy ? [settings.secondaryBase] : [])];
  bases.forEach((text, network) => {
    const base = parseIpv4(text);
    const groups = base === null ? null : groupsFrom(base, flows.length);
    const which = network === 0 ? (settings.redundancy ? 'primary ' : '') : 'secondary ';
    if (!groups) {
      warnings.push(
        base !== null && isMulticast(base)
          ? `There are not ${flows.length} ${which}groups left after ${text.trim()}. Start lower.`
          : `${text.trim() || 'An empty field'} is not a multicast address, so the ${which}flows have no groups.`
      );
      return;
    }
    flows.forEach((f, i) => {
      if (network === 0) f.primary = formatIpv4(groups[i]);
      else f.secondary = formatIpv4(groups[i]);
    });

    const control = groups.filter(sharesControlMac);
    if (control.length) {
      const twin = formatIpv4(0xe0000000 + groupMac(control[0]));
      warnings.push(
        (control.length > 1
          ? `${formatIpv4(control[0])} and ${control.length - 1} more share Ethernet addresses with control ` +
            `groups, ${twin} among them, so a switch that forwards multicast by Ethernet address may send them`
          : `${formatIpv4(control[0])} shares an Ethernet address with a control group, ${twin}, so a switch ` +
            `that forwards multicast by Ethernet address may send it`) +
          ` to every port. Any group whose middle octets are 0.0, 0.1, 128.0 or 128.1 does; start elsewhere, ` +
          `such as 239.20.1.1.`
      );
    }
  });

  // The clock and the senders only go into SDP files, which JPEG XS flows do not get.
  if (settings.transport === 'uncompressed') {
    if (parseClock(settings.clock) === null) {
      warnings.push(`${settings.clock.trim() || 'An empty clock'} is not "traceable" or a grandmaster and domain.`);
    }
    const sources = [{ text: settings.primarySource, which: settings.redundancy ? 'primary ' : '' }];
    if (settings.redundancy) sources.push({ text: settings.secondarySource, which: 'secondary ' });
    for (const { text, which } of sources) {
      const source = parseIpv4(text);
      if (text.trim() && (source === null || isMulticast(source))) {
        warnings.push(`${text.trim()} is not an address a ${which}sender can have.`);
      }
    }
  }

  const rates = flows.map((f) => f.wireBps);
  return {
    flows,
    networks,
    wireBps: rates.reduce((a, b) => a + b, 0),
    dataBps: flows.reduce((a, f) => a + f.dataBps, 0),
    links: linksFor(rates, capacity),
    capacityBps: capacity,
    largest: flows.reduce<Flow | null>((a, f) => (!a || f.wireBps > a.wireBps ? f : a), null),
    canvasWireBps:
      canvas.width > 0 && canvas.height > 0 ? flowRate(canvas.width, canvas.height, settings).wireBps : 0,
    warnings,
  };
}

/** A rate as it is quoted: Mb/s under a gigabit, then Gb/s to about three figures. */
export function formatRate(bps: number) {
  if (bps < 1e9) return `${Math.round(bps / 1e6)} Mb/s`;
  const g = bps / 1e9;
  return `${g < 10 ? g.toFixed(2) : g < 100 ? g.toFixed(1) : Math.round(g)} Gb/s`;
}

/** The feed in a line: `RGB 10-bit, 60 fps, uncompressed`. */
export function describeFeed(settings: St2110Settings) {
  const sampling = SAMPLINGS.find((s) => s.id === settings.sampling)?.label ?? settings.sampling;
  const how = settings.transport === 'jpeg-xs' ? `JPEG XS at ${settings.xsRatio}:1` : 'uncompressed';
  return `${sampling} ${settings.depth}-bit, ${findFrameRate(settings.frameRate).id} fps, ${how}`;
}

/** 32-bit FNV-1a, for session ids that stay put when nothing changes. */
function fnv(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The SDP file for one uncompressed flow, both legs of it when it has two.
 *
 * Written as the st2110 sender writes its own, so a receiver set up from the
 * plan is set up the way the stream will describe itself. Two things are the
 * plan's guesses rather than facts about a sender, and are stated as such:
 * TP=2110TPN, the narrow sender hardware sends, and the reference clock.
 *
 * Null for JPEG XS, whose profile and level are the encoder's to choose, and
 * for a flow with no group.
 */
export function sdpForFlow(flow: Flow, settings: St2110Settings): string | null {
  if (settings.transport !== 'uncompressed' || !flow.primary) return null;
  if (settings.redundancy && !flow.secondary) return null;
  const clock = parseClock(settings.clock) ?? 'traceable';
  const fmtp =
    `sampling=${settings.sampling}; width=${flow.width}; height=${flow.height}; ` +
    `exactframerate=${exactFrameRate(findFrameRate(settings.frameRate))}; depth=${settings.depth}; ` +
    `TCS=SDR; colorimetry=BT709; PM=2110GPM; SSN=ST2110-20:2017; TP=2110TPN;`;
  const unicast = (text: string) => {
    const n = parseIpv4(text);
    return n !== null && !isMulticast(n) ? formatIpv4(n) : null;
  };

  const legs = [
    { group: flow.primary, source: unicast(settings.primarySource), mid: 'primary' },
    ...(settings.redundancy && flow.secondary
      ? [{ group: flow.secondary, source: unicast(settings.secondarySource), mid: 'secondary' }]
      : []),
  ];
  const name = flow.label.replace(/[\r\n]+/g, ' ').trim() || '-';
  const lines = [
    'v=0',
    `o=- ${fnv(`${flow.primary}:${settings.port}`)} ${fnv(fmtp)} IN IP4 ${legs[0].source ?? '0.0.0.0'}`,
    `s=${name}`,
    't=0 0',
    ...(legs.length > 1 ? ['a=group:DUP primary secondary'] : []),
    ...legs.flatMap((leg) => [
      `m=video ${settings.port} RTP/AVP 96`,
      `c=IN IP4 ${leg.group}/32`,
      ...(leg.source ? [`a=source-filter: incl IN IP4 ${leg.group} ${leg.source}`] : []),
      'a=rtpmap:96 raw/90000',
      `a=fmtp:96 ${fmtp}`,
      `a=ts-refclk:ptp=IEEE1588-2008:${clock}`,
      'a=mediaclk:direct=0',
      ...(legs.length > 1 ? [`a=mid:${leg.mid}`] : []),
    ]),
  ];
  return lines.map((line) => `${line}\r\n`).join('');
}

/** A file name for a flow's SDP file: its place in the plan, then its name. */
export function sdpFileName(flow: Flow, index: number) {
  const slug = flow.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${String(index + 1).padStart(2, '0')}-${slug || 'screen'}.sdp`;
}
