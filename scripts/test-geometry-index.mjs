/**
 * `signalIndex` against `signalOrder`, which is the only thing that makes it
 * safe to use.
 *
 * One builds the whole run and the other works out a single cabinet's place
 * in it by arithmetic. They have to agree everywhere, for every start corner
 * and every path, or a wall would show numbers that do not match the cabling
 * the pick list prints — and that is the kind of wrong nobody finds until a
 * crew is holding the cable.
 *
 * So this is not a sample. It walks every position of every ordering on a
 * range of wall shapes, including the awkward ones: a single row, a single
 * column, and odd counts where a serpentine path turns on the last line.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-geometry-index.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const { signalIndex, signalOrder } = await import('../src/lib/geometry.ts');

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

const STARTS = ['tl', 'tr', 'bl', 'br'];
const PATHS = ['horizontal', 'horizontal-serpentine', 'vertical', 'vertical-serpentine'];
const SHAPES = [
  [1, 1], [1, 7], [7, 1], [2, 2], [3, 4], [4, 3], [5, 5], [6, 9], [9, 6], [10, 1], [13, 7],
];

const layer = (cols, rows, signalStart, signalPath) => ({
  id: 'i', name: 'i', cols, rows, x: 0, y: 0, signalStart, signalPath,
  spec: { pixelPitch: 2.6, cabinet: { width: 500, height: 500, depth: 80 }, resolution: { w: 192, h: 192 }, maxCurveAngle: null },
});

console.log('\nEvery position of every ordering');
{
  let combinations = 0;
  let positions = 0;
  const wrong = [];
  for (const [cols, rows] of SHAPES) {
    for (const start of STARTS) {
      for (const path of PATHS) {
        const l = layer(cols, rows, start, path);
        const order = signalOrder(l);
        combinations += 1;
        if (order.length !== cols * rows) wrong.push(`${cols}x${rows} ${start} ${path}: order has ${order.length}`);
        order.forEach(([col, row], i) => {
          positions += 1;
          const got = signalIndex(l, col, row);
          if (got !== i) wrong.push(`${cols}x${rows} ${start} ${path}: (${col},${row}) is ${i} but read ${got}`);
        });
      }
    }
  }
  check(`${combinations} orderings, ${positions} positions, all agreeing`, wrong.length === 0, `\n      ${wrong.slice(0, 4).join('\n      ')}`);
}

console.log('\nIt is a bijection, not just a mapping');
{
  const l = layer(9, 6, 'br', 'vertical-serpentine');
  const seen = new Set();
  for (let row = 0; row < l.rows; row++) {
    for (let col = 0; col < l.cols; col++) seen.add(signalIndex(l, col, row));
  }
  check('every cabinet gets its own number', seen.size === l.cols * l.rows, `(${seen.size} of ${l.cols * l.rows})`);
  check('numbered from zero', Math.min(...seen) === 0);
  check('with no gaps to the end', Math.max(...seen) === l.cols * l.rows - 1);
}

console.log('\nThe corners start where they say');
{
  for (const [start, col, row] of [['tl', 0, 0], ['tr', 8, 0], ['bl', 0, 5], ['br', 8, 5]]) {
    const l = layer(9, 6, start, 'horizontal-serpentine');
    check(`${start} numbers its own corner first`, signalIndex(l, col, row) === 0);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
