/**
 * Keeping the signal overlay off the clock on a big wall.
 *
 * Two things do the work and both can be wrong quietly. `runIntersects`
 * decides whether a chain is near enough the window to draw, and dropping one
 * that is on screen leaves a cable missing from the drawing — worse than slow.
 * `signalOrderCached` hands the same array to every caller, which is only
 * safe while they all treat it as read-only.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-run-cull.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const { runIntersects } = await import('../src/lib/render.ts');
const { signalOrder, signalOrderCached } = await import('../src/lib/geometry.ts');

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

/** A wall whose corner is at canvas (1000, 500), cabinets 100 x 50. */
const rect = { x: 1000, y: 500, width: 1000, height: 400 };
const tile = { w: 100, h: 50 };
const near = (run, view) => runIntersects(run, rect, tile, view);

console.log('\nChains near the window are kept');
{
  const topLeft = [[0, 0], [1, 0], [2, 0]];
  check('a chain inside it', near(topLeft, { x: 1000, y: 500, width: 400, height: 200 }));
  check('one overlapping its edge', near(topLeft, { x: 1250, y: 500, width: 400, height: 200 }));
  check('a window covering the whole wall', near(topLeft, { x: 0, y: 0, width: 5000, height: 5000 }));
  check('one just touching', near(topLeft, { x: 900, y: 450, width: 150, height: 100 }));
}

console.log('\nChains nowhere near it are dropped');
{
  const topLeft = [[0, 0], [1, 0], [2, 0]];
  check('a window far right', !near(topLeft, { x: 1800, y: 500, width: 200, height: 200 }));
  check('a window far below', !near(topLeft, { x: 1000, y: 800, width: 200, height: 100 }));
  check('a window off the wall entirely', !near(topLeft, { x: 5000, y: 5000, width: 100, height: 100 }));
}

console.log('\nA chain is judged on all of it, not its first cabinet');
{
  // A chain starting top-left and ending bottom-right: a window on the far
  // end has to keep it, or the cable vanishes halfway across the wall.
  const across = [[0, 0], [5, 0], [9, 0], [9, 3]];
  check('a window at the far end keeps it', near(across, { x: 1850, y: 630, width: 120, height: 120 }));

  /*
   * The test is the chain's box, not its exact line, so a window inside the
   * box but between two cabinets of the chain keeps it too. That is the
   * intended trade: the box is cheap and never drops a chain that is on
   * screen, where clipping the polyline properly would cost more than the
   * drawing it saves — and a cable missing from the drawing is worse than a
   * cable drawn off-screen.
   */
  check('as does one inside its box but off its line',
    near(across, { x: 1000, y: 700, width: 120, height: 60 }));

  // A chain confined to one corner is still dropped for a window elsewhere.
  const corner = [[0, 0], [1, 0], [1, 1]];
  check('a chain in one corner is dropped across the wall',
    !near(corner, { x: 1800, y: 800, width: 120, height: 60 }));
}

console.log('\nThe margin is a cabinet, so lines entering the window still start right');
{
  // A chain one cabinet outside is kept: its line crosses into the window.
  const justOutside = [[3, 0]];
  check('one cabinet clear is still kept', near(justOutside, { x: 1450, y: 500, width: 50, height: 50 }));
  check('three clear is not', !near(justOutside, { x: 1700, y: 500, width: 50, height: 50 }));
}

console.log('\nThe cached ordering');
{
  const layer = (over = {}) => ({
    id: 'l', name: 'w', cols: 6, rows: 4, x: 0, y: 0,
    signalStart: 'tl', signalPath: 'horizontal-serpentine',
    spec: { pixelPitch: 2.6, cabinet: { width: 500, height: 500, depth: 80 }, resolution: { w: 100, h: 50 }, maxCurveAngle: null },
    ...over,
  });

  const a = signalOrderCached(layer());
  const b = signalOrderCached(layer());
  check('the same wall gets the same array back', a === b);
  check('and it is the ordering signalOrder builds', JSON.stringify(a) === JSON.stringify(signalOrder(layer())));

  check('a different size is a different ordering', signalOrderCached(layer({ cols: 7 })) !== a);
  check('so is a different feed corner', signalOrderCached(layer({ signalStart: 'br' })) !== a);
  check('and a different path', signalOrderCached(layer({ signalPath: 'vertical' })) !== a);
  check('position does not change it', signalOrderCached(layer({ x: 900, y: 40 })) === a);

  // Everything downstream slices rather than mutating, which is the only
  // reason one array can be shared. If that ever stops being true this is
  // where it bites, so the contents are checked after the other callers ran.
  check('and it has not been mutated by anyone', JSON.stringify(a) === JSON.stringify(signalOrder(layer())));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
