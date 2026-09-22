#!/usr/bin/env node
/**
 * Builds `data/cabinets.json` — the LED cabinet library shipped with the app.
 *
 *   node scripts/scraper/index.mjs                       # every source
 *   node scripts/scraper/index.mjs --source roevisual    # one source, others kept
 *
 * Each source module exports `brand` and `scrape()`. Records are normalised,
 * de-duplicated and sorted here so the app can consume one flat array.
 *
 * A source returns either an array of records or, where it can tell the two
 * apart, `{ cabinets, transportFailures, shapeFailures }`. That distinction is
 * what `auditRun` below rests on: a page that never arrived leaves the library
 * short, and a page that arrived without its spec table means the parser no
 * longer matches the site. The first is worth a retry, the second is a bug.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as roevisual from './sources/roevisual.mjs';
import * as gloshine from './sources/gloshine.mjs';
import * as absen from './sources/absen.mjs';
import * as unilumin from './sources/unilumin.mjs';
import * as infiled from './sources/infiled.mjs';

const SOURCES = { roevisual, gloshine, absen, unilumin, infiled };
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/cabinets.json');

/** Classify a cabinet so the library can be filtered by use case. */
function category(c) {
  const haystack = `${c.series} ${c.model}`.toLowerCase();
  if (/floor|interactive/.test(haystack)) return 'floor';
  if (/transparent|vanish|mesh|strip/.test(haystack)) return 'transparent';
  if (c.environment === 'outdoor') return 'outdoor';
  if (c.pixelPitch <= 1.6) return 'fine-pitch';
  return 'rental';
}

/**
 * Figures a scrape could plausibly have misread, rather than unusual panels.
 *
 * Every published spec is a string in somebody's local convention, and a
 * misread separator moves a figure by a factor of ten or a hundred rather than
 * a little — "8,09kg" read as 809kg, which is how this check earned its place.
 * Cabinets run roughly 10 to 80 kg/m² and 200 to 1500 W/m² at full white, and
 * are quoted between a few hundred and around ten thousand nits; the bounds
 * here sit well outside all of that, so only a parse bug trips them.
 *
 * The record is kept and the suspect field dropped, because the rest of the
 * spec is still good and the app already says "partial" where a total cannot
 * be completed. Each drop is logged, so a run that starts losing a field says
 * so rather than quietly shipping a lighter library.
 */
export function implausible(record, areaM2) {
  const bad = [];
  const perM2 = (v) => (v == null || !areaM2 ? null : v / areaM2);
  const weight = perM2(record.weightKg);
  if (weight != null && (weight < 3 || weight > 200)) bad.push('weightKg');
  const power = perM2(record.power?.max);
  if (power != null && (power < 20 || power > 4000)) bad.push('power');
  const nits = record.brightnessNits;
  if (nits != null && (nits < 100 || nits > 15000)) bad.push('brightnessNits');
  return bad;
}

function normalise(record, log = () => {}) {
  const { width, height } = record.cabinet;
  const areaM2 = (width / 1000) * (height / 1000);
  const suspect = implausible(record, areaM2);
  if (suspect.length) {
    log(`  dropped ${suspect.join(' and ')} on ${record.id}: outside anything a cabinet does`);
  }
  const c = suspect.reduce((acc, field) => ({ ...acc, [field]: null }), record);
  const res = c.resolution;
  return {
    ...c,
    aspect: Number((width / height).toFixed(4)),
    areaM2: Number(areaM2.toFixed(4)),
    pixelsPerCabinet: res ? res.w * res.h : null,
    weightPerM2: c.weightKg ? Number((c.weightKg / areaM2).toFixed(1)) : null,
    powerPerM2: c.power?.max ? Number((c.power.max / areaM2).toFixed(0)) : null,
    category: category(c),
  };
}

/** Drop records the app cannot lay out, and obviously bad geometry. */
function isValid(c) {
  const { width, height } = c.cabinet ?? {};
  const sane =
    c.model &&
    c.pixelPitch > 0.3 &&
    c.pixelPitch < 60 &&
    width >= 50 &&
    width <= 3000 &&
    height >= 50 &&
    height <= 3000 &&
    c.resolution?.w > 0 &&
    c.resolution?.h > 0;
  if (!sane) return false;

  // Size, resolution and pitch have to agree, or the pixel map would be wrong.
  // Corner/right-angle panels fold pixels round two faces and never will.
  const off = (mm, px) => Math.abs(mm / px - c.pixelPitch) / c.pixelPitch;
  return off(width, c.resolution.w) <= 0.08 && off(height, c.resolution.h) <= 0.08;
}

export const countByBrand = (cabinets) =>
  cabinets.reduce((acc, c) => ({ ...acc, [c.brand]: (acc[c.brand] ?? 0) + 1 }), {});

/**
 * Decide whether a run is fit to overwrite the shipped library.
 *
 * Scraped specs go stale and vendor sites get rebuilt, so the question a later
 * run has to answer is which of those just happened. The signals are kept
 * apart deliberately:
 *
 *   a page that never loaded          the run is short, not wrong — retry
 *   a page that loaded with no specs  the parser no longer fits the site
 *   a brand that collapsed            either of the above, at scale
 *
 * A spec that merely changed — a new pitch, a heavier panel — moves none of
 * these counters and lands in the diff instead, which is where a person should
 * read it. Anything returned here is a reason not to write the file.
 */
export function auditRun({ results, previous = {}, tolerance = 0.25 }) {
  const problems = [];
  for (const r of results) {
    const before = previous[r.brand];
    if (r.fatal) {
      problems.push(`${r.brand}: the source did not run — ${r.fatal}`);
      continue;
    }
    if (r.pagesVisited && !r.cabinets) {
      problems.push(
        `${r.brand}: visited ${r.pagesVisited} pages and parsed no cabinets at all — the parser no longer matches the site.`
      );
      continue;
    }
    if (r.shapeFailures && r.shapeFailures >= Math.ceil(r.pagesVisited / 2)) {
      problems.push(
        `${r.brand}: ${r.shapeFailures} of ${r.pagesVisited} pages loaded without a spec table — the page layout has moved.`
      );
    }
    if (before && r.cabinets < before * (1 - tolerance)) {
      const drop = Math.round((1 - r.cabinets / before) * 100);
      problems.push(
        `${r.brand}: ${r.cabinets} cabinets, down ${drop}% from ${before}. ` +
          `${r.transportFailures} pages were unreachable and ${r.shapeFailures} had no spec table.`
      );
    }
  }
  return problems;
}

/** Accept both source return shapes, so the older sources need no change. */
function readResult(result) {
  if (Array.isArray(result)) {
    return { cabinets: result, transportFailures: [], shapeFailures: [] };
  }
  return {
    cabinets: result?.cabinets ?? [],
    transportFailures: result?.transportFailures ?? [],
    shapeFailures: result?.shapeFailures ?? [],
  };
}

/** What the shipped library holds now, so a run can be compared against it. */
async function previousLibrary() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return { cabinets: [] };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const only = argv.includes('--source') ? argv[argv.indexOf('--source') + 1] : null;
  const allowShrink = argv.includes('--allow-shrink');
  if (only && !SOURCES[only]) {
    console.error(`Unknown source "${only}". Known: ${Object.keys(SOURCES).join(', ')}`);
    process.exit(2);
  }

  const before = await previousLibrary();
  const previousCounts = countByBrand(before.cabinets ?? []);

  const all = [];
  const results = [];
  for (const [name, mod] of Object.entries(SOURCES)) {
    if (only && only !== name) continue;
    try {
      const { cabinets, transportFailures, shapeFailures } = readResult(
        await mod.scrape({ log: console.log })
      );
      all.push(...cabinets);
      results.push({
        name,
        brand: mod.brand,
        cabinets: cabinets.length,
        transportFailures: transportFailures.length,
        shapeFailures: shapeFailures.length,
        pagesVisited: cabinets.length + transportFailures.length + shapeFailures.length,
      });
    } catch (err) {
      console.error(`[${name}] failed: ${err.message}`);
      results.push({
        name,
        brand: mod.brand,
        cabinets: 0,
        transportFailures: 0,
        shapeFailures: 0,
        pagesVisited: 0,
        fatal: err.message,
      });
    }
  }

  // Scraping one source keeps the others, so `--source` tops a brand up rather
  // than truncating the library to whatever was asked for. A source that came
  // back with nothing does not count as having replaced its brand, or a failed
  // run would delete the records it failed to refresh.
  const replaced = new Set(results.filter((r) => r.cabinets).map((r) => r.brand));
  const kept = only ? (before.cabinets ?? []).filter((c) => !replaced.has(c.brand)) : [];

  const byId = new Map();
  for (const record of all) {
    if (!isValid(record)) continue;
    // Later sources never clobber an earlier, richer record.
    if (!byId.has(record.id)) byId.set(record.id, normalise(record, console.log));
  }
  for (const record of kept) if (!byId.has(record.id)) byId.set(record.id, record);

  const cabinets = [...byId.values()].sort(
    (a, b) =>
      a.brand.localeCompare(b.brand) ||
      a.series.localeCompare(b.series) ||
      a.pixelPitch - b.pixelPitch ||
      a.model.localeCompare(b.model)
  );

  console.log('\nRun summary');
  for (const r of results) {
    const was = previousCounts[r.brand];
    console.log(
      `  ${r.brand}: ${r.cabinets} cabinets${was == null ? '' : ` (was ${was})`}` +
        (r.fatal ? `, FAILED: ${r.fatal}` : '') +
        (r.transportFailures ? `, ${r.transportFailures} pages unreachable` : '') +
        (r.shapeFailures ? `, ${r.shapeFailures} pages with no spec table` : '')
    );
  }

  const problems = auditRun({ results, previous: previousCounts });
  if (problems.length) {
    console.error('\nThis run is not fit to ship:');
    for (const p of problems) console.error(`  - ${p}`);
    if (!allowShrink) {
      console.error(
        `\n${OUT} left as it was. Fix the source, or re-run with --allow-shrink ` +
          'if the catalogue really did get smaller.'
      );
      process.exit(1);
    }
    console.error('\n--allow-shrink given, writing anyway.');
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    `${JSON.stringify(
      { generatedAt: new Date().toISOString(), count: cabinets.length, cabinets },
      null,
      2
    )}\n`
  );

  const brands = [...new Set(cabinets.map((c) => c.brand))];
  console.log(`\nWrote ${cabinets.length} cabinets from ${brands.length} brands -> ${OUT}`);
  for (const brand of brands) {
    console.log(`  ${brand}: ${cabinets.filter((c) => c.brand === brand).length}`);
  }
}

// Importing this module for its pure helpers must not start a scrape.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
