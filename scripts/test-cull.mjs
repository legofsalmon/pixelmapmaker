/**
 * Which cabinets a viewport covers.
 *
 * The arithmetic is three lines and every one of them is an off-by-one
 * waiting to happen: a floor where a ceil belongs leaves a bare strip down
 * the edge of the view, and the strip only appears at certain zooms and pan
 * positions, which is the kind of bug that ships.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-cull.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const { visibleTiles } = await import('../src/lib/render.ts');

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

/** A 10 x 8 wall of 100 x 50 px cabinets, its corner at canvas (1000, 500). */
const layer = (overrides = {}) => ({
  id: 'i', name: 'i', cols: 10, rows: 8, x: 1000, y: 500,
  signalStart: 'tl', signalPath: 'horizontal-serpentine',
  spec: { pixelPitch: 2.6, cabinet: { width: 500, height: 500, depth: 80 }, resolution: { w: 100, h: 50 }, maxCurveAngle: null },
  ...overrides,
});

const band = (v) => {
  const r = visibleTiles(layer(), v);
  return `${r.colFrom}-${r.colTo} x ${r.rowFrom}-${r.rowTo}`;
};

console.log('\nNo viewport means the whole wall');
{
  check('undefined draws everything', band(undefined) === '0-10 x 0-8');
  check('null draws everything', band(null) === '0-10 x 0-8');
}

console.log('\nA window over part of it');
{
  // The wall spans x 1000..2000, y 500..900.
  check('exactly the first cabinet', band({ x: 1000, y: 500, width: 100, height: 50 }) === '0-1 x 0-1');
  check('the first two across', band({ x: 1000, y: 500, width: 200, height: 50 }) === '0-2 x 0-1');
  check('a window in the middle', band({ x: 1300, y: 600, width: 200, height: 100 }) === '3-5 x 2-4');
  check('the whole wall and more', band({ x: 0, y: 0, width: 5000, height: 5000 }) === '0-10 x 0-8');
}

console.log('\nPartly covered cabinets are drawn, not skipped');
{
  // A window starting one pixel into cabinet 3 must still include cabinet 3.
  check('a sliver of the left cabinet counts', band({ x: 1301, y: 500, width: 100, height: 50 }) === '3-5 x 0-1');
  check('a sliver of the right one counts', band({ x: 1300, y: 500, width: 101, height: 50 }) === '3-5 x 0-1');
  check('a window inside one cabinet still draws it', band({ x: 1310, y: 510, width: 10, height: 10 }) === '3-4 x 0-1');
}

console.log('\nOff the wall entirely');
{
  const left = visibleTiles(layer(), { x: 0, y: 0, width: 100, height: 100 });
  check('a window to the left draws nothing', left.colFrom >= left.colTo || left.rowFrom >= left.rowTo);
  const right = visibleTiles(layer(), { x: 9000, y: 9000, width: 100, height: 100 });
  check('and one past the end draws nothing', right.colFrom >= right.colTo || right.rowFrom >= right.rowTo);
  check('ranges never go negative', left.colFrom >= 0 && left.rowFrom >= 0);
  check('nor past the wall', right.colTo <= 10 && right.rowTo <= 8);
}

console.log('\nThe edges of the wall');
{
  check('a window hanging off the left clamps to zero', band({ x: 500, y: 500, width: 600, height: 50 }) === '0-1 x 0-1');
  check('and off the right clamps to the last', band({ x: 1900, y: 850, width: 600, height: 600 }) === '9-10 x 7-8');
}

console.log('\nEvery pan position is covered, at every zoom');
{
  // Walk a window across the wall in steps that never divide the tile size,
  // and check the bands it reports always tile the wall with no gap.
  let gaps = 0;
  const l = layer();
  for (const w of [37, 100, 213, 640]) {
    for (let x = 900; x < 2100; x += 13) {
      const r = visibleTiles(l, { x, y: 500, width: w, height: 400 });
      const covers = (px) => px >= l.x + r.colFrom * 100 && px <= l.x + r.colTo * 100;
      // Any point of the window that is over the wall must be inside the band.
      for (const px of [x, x + w / 2, x + w]) {
        const onWall = px >= l.x && px <= l.x + 1000;
        if (onWall && r.colFrom < r.colTo && !covers(px)) gaps += 1;
      }
    }
  }
  check('no window leaves a point on the wall outside its band', gaps === 0, `(${gaps} gaps)`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
