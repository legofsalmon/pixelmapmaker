/**
 * GLOSHINE — https://gloshine.com
 *
 * Product pages carry a transposed spec table: the first cell of each row is
 * the label and every following cell is one model in the series. Panel
 * resolution is not published, so it is derived from panel size / pitch.
 */
import { fetchText, text, num, dimsMm, slug, sleep, round, deriveResolution, minIpRating, looksLikeCabinet } from '../util.mjs';

const BASE = 'https://gloshine.com';
const INDEX = `${BASE}/products`;

export const brand = 'GLOSHINE';

/** A cabinet is outdoor-rated only if its weakest IP rating is IP54 or better. */
function outdoorFrom(ipText, name) {
  const ip = minIpRating(ipText);
  if (ip != null) return ip >= 54 ? 'outdoor' : 'indoor';
  return /outdoor/i.test(name) ? 'outdoor' : 'indoor';
}

function tableRows(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => text(c[1]).replace(/\n/g, ' ').trim())
  );
}

/** Repeat a single merged value across every model column. */
function spread(values, count) {
  if (values.length >= count) return values.slice(0, count);
  return Array.from({ length: count }, (_, i) => values[i] ?? values[0] ?? '');
}

export async function scrape({ log = console.log } = {}) {
  const index = await fetchText(INDEX);
  const paths = [...new Set([...index.matchAll(/href="(\/products\/[a-z0-9.-]+\.html)"/g)].map((m) => m[1]))];
  log(`[GLOSHINE] ${paths.length} product pages`);

  const cabinets = [];
  for (const path of paths) {
    const url = `${BASE}${path}`;
    let html;
    try {
      html = await fetchText(url);
    } catch (err) {
      log(`[GLOSHINE] skip ${path}: ${err.message}`);
      continue;
    }

    const rows = tableRows(html).filter((r) => r.length > 1);
    const modelRow = rows.find((r) => /model/i.test(r[0]));
    if (!modelRow) continue;
    const models = modelRow.slice(1).filter(Boolean);
    if (!models.length) continue;

    const field = (...keys) => {
      const row = rows.find((r) => keys.some((k) => new RegExp(k, 'i').test(r[0])));
      return row ? spread(row.slice(1).filter(Boolean), models.length) : [];
    };

    const pitches = field('pixel pitch');
    const dims = field('panel dimension', 'cabinet size', 'panel size');
    const weights = field('panel weight', 'weight');
    const refresh = field('refresh');
    const ip = field('ip rating', 'protection');
    const brightness = field('brightness');
    const powerRow = field('power consumption', 'average power', 'max power');
    const scan = field('scan');

    const series = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
    const seriesName = series ? text(series).split('\n')[0] : path.replace(/.*\//, '').replace('.html', '');

    models.forEach((model, i) => {
      const cabinet = dimsMm(dims[i]);
      const pitch = num(pitches[i]);
      if (!cabinet || !pitch) return;
      const ipText = ip[i] ?? '';
      cabinets.push({
        id: slug('gloshine', model),
        brand,
        series: seriesName,
        model,
        pixelPitch: pitch,
        cabinet,
        // Not published by GLOSHINE — derived from panel size / pitch.
        resolution: deriveResolution(cabinet, pitch),
        derivedResolution: true,
        weightKg: round(num(weights[i])),
        power: num(powerRow[i]) ? { max: num(powerRow[i]), avg: round(num(powerRow[i]) / 2) } : null,
        brightnessNits: num(brightness[i]),
        refreshHz: num(refresh[i]),
        ipRating: ipText || null,
        scanRate: scan[i] ?? null,
        environment: outdoorFrom(ipText, `${seriesName} ${model}`),
        sourceUrl: url,
      });
    });
    await sleep(300);
  }

  const kept = cabinets.filter((c) => looksLikeCabinet(c.model, c));
  log(`[GLOSHINE] ${kept.length} cabinets`);
  return kept;
}
