#!/usr/bin/env node
/**
 * Builds `data/cabinets.json` — the LED cabinet library shipped with the app.
 *
 *   node scripts/scraper/index.mjs [--source roevisual]
 *
 * Each source module exports `brand` and `scrape()`. Records are normalised,
 * de-duplicated and sorted here so the app can consume one flat array.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as roevisual from './sources/roevisual.mjs';
import * as gloshine from './sources/gloshine.mjs';
import * as absen from './sources/absen.mjs';

const SOURCES = { roevisual, gloshine, absen };
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

function normalise(c) {
  const { width, height } = c.cabinet;
  const areaM2 = (width / 1000) * (height / 1000);
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

async function main() {
  const only = process.argv.includes('--source')
    ? process.argv[process.argv.indexOf('--source') + 1]
    : null;

  const all = [];
  for (const [name, mod] of Object.entries(SOURCES)) {
    if (only && only !== name) continue;
    try {
      all.push(...(await mod.scrape({ log: console.log })));
    } catch (err) {
      console.error(`[${name}] failed: ${err.message}`);
    }
  }

  const byId = new Map();
  for (const record of all) {
    if (!isValid(record)) continue;
    // Later sources never clobber an earlier, richer record.
    if (!byId.has(record.id)) byId.set(record.id, normalise(record));
  }

  const cabinets = [...byId.values()].sort(
    (a, b) =>
      a.brand.localeCompare(b.brand) ||
      a.series.localeCompare(b.series) ||
      a.pixelPitch - b.pixelPitch ||
      a.model.localeCompare(b.model)
  );

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
