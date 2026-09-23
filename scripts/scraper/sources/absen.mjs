/**
 * Absen — https://www.usabsen.com
 *
 * absen.com sits behind bot protection, but Absen's US site is reachable and
 * links a "Spec Sheet" PDF from every product page. Those PDFs carry one page
 * per panel variant with a consistent `Label  Value` layout, which is a better
 * source than the product pages themselves (those render specs client-side).
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fetchText, num, dimsMm, resolution, slug, sleep, round, minIpRating, looksLikeCabinet } from '../util.mjs';

const BASE = 'https://www.usabsen.com';
const SITEMAP = `${BASE}/product-sitemap.xml`;

export const brand = 'Absen';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchPdf(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Join one row's text items, putting a space in only where the PDF left a gap.
 *
 * These sheets break a number across several text items — 5000 arrives as
 * "50" then "00", and on one page as "5", "0", "00" — with the runs sitting
 * flush against each other. Joining every item with a space turned a 5000 nit
 * outdoor panel into a 50 nit one, because `num()` takes the first number it
 * finds. The label and its value are already separated by a wide whitespace
 * item, so the gap between runs is what tells a split number from two numbers.
 *
 * The test is whether the runs are flush, not whether the gap looks like a
 * space: a split number measures 0.000 of the font size, the narrowest real
 * gap in these sheets measures 0.094 (the one in "SA1.9-C (Brompton/NovaStar)"),
 * and every actual space between label and value is its own whitespace item
 * anyway. A twentieth of the font size sits between those two with room either
 * side. Overlapping runs — a negative gap, which the wide leader items
 * produce — are flush by the same test.
 */
const FLUSH = 0.05;

export function joinRow(items) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let out = '';
  let end = null;
  for (const item of sorted) {
    if (end != null && item.x - end > item.size * FLUSH) out += ' ';
    out += item.str;
    end = item.x + item.width;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Text of one PDF page, reassembled into visual lines. */
async function pageLines(page) {
  const content = await page.getTextContent();
  const rows = new Map();
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const y = Math.round(item.transform[5]);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({
      x: item.transform[4],
      width: item.width ?? 0,
      size: Math.abs(item.transform[3]) || item.height || 10,
      str: item.str,
    });
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, items]) => joinRow(items))
    .filter(Boolean);
}

/** Value that follows a label on its line, e.g. "Pixel Pitch (mm) 3.9" -> "3.9". */
function labelled(lines, label) {
  const line = lines.find((l) => l.startsWith(label));
  return line ? line.slice(label.length).trim() : null;
}

const SPEC_LABELS = {
  pitch: 'Pixel Pitch (mm)',
  dims: 'Panel Dimensions (WxHxD)',
  pixels: 'Pixel Per Panel',
  weight: 'Panel Weight (kg',
  brightness: 'Brightness (nit)',
  refresh: 'Refresh Rate (Hz)',
  ip: 'IP Rating',
  power: 'Power Consumption',
  led: 'LED Type',
  scan: 'Driving Type',
};

function parsePage(lines, series, sourceUrl) {
  // "PL3.9 Pro V3 - Specifications" / "PL3.9 Pro V3- Specifications"
  const heading = lines.find((l) => /-\s*Specifications\s*$/i.test(l));
  if (!heading) return null;
  // Corner panels wrap pixels around two faces; they cannot tile as a flat grid.
  if (lines.some((l) => /corner panel/i.test(l))) return null;

  const model = heading.replace(/\s*-\s*Specifications\s*$/i, '').trim();
  if (!model) return null;

  const get = (key) => labelled(lines, SPEC_LABELS[key]);
  const pitch = num(get('pitch'));
  const cabinet = dimsMm(get('dims'));
  const res = resolution(get('pixels'));
  if (!pitch || !cabinet || !res) return null;

  // Absen quotes power and heat per square metre, not per panel.
  const areaM2 = (cabinet.width / 1000) * (cabinet.height / 1000);
  const powerText = get('power');
  const perM2 = powerText ? powerText.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/) : null;
  const power = perM2
    ? { max: Math.round(Number(perM2[1]) * areaM2), avg: Math.round(Number(perM2[2]) * areaM2) }
    : null;

  // "IP Rating (Front/Rear) IP65/IP54" -> "IP65/IP54"
  const ip = get('ip')?.replace(/^\([^)]*\)\s*/, '') ?? null;
  return {
    id: slug('absen', model, `${cabinet.width}x${cabinet.height}`),
    brand,
    series,
    model,
    pixelPitch: pitch,
    cabinet,
    resolution: res,
    weightKg: round(num(get('weight'))),
    power,
    brightnessNits: num(get('brightness')),
    refreshHz: num(get('refresh')),
    ipRating: ip,
    scanRate: get('scan'),
    ledConfig: get('led'),
    environment: (minIpRating(ip) ?? 0) >= 54 ? 'outdoor' : 'indoor',
    sourceUrl,
  };
}

/** Absen reuses one model name for full and half-height panels; keep both readable. */
function disambiguate(records) {
  const counts = new Map();
  for (const r of records) counts.set(r.model, (counts.get(r.model) ?? 0) + 1);
  return records.map((r) =>
    counts.get(r.model) > 1
      ? { ...r, model: `${r.model} (${r.cabinet.width}×${r.cabinet.height})` }
      : r
  );
}

export async function scrape({ log = console.log } = {}) {
  const sitemap = await fetchText(SITEMAP);
  const pages = [...sitemap.matchAll(/<loc>([^<]*\/product\/[^<]+)<\/loc>/g)].map((m) => m[1]);
  log(`[Absen] ${pages.length} product pages`);

  const cabinets = [];
  for (const productUrl of pages) {
    let html;
    try {
      html = await fetchText(productUrl);
    } catch (err) {
      log(`[Absen] skip ${productUrl}: ${err.message}`);
      continue;
    }

    // Prefer the specification sheet; fall back to the marketing cutsheet.
    const pdfs = [...html.matchAll(/href="([^"]*\.pdf)"/gi)].map((m) => m[1]);
    const specPdf =
      pdfs.find((p) => /specification/i.test(p)) ?? pdfs.find((p) => /cutsheet/i.test(p));
    if (!specPdf) continue;
    const pdfUrl = specPdf.startsWith('http') ? specPdf : `${BASE}${specPdf}`;

    const series = productUrl
      .replace(/\/$/, '')
      .split('/')
      .pop()
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    let found = [];
    try {
      const task = getDocument({ data: await fetchPdf(pdfUrl), useSystemFonts: true });
      const pdf = await task.promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const record = parsePage(await pageLines(await pdf.getPage(i)), series, productUrl);
        if (record) found.push(record);
      }
      await task.destroy();
    } catch (err) {
      log(`[Absen] ${series}: ${err.message}`);
      continue;
    }

    found = disambiguate(found).filter((r) => looksLikeCabinet(r.model, r));
    if (found.length) log(`[Absen] ${series}: ${found.length}`);
    cabinets.push(...found);
    await sleep(400);
  }

  log(`[Absen] ${cabinets.length} cabinets`);
  return cabinets;
}
