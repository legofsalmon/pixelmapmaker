/**
 * The processor library, and the capacity maths read off it.
 *
 * None of this had a test, which is how an entry can look right and plan
 * wrong. The figures that matter are the ones a port count is derived from,
 * so the check here is against what the manufacturer actually publishes
 * rather than against the app's own arithmetic restated.
 *
 * NovaStar give the formula for the MX30 outright — load × bits × frame rate
 * < 0.95 x 10^9 — along with the table it produces, so that table is the
 * fixture. It also pins the one place the app's model and the manufacturer's
 * part company, which is colour depth; see `signalScale`.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-processors.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const { PROCESSORS, findProcessor, pixelsPerPort, pixelsPerPortAt, signalScale } =
  await import('../src/lib/processors.ts');

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

const n = (v) => v.toLocaleString('en-GB');

console.log('\nThe library holds together');
{
  const ids = PROCESSORS.map((p) => p.id);
  check('every id is its own', new Set(ids).size === ids.length,
    `duplicates: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);

  const named = PROCESSORS.map((p) => `${p.brand} ${p.model}`);
  check('every brand and model pair is its own', new Set(named).size === named.length,
    `duplicates: ${named.filter((x, i) => named.indexOf(x) !== i).join(', ')}`);

  const unsound = PROCESSORS.filter(
    (p) => !(p.ports >= 1 && p.totalPixels > 0 && p.baselineBitDepth > 0 && p.baselineHz > 0)
  );
  check('every entry can be planned from', unsound.length === 0,
    unsound.map((p) => p.id).join(', '));

  const badLimit = PROCESSORS.filter(
    (p) => p.maxCabinetsPerPort !== null && !(p.maxCabinetsPerPort > 0)
  );
  check('a cabinet limit is a real number or openly absent', badLimit.length === 0,
    badLimit.map((p) => p.id).join(', '));
}

console.log('\nFinding one');
{
  check('by id', findProcessor('novastar-mx30').model === 'MX30');
  check('an id nobody has falls back rather than throwing',
    findProcessor('no-such-processor') === PROCESSORS[0]);
  const mine = { ...PROCESSORS[0], id: 'mine', model: 'Mine', custom: true };
  check('your own list is looked at first', findProcessor('mine', [mine]).model === 'Mine');
}

const mx30 = findProcessor('novastar-mx30');

console.log('\nThe MX30 is the MX30, not the VX1000 it resembles');
{
  const vx = findProcessor('novastar-vx1000');
  check('both exist', mx30.id === 'novastar-mx30' && vx.id === 'novastar-vx1000');
  check('ten Gigabit ports and 6.5M pixels is a coincidence they share',
    mx30.ports === vx.ports && mx30.totalPixels === vx.totalPixels);
  check('the VX1000 keeps its published 512 cabinets a port', vx.maxCabinetsPerPort === 512);
  check('the MX30 claims no cabinet limit, because NovaStar publish none',
    mx30.maxCabinetsPerPort === null);
  check('and it carries the spec sheet it was read from',
    typeof mx30.sourceUrl === 'string' && mx30.sourceUrl.includes('MX30'));
}

/*
 * NovaStar's own table, 8-bit column, from the MX30 specification v1.5.0.
 * Both receiving-card families give the same 8-bit figures; they differ only
 * at 10-bit, which is the row below.
 */
const PUBLISHED_8BIT = [
  [24, 1_649_306],
  [25, 1_583_333],
  [30, 1_319_444],
  [50, 791_667],
  [60, 659_722],
  [120, 329_861],
  [144, 274_884],
  [240, 164_931],
];

console.log('\n8-bit: every refresh rate NovaStar publish, and never over-stated');
{
  check(`a port at 8-bit 60 Hz is ${n(pixelsPerPort(mx30))}`, pixelsPerPort(mx30) === 650_000);

  for (const [hz, published] of PUBLISHED_8BIT) {
    const got = pixelsPerPortAt(mx30, 8, hz);
    const ratio = got / published;
    check(
      `${hz} Hz: ${n(got)} against ${n(published)} published`,
      ratio > 0.98 && ratio <= 1,
      `ratio ${ratio.toFixed(4)} — over 1 would mean planning more pixels onto a port than it carries`
    );
  }
}

console.log('\nRefresh rate divides exactly, as the formula says it does');
{
  check('halving the rate doubles the port',
    pixelsPerPortAt(mx30, 8, 30) === pixelsPerPortAt(mx30, 8, 60) * 2);
  check('doubling the rate halves it',
    pixelsPerPortAt(mx30, 8, 120) === pixelsPerPortAt(mx30, 8, 60) / 2);
  check('the baseline is a multiplier of one', signalScale(mx30, 8, 60) === 1);
}

console.log('\n10-bit is the known gap, recorded here so a fix has to come past it');
{
  /*
   * NovaStar publish two endings because the receiving card decides: 32 bits
   * a pixel on an A10s Pro or A8s Pro, 48 on other Armor cards. The app has
   * no receiving-card field, so it reads high against both. Asserting the
   * gap rather than ignoring it means whoever closes it is told to come back
   * and rewrite this block, instead of finding a test that quietly passes.
   */
  const got = pixelsPerPortAt(mx30, 10, 60);
  const a10sPro = 494_792;
  const otherArmor = 329_861;

  check(`the app says ${n(got)} a port`, got === 520_000);
  check('which is high against the A10s Pro figure', got > a10sPro);
  check('and higher still against the other Armor one', got > otherArmor);
  check('but not by more than the padding can explain',
    got / a10sPro < 1.1 && got / otherArmor < 1.6,
    `${(got / a10sPro).toFixed(3)} and ${(got / otherArmor).toFixed(3)}`);
}

console.log('\nColour depth and refresh compose');
{
  check('10-bit at 120 Hz is half of 10-bit at 60 Hz',
    pixelsPerPortAt(mx30, 10, 120) === pixelsPerPortAt(mx30, 10, 60) / 2);
  check('asking for nothing sane does not divide by zero',
    Number.isFinite(signalScale(mx30, 0, 0)) && signalScale(mx30, 0, 0) > 0);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
