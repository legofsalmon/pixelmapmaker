/**
 * The ratio under the resolution, and the extent it is given for.
 *
 * `aspectRatio` is the one line on the status bar a client repeats back at
 * you, and it had no test. It leads with width over height to two places,
 * the way the trade writes it, and adds the reduced pair in brackets when
 * that pair is a name rather than the fraction written out again. So the
 * cases worth pinning are the ones either half gets wrong on its own: a
 * square, a portrait screen, a shape that only just misses 16:9, one whose
 * pair reduces nowhere, and a multi-screen build where there is no single
 * resolution to take a ratio of at all.
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

console.log('\nThe decimal leads, and the name it goes by follows');
{
  check('16:9', aspectRatio(1920, 1080) === '1.78:1 (16:9)', aspectRatio(1920, 1080));
  check('4:3', aspectRatio(1024, 768) === '1.33:1 (4:3)', aspectRatio(1024, 768));
  check('square', aspectRatio(500, 500) === '1.00:1 (1:1)', aspectRatio(500, 500));
  check('a ten-by-six wall of square cabinets',
    aspectRatio(1760, 1056) === '1.67:1 (5:3)', aspectRatio(1760, 1056));
  check('the second place is kept even when it is a zero',
    aspectRatio(1000, 500) === '2.00:1 (2:1)', aspectRatio(1000, 500));
}

console.log('\nA pair that names nothing is left off rather than forced');
{
  // 427:240 reduces no further, and is only the fraction written out again.
  check('854 x 480 gives the decimal alone', aspectRatio(854, 480) === '1.78:1', aspectRatio(854, 480));
  check('cinemascope too, at 1024:429', aspectRatio(2048, 858) === '2.39:1', aspectRatio(2048, 858));
  check('and a two-screen extent at 695:264',
    aspectRatio(2780, 1056) === '2.63:1', aspectRatio(2780, 1056));
}

console.log('\nThe decimal is the half that compares');
{
  /*
   * This is why the decimal leads. 854 x 480 and 1920 x 1080 are the same
   * shape to within a rounding error, but as pairs they are 427:240 and 16:9
   * and look unrelated. Whatever else each one carries, the decimals match.
   */
  const only = (s) => s.split(' ')[0];
  check('854 x 480 and 1920 x 1080 agree on the number',
    only(aspectRatio(854, 480)) === only(aspectRatio(1920, 1080)),
    `${aspectRatio(854, 480)} / ${aspectRatio(1920, 1080)}`);

  const shapes = [[1920, 1080], [1024, 768], [500, 500], [1760, 1056], [1080, 1920], [2780, 1056], [854, 480]];
  check('every shape leads with a two-place decimal',
    shapes.every(([w, h]) => /^\d+\.\d\d:1( \(\d+:\d+\))?$/.test(aspectRatio(w, h))),
    shapes.map(([w, h]) => aspectRatio(w, h)).join(' / '));
}

console.log('\nTaller than wide goes under one rather than flipping');
{
  check('portrait reads 0.56:1, and keeps 9:16 as its name',
    aspectRatio(1080, 1920) === '0.56:1 (9:16)', aspectRatio(1080, 1920));
  check('and is not the same as its landscape self',
    aspectRatio(1080, 1920) !== aspectRatio(1920, 1080));
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
