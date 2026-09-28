/**
 * REDOT — https://www.redotled.com
 *
 * The cooperative one. Where Unilumin and INFiLED write their specification
 * table with JavaScript and need a browser to read, REDOT server-renders it,
 * so this source is a plain fetch. The table is not a `<table>` — it is a flat
 * `<ul>` of alternating label and value `<li>`s — which parses more simply
 * than a real one as long as nothing relies on the pairs being marked up as
 * pairs.
 *
 * Model names are taken from the product menu rather than the page body. The
 * body says "RC-i1.5" in six places, three of them inside meta tags and one a
 * sentence about its weight; the menu says it once, next to the path it
 * belongs to.
 *
 * REDOT is also the first brand in the library to publish a maximum bend per
 * joint, which the curve check has always had to report as unchecked. That
 * figure is worth more than the rest of this source put together, because it
 * is the one that turns a warning the app cannot make into one it can.
 */
import {
  fetchText,
  text,
  num,
  dimsMm,
  resolution,
  slug,
  sleep,
  round,
  minIpRating,
  looksLikeCabinet,
} from '../util.mjs';

const BASE = 'https://www.redotled.com';
const INDEX = `${BASE}/products`;

export const brand = 'REDOT';

/**
 * Cabinet size against resolution × pitch, as a fraction.
 *
 * Published pitches are rounded — 320 × 1.56 is 499.2 against a stated 500,
 * which is 0.2% out and fine. This is not a precision check; it is here to
 * catch a size that disagrees with the other two figures by an order of
 * magnitude, which is what a digit typed twice looks like.
 */
export const SIZE_TOLERANCE = 0.05;

export function sizeDisagrees(cabinet, res, pitch) {
  if (!cabinet || !res || !pitch) return null;
  const off = (stated, pixels) => Math.abs(pixels * pitch - stated) / stated;
  const across = off(cabinet.width, res.w);
  const down = off(cabinet.height, res.h);
  if (across <= SIZE_TOLERANCE && down <= SIZE_TOLERANCE) return null;
  return { across: round(across * 100, 1), down: round(down * 100, 1) };
}

/**
 * The spec list, as label → value.
 *
 * Every page carries the list twice — once for each breakpoint — so the
 * longer one wins rather than the first. They are the same data, but a
 * truncated mobile copy read as the whole table would ship a panel missing
 * half its spec without anything looking wrong.
 */
export function specPairs(html) {
  const lists = [...html.matchAll(/<ul class="proDet1Pro-list[^"]*"[^>]*>([\s\S]*?)<\/ul>/g)];
  let longest = [];
  for (const [, body] of lists) {
    const items = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
      .map((m) => text(m[1]).replace(/\n/g, ' ').trim())
      .filter(Boolean);
    if (items.length > longest.length) longest = items;
  }
  const pairs = new Map();
  for (let i = 0; i + 1 < longest.length; i += 2) pairs.set(longest[i], longest[i + 1]);
  return pairs;
}

/** Look a label up by any of several spellings — the site punctuates loosely. */
export const field = (pairs, ...patterns) => {
  for (const pattern of patterns) {
    for (const [label, value] of pairs) {
      if (new RegExp(pattern, 'i').test(label)) return value;
    }
  }
  return null;
};

/**
 * Pitch in millimetres, or null where the pixel is not square.
 *
 * The mesh and transparent panels are quoted "3.9mm(H) 7.8mm(V)": two pitches,
 * because the pixels really are twice as far apart vertically. A cabinet here
 * carries one pitch, and the app spends it on viewing-distance advice — how
 * close someone can stand before the pixels separate. Picking either figure
 * would make that advice confidently wrong in one axis, so these are refused
 * rather than flattened, and the caller says so in the log.
 */
export function pitchMm(value) {
  if (!value) return null;
  const axes = [...String(value).matchAll(/(\d+(?:\.\d+)?)\s*mm\s*\(([HV])\)/gi)];
  if (axes.length >= 2) {
    const [h, v] = axes.map((m) => parseFloat(m[1]));
    return h === v ? h : null;
  }
  return num(value);
}

/**
 * Tightest bend per joint the panel is rated for, in degrees.
 *
 * Quoted as "+ 10 or – 10°", and on the Holo as "+ 10 or – 10°,+ 5 or – 5°" —
 * two ratings, presumably one per axis. The smallest is the one that holds in
 * every direction, and this feeds a check that is meant to fail a wall bent
 * too far; taking the larger would pass a curve the panel cannot make.
 */
export function curveLimit(value) {
  if (!value) return null;
  const degrees = [...String(value).matchAll(/(\d+(?:\.\d+)?)\s*°?/g)]
    .map((m) => parseFloat(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  return degrees.length ? Math.min(...degrees) : null;
}

/** Product path → model name, read off the menu that links them. */
export function modelNames(html) {
  const names = new Map();
  for (const m of html.matchAll(/href="(\/[A-Za-z-]+\/\d+\.html)"[^>]*>([^<]{1,40})<\/a>/g)) {
    const label = text(m[2]).trim();
    if (label && !names.has(m[1])) names.set(m[1], label);
  }
  return names;
}

/** The series is the folder the product sits in: "Indoor-series" -> "Indoor". */
export const seriesFrom = (path) =>
  path.split('/')[1].replace(/-series$/i, '').replace(/-/g, ' ');

export async function scrape({ log = console.log } = {}) {
  const index = await fetchText(INDEX);
  const names = modelNames(index);
  const paths = [...names.keys()];
  log(`[REDOT] ${paths.length} product pages`);

  const cabinets = [];
  for (const path of paths) {
    const url = `${BASE}${path}`;
    const model = names.get(path);
    let html;
    try {
      html = await fetchText(url);
    } catch (err) {
      log(`[REDOT] skip ${path}: ${err.message}`);
      continue;
    }

    const pairs = specPairs(html);
    if (!pairs.size) {
      // The touring frame and the dolly are products with no pitch. Nothing is
      // wrong with the page; there is simply no cabinet on it.
      log(`[REDOT] ${model}: no spec list, not a cabinet`);
      continue;
    }

    const rawPitch = field(pairs, 'pixel pitch');
    const pitch = pitchMm(rawPitch);
    if (rawPitch && pitch == null) {
      log(`[REDOT] skip ${model}: pitch "${rawPitch}" is not square, and a cabinet carries one pitch`);
      continue;
    }

    const cabinet = dimsMm(field(pairs, 'cabinet size', 'led cabinet size'));
    const res = resolution(field(pairs, 'cabinet resolution', 'resolution'));

    const off = sizeDisagrees(cabinet, res, pitch);
    if (off) {
      log(
        `[REDOT] skip ${model}: ${cabinet.width}x${cabinet.height}mm disagrees with ` +
          `${res.w}x${res.h} at ${pitch}mm by ${off.across}% and ${off.down}%`
      );
      continue;
    }

    const ipText = field(pairs, 'ip rate', 'ip rating') ?? '';
    const ip = minIpRating(ipText);
    const maxW = num(field(pairs, 'power consumption, maximum'));
    const typW = num(field(pairs, 'power consumption, typical'));

    cabinets.push({
      id: slug('redot', model),
      brand,
      series: seriesFrom(path),
      model,
      pixelPitch: pitch,
      cabinet,
      resolution: res,
      weightKg: round(num(field(pairs, 'cabinet weight', 'weight'))),
      power: maxW ? { max: maxW, avg: typW ?? round(maxW / 2) } : null,
      brightnessNits: num(field(pairs, 'brightness')),
      refreshHz: num(field(pairs, 'refresh')),
      ipRating: ipText || null,
      scanRate: null,
      ledConfig: field(pairs, 'led configuration'),
      maxCurveAngle: curveLimit(field(pairs, 'curving')),
      // "indoor" appears where an IP code would on the fine-pitch panel, so
      // the rating decides where there is one and the wording where there is not.
      environment: ip != null ? (ip >= 54 ? 'outdoor' : 'indoor') : /outdoor/i.test(`${path} ${ipText}`) ? 'outdoor' : 'indoor',
      sourceUrl: url,
    });
    await sleep(300);
  }

  const kept = cabinets.filter((c) => looksLikeCabinet(c.model, c));
  log(`[REDOT] ${kept.length} cabinets`);
  return kept;
}
