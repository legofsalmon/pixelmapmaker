/** Shared helpers for the LED cabinet scrapers. */
import { decode } from 'html-entities';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export async function fetchText(url, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-GB,en;q=0.9',
          'cache-control': 'no-cache',
          'upgrade-insecure-requests': '1',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Strip tags, collapse whitespace, decode entities. `<br>` becomes a newline. */
export function text(htmlFragment) {
  return decode(
    htmlFragment
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** First number in a string, e.g. "9.35kg | 20.61lbs" -> 9.35 */
export function num(value) {
  if (value == null) return null;
  const m = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * Parse a physical dimension string into millimetres.
 * Handles "500mm x 500mm x 90mm", "500 x 500 x 90 mm", "0.5m x 0.5m".
 */
export function dimsMm(value) {
  if (!value) return null;
  // Only consider the metric half of dual-unit strings ("500mm x 500mm | 19.69" x ...").
  const metric = String(value).split('\n')[0].split('|')[0];
  const parts = metric.match(/\d+(?:\.\d+)?\s*(?:mm|cm|m)?/gi);
  if (!parts || parts.length < 2) return null;
  const toMm = (p) => {
    const n = parseFloat(p);
    if (/cm/i.test(p)) return n * 10;
    if (/\dm(?!m)/i.test(p)) return n * 1000;
    return n;
  };
  const [w, h, d] = parts.map(toMm);
  if (!w || !h) return null;
  return { width: round(w), height: round(h), depth: d ? round(d) : null };
}

/** Parse "176 x 176" -> { w: 176, h: 176 } */
export function resolution(value) {
  if (!value) return null;
  const m = String(value).match(/(\d+)\s*[x×*]\s*(\d+)/i);
  return m ? { w: parseInt(m[1], 10), h: parseInt(m[2], 10) } : null;
}

/** Parse "190W / 95W" -> { max: 190, avg: 95 } */
export function power(value) {
  if (!value) return null;
  const nums = String(value).match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const [a, b] = nums.map(Number);
  return { max: a ?? null, avg: b ?? a ?? null };
}

export const round = (n, dp = 2) =>
  n == null ? null : Math.round(n * 10 ** dp) / 10 ** dp;

export function slug(...parts) {
  return parts
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Reject anything that clearly is not a video-wall cabinet. */
const NOT_A_CABINET =
  /(processor|processing|controller|frame|bumper|dolly|cable|cabling|rigging|hanging|stacking|case|software|accessor|receiver card|power supply|moving head|wash|spot|beam|fixture|strobe)/i;

export function looksLikeCabinet(name, record) {
  if (!name || NOT_A_CABINET.test(name)) return false;
  // A cabinet must have a pitch and a physical size we can lay out.
  return Boolean(record.pixelPitch && record.cabinet?.width && record.cabinet?.height);
}

/**
 * Derive panel resolution from physical size and pitch.
 *
 * Published pitches are rounded ("3.9mm" for 3.906mm), so a raw division is
 * often a pixel or two out. LED module resolutions are near-always multiples
 * of 8, so snap when a nearby multiple is within tolerance of the raw value.
 */
export function deriveResolution(cabinet, pitch) {
  if (!cabinet?.width || !cabinet?.height || !pitch) return null;
  const snap = (mm) => {
    const raw = mm / pitch;
    // An exact division needs no help — the published pitch was not rounded.
    if (Math.abs(raw - Math.round(raw)) / raw <= 0.002) return Math.round(raw);
    for (const [step, tol] of [[8, 0.015], [4, 0.01], [2, 0.005]]) {
      const candidate = Math.round(raw / step) * step;
      if (candidate > 0 && Math.abs(candidate - raw) / raw <= tol) return candidate;
    }
    return Math.round(raw);
  };
  return { w: snap(cabinet.width), h: snap(cabinet.height) };
}

/**
 * Lowest IP rating quoted in a spec string. Vendors often quote several
 * ("Module: Front IP65, Panel: Front IP30"); the weakest one decides whether
 * a cabinet can actually go outside.
 */
export function minIpRating(value) {
  const found = String(value ?? '').match(/IP\s?(\d{2})/gi);
  if (!found) return null;
  return Math.min(...found.map((f) => parseInt(f.replace(/\D/g, ''), 10)));
}
