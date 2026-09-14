/**
 * ROE Visual — https://www.roevisual.com
 *
 * Product pages render a server-side spec table: one column of labels and one
 * column of values per product variant, so a single page (e.g. the Carbon
 * series) yields several cabinets.
 */
import { fetchText, text, num, dimsMm, resolution, power, slug, sleep, minIpRating, looksLikeCabinet } from '../util.mjs';

const BASE = 'https://www.roevisual.com';
const INDEX = `${BASE}/en/products`;

const SKIP = /(accessor|processor|processing|frame|sirius|deepsky|ev4|helios|mx-led|sx-40|cabling|transport|panel-locks|hanging|solo|strip|omni-tube|bespoke)/;

function listItems(ulHtml) {
  return [...ulHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]));
}

/** Pull every `key -> value` spec block out of one product page. */
function parseSpecTables(html) {
  const labelBlock = html.match(/<div class="specs-table-labels">([\s\S]*?)<\/div>/);
  if (!labelBlock) return [];
  const labels = listItems(labelBlock[1]);

  // Each variant lives in a `.specs-table-item`; the trailing compare button
  // markup is not part of the value list, so cut the chunk at `v-cloak`.
  const chunks = html.split(/<div class="specs-table-item/).slice(1);
  const seen = new Set();
  const specs = [];
  for (const chunk of chunks) {
    const body = chunk.split('<div v-cloak')[0];
    const values = listItems(body);
    if (values.length < 4) continue;
    const spec = {};
    labels.forEach((label, i) => {
      if (label && values[i]) spec[label.toLowerCase()] = values[i];
    });
    const title = spec.title;
    if (!title || seen.has(title)) continue;
    seen.add(title);
    specs.push(spec);
  }
  return specs;
}

const pick = (spec, ...keys) => {
  for (const key of keys) {
    const hit = Object.keys(spec).find((k) => k.includes(key));
    if (hit) return spec[hit];
  }
  return null;
};

export const brand = 'ROE Visual';

export async function scrape({ log = console.log } = {}) {
  const index = await fetchText(INDEX);
  const paths = [
    ...new Set(
      [...index.matchAll(/href="(?:https:\/\/www\.roevisual\.com)?(\/en\/products\/[a-z0-9-]+)"/g)]
        .map((m) => m[1])
        .filter((p) => !SKIP.test(p))
    ),
  ];
  log(`[ROE Visual] ${paths.length} product pages`);

  const cabinets = [];
  for (const path of paths) {
    const url = `${BASE}${path}`;
    let html;
    try {
      html = await fetchText(url);
    } catch (err) {
      log(`[ROE Visual] skip ${path}: ${err.message}`);
      continue;
    }
    // Some pages use a marketing sentence as the <h1>; fall back to the slug.
    const heading = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
    const headingText = heading ? text(heading).split('\n')[0] : '';
    const series =
      headingText && headingText.split(/\s+/).length <= 4
        ? headingText
        : path
            .split('/')
            .pop()
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());

    for (const spec of parseSpecTables(html)) {
      const model = pick(spec, 'title');
      if (!model) continue;
      const cabinet = dimsMm(pick(spec, 'panel dimension', 'cabinet dimension', 'dimension'));
      const res = resolution(pick(spec, 'resolution'));
      const pitch = num(pick(spec, 'pixel pitch'));
      const record = {
        id: slug('roe', model),
        brand,
        series,
        model,
        pixelPitch: pitch,
        cabinet: cabinet ?? {},
        resolution: res,
        weightKg: num(pick(spec, 'weight')),
        power: power(pick(spec, 'power consumption')),
        brightnessNits: num(pick(spec, 'brightness')),
        refreshHz: num(pick(spec, 'refresh')),
        ipRating: pick(spec, 'ip rating'),
        ledConfig: pick(spec, 'led configuration'),
        serviceability: pick(spec, 'serviceability'),
        maxHanging: num(pick(spec, 'max. hanging')),
        maxStacking: num(pick(spec, 'max. stacking')),
        environment: (minIpRating(pick(spec, 'ip rating')) ?? 0) >= 54 ? 'outdoor' : 'indoor',
        sourceUrl: url,
      };
      if (looksLikeCabinet(model, record)) cabinets.push(record);
    }
    await sleep(300);
  }
  log(`[ROE Visual] ${cabinets.length} cabinets`);
  return cabinets;
}
