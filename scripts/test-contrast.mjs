/**
 * Ambient contrast maths, checked against the worked example it reproduces and
 * against the shipped cabinet library.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-contrast.mjs
 */
import { register } from 'node:module';
import { readFile } from 'node:fs/promises';

register('./loader.mjs', import.meta.url);

const {
  AMBIENT_PRESETS,
  DEFAULT_AMBIENT,
  PLAUSIBLE_NITS,
  contrastForLayer,
  contrastForProject,
  isPlausibleBrightness,
  luxForContrast,
  nitsForContrast,
  reflectedNits,
} = await import('../src/lib/contrast.ts');

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

const near = (name, actual, expected, tolerance) =>
  check(name, Math.abs(actual - expected) <= tolerance, `(got ${actual}, wanted ${expected} ±${tolerance})`);

function layer(overrides = {}) {
  const { spec: specOverrides = {}, ...rest } = overrides;
  return {
    id: 'test-layer',
    name: 'Test screen',
    cols: 8,
    rows: 4,
    spec: {
      pixelPitch: 2.6,
      cabinet: { width: 500, height: 500, depth: 80 },
      resolution: { w: 192, h: 192 },
      brightnessNits: 1500,
      ...specOverrides,
    },
    ...rest,
  };
}

console.log('\nReflected light');
{
  // Lambertian: lux x reflectance / pi.
  near('500 lux at 5% gives 7.96 nits', reflectedNits(500, 0.05), 7.9577, 0.001);
  near('20,000 lux at 5% gives 318 nits', reflectedNits(20_000, 0.05), 318.31, 0.01);
  near('it scales with the light', reflectedNits(1000, 0.05), 2 * reflectedNits(500, 0.05), 1e-9);
  near('and with the reflectance', reflectedNits(500, 0.1), 2 * reflectedNits(500, 0.05), 1e-9);
  check('no light means no floor', reflectedNits(0, 0.05) === 0);
  check('a perfectly black face reflects nothing', reflectedNits(500, 0) === 0);
}

console.log('\nThe example the module documents');
{
  // The doc comment on contrast.ts claims 20,000 lux on a 5% face leaves a
  // 5000 nit panel at 16.7:1. If that ever stops being true the comment is
  // lying to the next reader.
  const floor = reflectedNits(20_000, 0.05);
  near('the floor is 318 nits', floor, 318.31, 0.01);
  near('and a 5000 nit panel runs 16.7:1', (5000 + floor) / floor, 16.708, 0.001);
  check('which is nothing like the thousands on the datasheet', (5000 + floor) / floor < 20);
}

console.log('\nWhat it takes to hold a ratio');
{
  const floor = reflectedNits(500, 0.05);
  near('15:1 over a 7.96 nit floor needs 111 nits', nitsForContrast(15, floor), 111.4, 0.1);
  near('the answer round-trips', (nitsForContrast(15, floor) + floor) / floor, 15, 1e-9);
  check('1:1 needs nothing, because the floor is already that', nitsForContrast(1, floor) === 0);
  check('a ratio below 1 is not a debt', nitsForContrast(0.5, floor) === 0);

  near('a 5000 nit panel holds 15:1 up to 22,440 lux', luxForContrast(15, 5000, 0.05), 22439.9, 1);
  near('and that round-trips too', reflectedNits(luxForContrast(15, 5000, 0.05), 0.05) * 14, 5000, 1e-6);
  check('a 1:1 target survives any light', luxForContrast(1, 5000, 0.05) === Infinity);
  check('a panel that emits nothing holds nothing', luxForContrast(15, 0, 0.05) === 0);
}

console.log('\nBrightness figures worth believing');
{
  check('600 nits is a panel', isPlausibleBrightness(600));
  check('10,000 nits is a panel', isPlausibleBrightness(10_000));
  check('5 nits is a broken scrape', !isPlausibleBrightness(5));
  check('50 nits is a broken scrape', !isPlausibleBrightness(50));
  check('missing is missing', !isPlausibleBrightness(null) && !isPlausibleBrightness(undefined));
  check('so is a NaN', !isPlausibleBrightness(NaN));
  check('the band sits under the dimmest real panel', PLAUSIBLE_NITS.min < 600);
  check('and over the brightest', PLAUSIBLE_NITS.max > 10_000);
}

console.log('\nA 1500 nit panel in a lit room');
{
  const c = contrastForLayer(layer(), { lux: 500, reflectance: 0.05, targetContrast: 15 });
  near('the room puts an 8 nit floor under the blacks', c.floorNits, 7.9577, 0.001);
  near('so the panel runs 189:1', c.contrast, 189.5, 0.1);
  check('which clears a 15:1 target', c.meetsTarget === true);
  check('and nothing is flagged', c.notes.length === 0, JSON.stringify(c.notes));
  check('the published figure is carried through', c.peakNits === 1500);
}

console.log('\nThe same panel in the sun');
{
  const c = contrastForLayer(layer(), { lux: 50_000, reflectance: 0.05, targetContrast: 15 });
  near('the floor climbs to 796 nits', c.floorNits, 795.77, 0.01);
  near('and the contrast falls to 2.9:1', c.contrast, 2.885, 0.001);
  check('which misses the target', c.meetsTarget === false);
  check(
    'the note names the brightness that would hold it',
    c.notes.some((n) => n.includes('11,141 nits')),
    JSON.stringify(c.notes)
  );
  check(
    'and says where it gave up',
    c.notes.some((n) => n.includes('lux. Past that')),
    JSON.stringify(c.notes)
  );
}

console.log('\nWhen the panel data cannot be used');
{
  const missing = contrastForLayer(layer({ spec: { brightnessNits: null } }), DEFAULT_AMBIENT);
  check('no published brightness means no contrast, not a zero', missing.contrast === null);
  check('and no verdict either', missing.meetsTarget === null);
  check('the floor is still a fact worth having', missing.floorNits > 0);
  check(
    'and it says the figure is missing',
    missing.notes.some((n) => n.includes('publishes no brightness')),
    JSON.stringify(missing.notes)
  );

  // The exact corruption the shipped library carried for six Absen panels.
  const broken = contrastForLayer(layer({ spec: { brightnessNits: 5 } }), DEFAULT_AMBIENT);
  check('5 nits is refused rather than used', broken.contrast === null);
  check('the number is kept so the warning can quote it', broken.implausibleNits === 5);
  check(
    'and the warning says what it really is',
    broken.notes.some((n) => n.includes('lost its zeros')),
    JSON.stringify(broken.notes)
  );
}

console.log('\nThe presets');
{
  check('every preset carries a label, a level and a note', AMBIENT_PRESETS.every((p) => p.label && p.lux > 0 && p.note));
  // The picker matches on the level, so a shared one hides a preset.
  check(
    'no two presets share a level',
    new Set(AMBIENT_PRESETS.map((p) => p.lux)).size === AMBIENT_PRESETS.length,
    JSON.stringify(AMBIENT_PRESETS.map((p) => p.lux))
  );
  check(
    'and they run dark to bright',
    AMBIENT_PRESETS.every((p, i) => i === 0 || p.lux > AMBIENT_PRESETS[i - 1].lux)
  );
  const office = AMBIENT_PRESETS.find((p) => /office/i.test(p.label));
  check('the office preset is EN 12464-1 task lighting at 500 lux', office?.lux === 500);
  check('the default ambient is one a project can start from', DEFAULT_AMBIENT.lux > 0 && DEFAULT_AMBIENT.reflectance > 0);
  check('and the default target is above 1:1', DEFAULT_AMBIENT.targetContrast > 1);
}

console.log('\nA whole project');
{
  const results = contrastForProject(
    [layer({ id: 'imag', name: 'IMAG', spec: { brightnessNits: 5000 } }), layer({ id: 'lobby', name: 'Lobby' })],
    { lux: 15_000, reflectance: 0.05, targetContrast: 15 }
  );
  check('both screens are read against the same light', results[0].floorNits === results[1].floorNits);
  check('the outdoor panel clears it', results[0].meetsTarget === true);
  check('the indoor one does not', results[1].meetsTarget === false);
}

console.log('\nThe shipped cabinet library');
{
  const data = JSON.parse(await readFile(new URL('../data/cabinets.json', import.meta.url), 'utf8'));
  const cabinets = data.cabinets ?? data;
  const published = cabinets.filter((c) => c.brightnessNits != null);
  const bad = published.filter((c) => !isPlausibleBrightness(c.brightnessNits));

  check('the library still has cabinets in it', cabinets.length > 200, String(cabinets.length));
  check('most of them publish a brightness', published.length > cabinets.length / 2, `${published.length}/${cabinets.length}`);
  check(
    'and not one of them is a number that lost its zeros',
    bad.length === 0,
    JSON.stringify(bad.map((c) => `${c.brand} ${c.model}: ${c.brightnessNits}`))
  );

  // The six that were wrong before the PDF row join was fixed.
  const jp = cabinets.filter((c) => /^JP[58] Pro/.test(c.model));
  check('the Absen JP Pro panels are there', jp.length === 6, String(jp.length));
  check(
    'and every one of them is back at 5000 nits',
    jp.every((c) => c.brightnessNits === 5000),
    JSON.stringify(jp.map((c) => `${c.model}: ${c.brightnessNits}`))
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
