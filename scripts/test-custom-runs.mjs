/**
 * Hand-drawn cabling: the rules that make tracing a chain forgiving, and the
 * running total it is traced against.
 *
 * The editing rules are the drawing aids — there is no separate "snapping"
 * anywhere, it is `appendCell` refusing a cabinet that does not touch the
 * last one. So these tests are the interaction, tested where it is logic
 * rather than where it is a pointer.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-custom-runs.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const {
  appendCell,
  areAdjacent,
  capacityFor,
  cellKey,
  inBounds,
  loadFor,
  reportFor,
  stepFrom,
  takenCells,
} = await import('../src/lib/customRuns.ts');

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

/** A 6 x 4 wall of 200 x 200 px cabinets drawing 100 W each. */
const layer = (overrides = {}) => {
  const { spec = {}, ...rest } = overrides;
  return {
    id: 'l', name: 'Wall', cols: 6, rows: 4, x: 0, y: 0,
    signalStart: 'tl', signalPath: 'horizontal-serpentine',
    spec: {
      pixelPitch: 2.6,
      cabinet: { width: 500, height: 500, depth: 80 },
      resolution: { w: 200, h: 200 },
      power: { max: 100, avg: 50 },
      maxCurveAngle: null,
      ...spec,
    },
    ...rest,
  };
};

const settings = (over = {}) => ({
  mode: 'auto', cabinetsPerDataRun: 8, cabinetsPerPowerRun: 6,
  supplyVoltage: 230, maxAmpsPerCircuit: 16, circuitUtilisation: 0.8,
  maxCabinetsPerChain: 16, bitDepth: 8, refreshHz: 60,
  dataRunsEndAtEdge: false, powerRunsEndAtEdge: false, backupPorts: false,
  ...over,
});

/** 650,000 px a port at 8-bit 60 Hz — the familiar Gigabit figure. */
const processor = (over = {}) => ({
  id: 'p', brand: 'Test', model: 'Port One', ports: 4, portType: '1G',
  totalPixels: 2_600_000, maxCabinetsPerPort: null,
  baselineBitDepth: 8, baselineHz: 60, sourceUrl: null,
  ...over,
});

console.log('\nWhat counts as touching');
{
  check('side by side', areAdjacent([1, 1], [2, 1]));
  check('one above the other', areAdjacent([1, 1], [1, 2]));
  check('a corner is not touching', !areAdjacent([1, 1], [2, 2]));
  check('two apart is not touching', !areAdjacent([1, 1], [3, 1]));
  check('itself is not touching', !areAdjacent([1, 1], [1, 1]));
  check('on the wall', inBounds(layer(), [5, 3]) && !inBounds(layer(), [6, 3]) && !inBounds(layer(), [-1, 0]));
}

console.log('\nTracing a chain');
{
  const l = layer();
  let run = [];
  for (const cell of [[0, 0], [1, 0], [2, 0]]) run = appendCell(l, run, cell).run;
  check('three cabinets in the order they were touched', JSON.stringify(run) === '[[0,0],[1,0],[2,0]]');

  check('the same cabinet again does nothing', appendCell(l, run, [2, 0]).added === false);
  check('and is not an error', appendCell(l, run, [2, 0]).refused === undefined);

  const back = appendCell(l, run, [1, 0]);
  check('dragging back one retracts the chain', JSON.stringify(back.run) === '[[0,0],[1,0]]');

  const diagonal = appendCell(l, run, [3, 1]);
  check('a diagonal is refused', diagonal.added === false && diagonal.refused === 'not-touching');
  const leap = appendCell(l, run, [5, 0]);
  check('so is a leap across the wall', leap.added === false && leap.refused === 'not-touching');
  check('but not with the override', appendCell(l, run, [5, 0], { allowJump: true }).added === true);

  check('off the wall is refused', appendCell(l, run, [9, 9]).refused === 'off-wall');
  const revisit = appendCell(l, run, [0, 0]);
  check('a cabinet already on this chain is refused', revisit.refused === 'already-on-this-run');
}

console.log('\nOne cabinet, one chain');
{
  const l = layer();
  const existing = [[[0, 0], [1, 0]], [[0, 1], [1, 1]]];
  const taken = takenCells(existing);
  check('every drawn cabinet is counted', taken.size === 4 && taken.has(cellKey([1, 1])));
  const result = appendCell(l, [[2, 1]], [1, 1], { taken });
  check('a cabinet on another chain is refused', result.added === false && result.refused === 'on-another-run');
  check('ignoring a run frees its cabinets', takenCells(existing, 0).size === 2);
  check('and it can then be drawn again', appendCell(l, [[2, 0]], [1, 0], { taken: takenCells(existing, 0) }).added === true);
}

console.log('\nStepping with the arrow keys');
{
  const l = layer();
  check('right', JSON.stringify(stepFrom(l, [1, 1], 'ArrowRight')) === '[2,1]');
  check('left', JSON.stringify(stepFrom(l, [1, 1], 'ArrowLeft')) === '[0,1]');
  check('up', JSON.stringify(stepFrom(l, [1, 1], 'ArrowUp')) === '[1,0]');
  check('down', JSON.stringify(stepFrom(l, [1, 1], 'ArrowDown')) === '[1,2]');
  check('off the edge is nothing', stepFrom(l, [0, 0], 'ArrowLeft') === null);
  check('a key that is not an arrow is nothing', stepFrom(l, [1, 1], 'Enter') === null);
  check('every step lands on a touching cabinet', ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    .map((k) => stepFrom(l, [2, 2], k))
    .every((c) => c && areAdjacent([2, 2], c)));
}

console.log('\nWhat a data run may carry');
{
  const l = layer();
  // 200 x 200 = 40,000 px a cabinet; 650,000 px a port is 16 of them.
  const c = capacityFor('data', l, settings(), processor());
  check('sixteen cabinets a port', c.cabinets === 16, `(${c.cabinets})`);
  check('measured in pixels', c.unit === 'px' && c.perCabinet === 40000);
  check('and it says which ceiling bound it', /port capacity/.test(c.limitedBy), c.limitedBy);

  // 10-bit costs a fifth of the capacity, so the chain shortens.
  const tenBit = capacityFor('data', l, settings({ bitDepth: 10 }), processor());
  check('10-bit shortens the chain', tenBit.cabinets < c.cabinets, `(${tenBit.cabinets} vs ${c.cabinets})`);

  const chained = capacityFor('data', l, settings({ maxCabinetsPerChain: 6 }), processor());
  check('a tighter chain limit wins', chained.cabinets === 6 && /chain kept to 6/.test(chained.limitedBy));

  const addressed = capacityFor('data', l, settings(), processor({ maxCabinetsPerPort: 4 }));
  check('so does what the processor will address', addressed.cabinets === 4 && /addresses 4/.test(addressed.limitedBy));
}

console.log('\nWhat a power circuit may carry');
{
  const l = layer();
  // 230 V x 16 A x 80% = 2,944 W; at 100 W a cabinet that is 29.
  const c = capacityFor('power', l, settings(), processor());
  check('twenty-nine cabinets a circuit', c.cabinets === 29, `(${c.cabinets})`);
  check('measured in watts', c.unit === 'W' && c.budget === 2944);
  check('and it shows the circuit it came from', /16 A at 230 V, 80% loaded/.test(c.limitedBy), c.limitedBy);

  const unknown = capacityFor('power', layer({ spec: { power: null } }), settings(), processor());
  check('an unpublished panel power falls back rather than inventing one',
    unknown.budget === null && /no published panel power/.test(unknown.limitedBy));
}

console.log('\nThe running total');
{
  const l = layer();
  const run = Array.from({ length: 12 }, (_, i) => [i % 6, Math.floor(i / 6)]);
  const load = loadFor('data', l, run, settings(), processor());
  check('counts the cabinets on it', load.count === 12);
  check('and the pixels they take', load.used === 480000);
  check('as a fraction of the ceiling', Math.abs(load.fraction - 12 / 16) < 1e-9);
  check('not over yet', load.over === false);

  const full = loadFor('data', l, Array.from({ length: 16 }, (_, i) => [i, 0]), settings(), processor());
  check('exactly at the ceiling is not over', full.over === false && full.fraction === 1);
  const spilt = loadFor('data', l, Array.from({ length: 17 }, (_, i) => [i, 0]), settings(), processor());
  check('one past it is', spilt.over === true && spilt.fraction > 1);
}

console.log('\nThe whole drawn plan');
{
  const l = layer(); // 24 cabinets
  const runs = [
    [[0, 0], [1, 0], [2, 0]],
    [[3, 0], [4, 0], [5, 0]],
  ];
  const report = reportFor('data', l, runs, settings(), processor());
  check('counts what is patched', report.patched === 6);
  check('and what is not', report.unpatched === 18);
  check('nothing over', report.overRuns.length === 0);
  check('nothing doubled', report.doubled.length === 0);

  const clashing = reportFor('data', l, [[[0, 0], [1, 0]], [[1, 0], [2, 0]]], settings(), processor());
  check('a cabinet on two chains is reported', clashing.doubled.length === 1 && clashing.doubled[0] === '1,0');
  check('and is only counted once as patched', clashing.patched === 3);

  const tooLong = reportFor('data', l, [Array.from({ length: 20 }, (_, i) => [i % 6, Math.floor(i / 6)])], settings(), processor());
  check('an over-long chain is named by index', tooLong.overRuns.length === 1 && tooLong.overRuns[0] === 0);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
