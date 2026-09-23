/**
 * Unilumin — https://unilumin.com
 *
 * The product pages are WordPress and the marketing copy is server-rendered,
 * but the specification table is written by the theme's JavaScript: fetch one
 * and you get every label and not one value. So this source drives a real
 * browser (see `../browser.mjs`).
 *
 * The table itself is transposed, the same shape GLOSHINE publishes: a `Model`
 * row across the top naming one panel per column, then a row per spec with the
 * label in the first cell. One page is therefore a series, not a panel.
 */
import {
  asciiRomanNumerals,
  deriveResolution,
  dimsMm,
  looksLikeCabinet,
  minIpRating,
  num,
  resolution,
  round,
  slug,
  sleep,
} from '../util.mjs';
import { openBrowser, TransportError } from '../browser.mjs';

const BASE = 'https://unilumin.com';
// Every page carries the whole product mega-menu, so one load enumerates the
// catalogue and there is no index to crawl.
const INDEX = `${BASE}/products/professional/`;

// Category landing pages, the all-in-one displays and the LED cinema screens
// are not cabinets anyone tiles a wall out of.
const SKIP = /\/products\/(professional|commercial|dooh|rental|creative|aio|utv-cinema)?\/?$|ucine|utv-sc|u-sphere-cinema/i;

export const brand = 'Unilumin';

/** Repeat a merged value across every model column, as GLOSHINE's source does. */
function spread(values, count) {
  if (values.length >= count) return values.slice(0, count);
  return Array.from({ length: count }, (_, i) => values[i] ?? values[0] ?? '');
}

/**
 * The row whose label matches, trying the keys in the order given rather than
 * taking whichever row comes first. It matters: a page listing "Average Power
 * Consumption" above "Max Power Consumption" would otherwise hand the average
 * back as the maximum, because both rows match the loose `power consumption`
 * fallback.
 */
function rowFor(rows, ...keys) {
  for (const key of keys) {
    const pattern = new RegExp(key, 'i');
    const hit = rows.find((r) => pattern.test(r[0] ?? ''));
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Turn one rendered table into cabinet records.
 *
 * Exported because this is the part that breaks when Unilumin redraws a page,
 * and it is worth testing against a captured table rather than the live site.
 * Returns `[]` for a table that is not a spec table at all — a page carries
 * marketing comparisons ("U-shield vs Traditional Lamp") in the same markup.
 */
export function parseSpecTable(rows, { series, sourceUrl }) {
  if (!rows?.length) return [];
  const modelRow = rowFor(rows, '^model');
  const pitchRow = rowFor(rows, 'pixel pitch');
  const sizeRow = rowFor(rows, 'cabinet size', 'cabinet dimension', 'panel size', 'panel dimension');
  if (!pitchRow || !sizeRow) return [];

  // Without a Model row the columns are still panels; name them by pitch, which
  // is how Unilumin's own copy refers to them ("the 1.5 and the 1.9").
  const models = (modelRow ?? pitchRow)
    .slice(1)
    .map((cell, i) => (modelRow ? cell : `${series} ${pitchRow[i + 1] ?? ''}`.trim()))
    .map((m) => asciiRomanNumerals(m).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!models.length) return [];

  const field = (...keys) => {
    const row = rowFor(rows, ...keys);
    return row ? spread(row.slice(1).filter(Boolean), models.length) : [];
  };

  const pitches = field('pixel pitch');
  const sizes = field('cabinet size', 'cabinet dimension', 'panel size', 'panel dimension');
  const pixels = field('pixels per panel', 'cabinet resolution', 'panel resolution', 'resolution');
  const weights = field('weight');
  const brightness = field('brightness');
  const refresh = field('refresh');
  const ip = field('ip rating', 'protection', 'ingress');
  const powerMax = field('max.? power', 'maximum power', 'peak power', 'power consumption');
  const powerAvg = field('avg.? power', 'average power', 'typical power');
  const scan = field('scan');
  const led = field('led type', 'led configuration', 'lamp');
  const environment = field('^environment', 'application');
  const service = field('maintenance', 'serviceability');

  const records = [];
  models.forEach((model, i) => {
    const cabinet = dimsMm(sizes[i]);
    const pitch = num(pitches[i]);
    if (!cabinet || !pitch) return;

    const published = resolution(pixels[i]);
    const ipText = ip[i] || null;
    const ipNumber = minIpRating(ipText);
    const maxW = num(powerMax[i]);
    const avgW = num(powerAvg[i]);

    const record = {
      id: slug('unilumin', model, `${cabinet.width}x${cabinet.height}`),
      brand,
      series,
      model,
      pixelPitch: pitch,
      cabinet,
      resolution: published ?? deriveResolution(cabinet, pitch),
      // Most Unilumin pages publish the panel resolution; a few give only
      // pixel density, and those are derived and flagged like GLOSHINE's.
      ...(published ? {} : { derivedResolution: true }),
      weightKg: round(num(weights[i])),
      power: maxW ? { max: maxW, avg: avgW ?? maxW } : null,
      brightnessNits: num(brightness[i]),
      refreshHz: num(refresh[i]),
      ipRating: ipText,
      scanRate: scan[i] || null,
      ledConfig: led[i] || null,
      serviceability: service[i] || null,
      // Unilumin states indoor/outdoor outright on most panels; where it does
      // not, fall back to the weakest IP rating, as the other sources do.
      environment:
        (environment[i] && /outdoor/i.test(environment[i])) || (ipNumber ?? 0) >= 54
          ? 'outdoor'
          : 'indoor',
      sourceUrl,
    };
    if (looksLikeCabinet(model, record)) records.push(record);
  });
  return records;
}

/** Series name from the page, falling back to the slug when the <h1> is a sentence. */
function seriesName(title, path) {
  const fromTitle = asciiRomanNumerals(String(title ?? ''))
    .split(/[–—|:]/)[0]
    .trim();
  if (fromTitle && fromTitle.split(/\s+/).length <= 4 && !/unilumin$/i.test(fromTitle)) {
    return fromTitle;
  }
  return path
    .replace(/\.html$|\/$/, '')
    .split('/')
    .pop()
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function scrape({ log = console.log } = {}) {
  const browser = await openBrowser({ log });
  const cabinets = [];
  const transportFailures = [];
  const shapeFailures = [];

  try {
    await browser.visit(INDEX, { ready: 'a[href*="/products/"]', requireReady: true, attempts: 6 });
    const urls = [
      ...new Set(
        (await browser.page.$$eval('a[href]', (as) => as.map((a) => a.href)))
          .filter((href) => href.startsWith(`${BASE}/products/`))
          .map((href) => href.split('#')[0].split('?')[0])
          .filter((href) => !SKIP.test(href))
      ),
    ].sort();
    // See the note in the INFiLED source: an empty index is a broken page,
    // not an empty catalogue.
    if (!urls.length) throw new Error(`no product links on ${INDEX} — the menu did not render`);
    log(`[Unilumin] ${urls.length} product pages`);

    for (const url of urls) {
      let page;
      try {
        page = await browser.visit(url, { ready: 'table' });
      } catch (err) {
        if (!(err instanceof TransportError)) throw err;
        log(`[Unilumin] unreachable ${url}: ${err.message}`);
        transportFailures.push(url);
        await sleep(1500);
        continue;
      }

      const tables = await page.$$eval('table', (ts) =>
        ts.map((t) =>
          [...t.querySelectorAll('tr')].map((r) =>
            [...r.querySelectorAll('th,td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim())
          )
        )
      );
      const series = seriesName(await page.title(), new URL(url).pathname);
      const found = tables.flatMap((rows) => parseSpecTable(rows, { series, sourceUrl: url }));

      if (!found.length) {
        // The page loaded and held no spec table we recognise. That is the
        // site moving, not the network, so it is reported separately.
        log(`[Unilumin] no specs on ${url} (${tables.length} tables)`);
        shapeFailures.push(url);
        continue;
      }
      log(`[Unilumin] ${series}: ${found.length}`);
      cabinets.push(...found);
      // Unilumin's edge starts answering 502 to a crawl that does not pause.
      await sleep(1500);
    }
  } finally {
    await browser.close();
  }

  log(`[Unilumin] ${cabinets.length} cabinets`);
  return { cabinets, transportFailures, shapeFailures };
}
