/**
 * INFiLED — https://www.infiled.com
 *
 * Specs live on a series page in a panel that JavaScript builds after load, so
 * this source drives a browser (see `../browser.mjs`). The site also puts a
 * SiteGround interstitial in front of a first visit; an ordinary browser sits
 * through it and is let past, which is all `visit()` does — it waits.
 *
 * `robots.txt` (read 2026-09-22) is Yoast's default, `Disallow:` with nothing
 * after it, so nothing here is off limits.
 *
 * The panel is laid out like ROE's: one column of labels, then one slide per
 * model whose values come back in the same order. INFiLED writes numbers in
 * both conventions on the same row — "5,95mm" next to "14.400 pixels/m2" —
 * which is what `localeNum` is for.
 */
import {
  dimsMm,
  localeNum,
  looksLikeCabinet,
  minIpRating,
  resolution,
  round,
  slug,
  sleep,
} from '../util.mjs';
import { openBrowser, TransportError } from '../browser.mjs';

const BASE = 'https://www.infiled.com';
// The site menu lists every series on every page, so the home page enumerates
// the catalogue and there is no paginated index to walk.
const INDEX = `${BASE}/`;

export const brand = 'INFiLED';

const LABELS = '.column-labels .product-grid-line';
const SLIDES = '.carousel-products-swiper .swiper-slide';

const pick = (spec, ...keys) => {
  for (const key of keys) {
    const hit = Object.keys(spec).find((k) => k.includes(key));
    if (hit && spec[hit]) return spec[hit];
  }
  return null;
};

/**
 * Turn one series page's `{ labels, products }` into cabinet records.
 *
 * Exported so the parsing can be tested against a captured page rather than
 * the live site, which is the part that breaks when INFiLED redraws a page.
 */
export function parseSpecGrid({ labels, products }, { series, sourceUrl }) {
  if (!labels?.length || !products?.length) return [];

  const records = [];
  const seen = new Set();
  for (const { model, values } of products) {
    // Swiper clones slides to loop the carousel; the clones carry the same
    // model name and would otherwise ship twice.
    if (!model || seen.has(model)) continue;
    seen.add(model);

    const spec = {};
    labels.forEach((label, i) => {
      if (label && values[i]) spec[label.toLowerCase()] = values[i];
    });

    const cabinet = dimsMm(pick(spec, 'cabinet dimension', 'panel dimension', 'cabinet size'));
    const pitch = localeNum(pick(spec, 'pixel pitch'));
    if (!cabinet || !pitch) continue;

    const ipText = pick(spec, 'ip rating', 'protection');
    const inOut = pick(spec, 'in / out', 'in/out', 'environment');
    const maxW = localeNum(pick(spec, 'max power', 'maximum power'));
    const avgW = localeNum(pick(spec, 'avg power', 'average power'));

    const record = {
      id: slug('infiled', model),
      brand,
      series,
      model,
      pixelPitch: pitch,
      cabinet,
      resolution: resolution(pick(spec, 'cabinet resolution', 'panel resolution')),
      // Weight comes both ways on the same site — "20.4kg" on one series and
      // "8,09kg" on the next — and the ordinary parser reads the second as 809.
      weightKg: round(localeNum(pick(spec, 'cabinet weight', 'panel weight', 'weight'))),
      power: maxW ? { max: maxW, avg: avgW ?? maxW } : null,
      brightnessNits: localeNum(pick(spec, 'brightness')),
      refreshHz: localeNum(pick(spec, 'refresh')),
      ipRating: ipText,
      scanRate: pick(spec, 'scan rate', 'scan'),
      ledConfig: pick(spec, 'led arrangement', 'led type'),
      // INFiLED states indoor/outdoor per panel; the IP rating is the fallback
      // and, as elsewhere, the weakest rating quoted is the one that decides.
      environment:
        (inOut && /out/i.test(inOut)) || (minIpRating(ipText) ?? 0) >= 54 ? 'outdoor' : 'indoor',
      sourceUrl,
    };
    if (looksLikeCabinet(model, record)) records.push(record);
  }
  return records;
}

/** "AMT Series - Infiled" -> "AMT Series" */
function seriesName(title, path) {
  const fromTitle = String(title ?? '').split(/\s[-–—|]\s/)[0].trim();
  if (fromTitle && !/infiled/i.test(fromTitle)) return fromTitle;
  // Series slugs are SEO sentences ("led-screen-hire-for-events-amt-series"),
  // so the series is the tail, not the whole of it.
  const tail = path.replace(/\/$/, '').split('/').pop().split('-').slice(-2).join(' ');
  return tail.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function scrape({ log = console.log } = {}) {
  const browser = await openBrowser({ log });
  const cabinets = [];
  const transportFailures = [];
  const shapeFailures = [];

  try {
    await browser.visit(INDEX, { ready: 'a[href*="/series/"]', requireReady: true, attempts: 6 });
    const urls = [
      ...new Set(
        (await browser.page.$$eval('a[href]', (as) => as.map((a) => a.href)))
          .filter((href) => href.startsWith(`${BASE}/series/`))
          .map((href) => href.split('#')[0].split('?')[0])
      ),
    ].sort();
    // An index that yields nothing is not an empty catalogue; it is the page
    // failing to render, and shipping zero cabinets quietly would be the worst
    // outcome here.
    if (!urls.length) throw new Error(`no series links on ${INDEX} — the menu did not render`);
    log(`[INFiLED] ${urls.length} series pages`);

    for (const url of urls) {
      let page;
      try {
        page = await browser.visit(url, { ready: LABELS });
      } catch (err) {
        if (!(err instanceof TransportError)) throw err;
        log(`[INFiLED] unreachable ${url}: ${err.message}`);
        transportFailures.push(url);
        continue;
      }

      const grid = await page.evaluate(
        ([labelSel, slideSel]) => ({
          labels: [...document.querySelectorAll(labelSel)].map((n) =>
            n.innerText.replace(/\s+/g, ' ').trim()
          ),
          products: [...document.querySelectorAll(slideSel)].map((slide) => ({
            model: slide.querySelector('.product-name')?.innerText.replace(/\s+/g, ' ').trim() ?? '',
            values: [...slide.querySelectorAll('.column-products .product-grid-line')].map((n) =>
              n.innerText.replace(/\s+/g, ' ').trim()
            ),
          })),
        }),
        [LABELS, SLIDES]
      );

      const series = seriesName(await page.title(), new URL(url).pathname);
      const found = parseSpecGrid(grid, { series, sourceUrl: url });

      if (!found.length) {
        // Loaded, and the spec panel was not in the shape this parser knows.
        log(
          `[INFiLED] no specs on ${url} (${grid.labels.length} labels, ${grid.products.length} slides)`
        );
        shapeFailures.push(url);
        continue;
      }
      log(`[INFiLED] ${series}: ${found.length}`);
      cabinets.push(...found);
      await sleep(500);
    }
  } finally {
    await browser.close();
  }

  log(`[INFiLED] ${cabinets.length} cabinets`);
  return { cabinets, transportFailures, shapeFailures };
}
