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
 * First number in a string that may be written in either convention.
 * INFiLED puts "5,95mm" and "14.400 pixels/m2" on the same spec sheet, so a
 * separator cannot be read as decimal or thousands by which character it is.
 *
 * The rule: a separator followed by exactly three digits, with no digit after
 * them, groups thousands; anything else is the decimal point. Where a number
 * carries both, the last separator is the decimal one ("1.234,5" -> 1234.5).
 *
 * "2.500" is genuinely ambiguous and reads as 2500 here. That is the safer way
 * round for this scraper: a pitch of 2500mm fails `isValid` loudly, where 2.5
 * would ship a panel with a plausible and wrong pitch.
 */
export function localeNum(value) {
  if (value == null) return null;
  const m = String(value).match(/-?\d[\d.,]*/);
  if (!m) return null;
  const raw = m[0];
  const last = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
  if (last === -1) return parseFloat(raw);
  const tail = raw.slice(last + 1);
  const grouped = /^\d{3}$/.test(tail);
  const digits = raw.replace(/[.,]/g, '');
  return grouped ? parseFloat(digits) : parseFloat(`${raw.slice(0, last).replace(/[.,]/g, '')}.${tail}`);
}

/**
 * Unilumin writes series generations as Unicode Roman numerals — "UpadIV" is
 * really "Upad\u2163". Those characters slug away to nothing, so UpadIV and
 * UpadIII would collide on one id, and nobody searching the library types
 * them. Fold them to ASCII in the model name itself, not only in the id, so
 * the name stays searchable.
 */
const ROMAN = {
  '\u2160': 'I', '\u2161': 'II', '\u2162': 'III', '\u2163': 'IV', '\u2164': 'V', '\u2165': 'VI',
  '\u2166': 'VII', '\u2167': 'VIII', '\u2168': 'IX', '\u2169': 'X', '\u216a': 'XI', '\u216b': 'XII',
  '\u2170': 'I', '\u2171': 'II', '\u2172': 'III', '\u2173': 'IV', '\u2174': 'V', '\u2175': 'VI',
  '\u2176': 'VII', '\u2177': 'VIII', '\u2178': 'IX', '\u2179': 'X', '\u217a': 'XI', '\u217b': 'XII',
};

export function asciiRomanNumerals(value) {
  if (value == null) return value;
  return String(value).replace(/[\u2160-\u217b]/g, (c) => ROMAN[c] ?? c);
}

/**
 * Parse a physical dimension string into millimetres.
 * Handles "500mm x 500mm x 90mm", "500 x 500 x 90 mm", "0.5m x 0.5m".
 */
export function dimsMm(value) {
  if (!value) return null;
  // Only consider the metric half of dual-unit strings, however it is fenced
  // off: "500mm x 500mm | 19.69\" x ..." and "1000x1000mm (39,37x39,37inch)"
  // both put the imperial figures second.
  const metric = String(value).split('\n')[0].split('|')[0].split('(')[0];
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
