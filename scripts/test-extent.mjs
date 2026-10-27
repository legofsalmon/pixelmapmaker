/**
 * The ratio under the resolution, and the extent it is given for.
 *
 * `aspectRatio` is the one number on the status bar a client repeats back at
 * you, and it had no test. The awkward cases are where it earns one: a ratio
 * that reduces to something nobody says out loud, and a multi-screen build
 * where there is no single resolution to take a ratio of.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-extent.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const { aspectRatio } = await import('../src/lib/calc.ts');
const { contentBounds } = await import('../src/lib/geometry.ts');

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

const layer = (over = {}) => ({
  id: 'l', name: 'w', cols: 10, rows: 6, x: 0, y: 0, visible: true,
  signalStart: 'tl', signalPath: 'horizontal-serpentine',
  spec: { pixelPitch: 2.6, cabinet: { width: 500, height: 500, depth: 80 }, resolution: { w: 176, h: 176 }, maxCurveAngle: null },
  ...over,
});

console.log('\nRatios people recognise');
{
  check('16:9', aspectRatio(1920, 1080) === '16:9');
  check('4:3', aspectRatio(1024, 768) === '4:3');
  check('1:1', aspectRatio(500, 500) === '1:1');
  check('5:3, as a ten-by-six wall of square cabinets comes out', aspectRatio(1760, 1056) === '5:3');
  check('taller than wide keeps its order', aspectRatio(1080, 1920) === '9:16');
}

console.log('\nRatios nobody says out loud become a decimal');
{
  // 427:240 reduces no further and tells you nothing; 1.78:1 does.
  check('an awkward one falls back', aspectRatio(854, 480) === '1.78:1', aspectRatio(854, 480));
  check('and a very wide one too', /:1$/.test(aspectRatio(2780, 1056)), aspectRatio(2780, 1056));
  check('reading as the number it is', aspectRatio(2780, 1056) === '2.63:1', aspectRatio(2780, 1056));
}

console.log('\nNothing to divide');
{
  check('no width is a dash', aspectRatio(0, 1080) === '—');
  check('no height is a dash', aspectRatio(1920, 0) === '—');
  check('neither is a dash', aspectRatio(0, 0) === '—');
}

console.log('\nThe extent of several screens');
{
  // Two 1760 x 1056 screens, the second pushed right with a gap between them.
  const a = layer();
  const b = layer({ id: 'b', x: 2000 });
  const box = contentBounds([a, b]);
  check('it spans from the first to the last', box.x === 0 && box.width === 2000 + 1760, `(${box.width})`);
  check('and is only as tall as they are', box.height === 1056, `(${box.height})`);
  check('its ratio is of the box, not of either screen',
    aspectRatio(box.width, box.height) !== aspectRatio(1760, 1056));

  check('one screen on its own is just itself',
    JSON.stringify(contentBounds([a])) === JSON.stringify({ x: 0, y: 0, width: 1760, height: 1056 }));

  // A hidden screen is not part of the arrangement anyone is looking at.
  check('a hidden screen does not stretch it',
    contentBounds([a, layer({ id: 'c', x: 9000, visible: false })]).width === 1760);
  check('nothing visible has no extent', contentBounds([layer({ visible: false })]) === null);
}

console.log('\nA screen moved does not change its own ratio');
{
  const here = contentBounds([layer()]);
  const there = contentBounds([layer({ x: 4321, y: 765 })]);
  check('same shape, wherever it sits',
    aspectRatio(here.width, here.height) === aspectRatio(there.width, there.height));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
