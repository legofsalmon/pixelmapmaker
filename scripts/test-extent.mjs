/**
 * The ratio under the resolution, and the extent it is given for.
 *
 * `aspectRatio` is the one number on the status bar a client repeats back at
 * you, and it had no test. It gives width over height to two places, the way
 * the trade writes it, so the cases worth pinning are the ones where that is
 * not obviously right: a square, a portrait screen, a shape that only just
 * misses 16:9, and a multi-screen build where there is no single resolution
 * to take a ratio of at all.
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

console.log('\nWidth over height, to two places');
{
  check('16:9 reads 1.78:1', aspectRatio(1920, 1080) === '1.78:1', aspectRatio(1920, 1080));
  check('4:3 reads 1.33:1', aspectRatio(1024, 768) === '1.33:1', aspectRatio(1024, 768));
  check('square reads 1.00:1, not 1:1', aspectRatio(500, 500) === '1.00:1', aspectRatio(500, 500));
  check('a ten-by-six wall of square cabinets reads 1.67:1',
    aspectRatio(1760, 1056) === '1.67:1', aspectRatio(1760, 1056));
  check('cinemascope reads 2.39:1', aspectRatio(2048, 858) === '2.39:1', aspectRatio(2048, 858));
  check('an ultra-wide extent reads 2.63:1', aspectRatio(2780, 1056) === '2.63:1', aspectRatio(2780, 1056));
}

console.log('\nTaller than wide goes under one rather than flipping');
{
  check('portrait 9:16 reads 0.56:1', aspectRatio(1080, 1920) === '0.56:1', aspectRatio(1080, 1920));
  check('and is not the same as its landscape self',
    aspectRatio(1080, 1920) !== aspectRatio(1920, 1080));
}

console.log('\nOne form for every shape, which is the point of the change');
{
  /*
   * The old function gave 16:9 as a pair and 854 x 480 as a decimal, so two
   * screens a hair apart in shape read as unrelated strings. They should not.
   */
  check('854 x 480 is close enough to 16:9 to read the same',
    aspectRatio(854, 480) === aspectRatio(1920, 1080), aspectRatio(854, 480));

  const shapes = [[1920, 1080], [1024, 768], [500, 500], [1760, 1056], [1080, 1920], [2780, 1056]];
  check('every shape comes back in the same format',
    shapes.every(([w, h]) => /^\d+\.\d\d:1$/.test(aspectRatio(w, h))),
    shapes.map(([w, h]) => aspectRatio(w, h)).join(' '));

  check('the second place is kept even when it is a zero',
    aspectRatio(1000, 500) === '2.00:1', aspectRatio(1000, 500));
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
