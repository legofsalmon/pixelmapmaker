/**
 * The 3D view's geometry and its rear drawing's runs: where walls stand, that
 * a bent wall in 3D is the same polygon the plan view draws, and that the back
 * carries the same chains as the canvas and the pick list.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-stage.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const { ASSUMED_DEPTH_MM, canvasPlacements, placementFor, rearColumn, sceneBounds, wallSolid } =
  await import('../src/lib/stage.ts');
const { planForLayer } = await import('../src/lib/curve.ts');
const { signalOrder } = await import('../src/lib/geometry.ts');
const { rearRuns, rearTile, withEveryRun } = await import('../src/lib/rear.ts');
const { DEFAULT_CABLING, runOverlays } = await import('../src/lib/cabling.ts');
const { PROCESSORS } = await import('../src/lib/processors.ts');

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

const near = (name, actual, expected, tolerance = 1e-6) =>
  check(name, Math.abs(actual - expected) <= tolerance, `(got ${actual}, wanted ${expected} ±${tolerance})`);

function layer(overrides = {}) {
  const { spec: specOverrides = {}, ...rest } = overrides;
  return {
    id: 'a',
    name: 'Test screen',
    cols: 8,
    rows: 4,
    x: 0,
    y: 0,
    visible: true,
    signalStart: 'tl',
    signalPath: 'serpentine',
    showSignalFlow: false,
    showPowerRuns: false,
    spec: {
      model: 'Test',
      pixelPitch: 2.6,
      cabinet: { width: 500, height: 500, depth: 80 },
      resolution: { w: 192, h: 192 },
      power: { max: 200, avg: 70 },
      weightKg: 8,
      maxCurveAngle: null,
      ...specOverrides,
    },
    ...rest,
  };
}

const arc = (anglePerJoint) => ({ kind: 'arc', anglePerJoint, folds: [] });
const fold = (folds) => ({ kind: 'fold', anglePerJoint: 0, folds });
const origin = { x: 0, z: 0, elevation: 0, rotation: 0 };

console.log('\nA flat wall');
{
  const solid = wallSolid(layer(), origin);
  check('one piece per column', solid.columns.length === 8);
  near('4 m wide, centred', solid.bounds.max[0] - solid.bounds.min[0], 4);
  near('left edge at -2 m', solid.columns[0].front[0][0], -2);
  near('2 m tall', solid.bounds.max[1], 2);
  near('stands on the floor', solid.bounds.min[1], 0);
  near('the face is on the stage line', solid.columns[3].front[0][2], 0);
  near('the back is a cabinet deep upstage', solid.columns[3].back[0][2], -0.08);
  check('the datasheet depth is used', solid.depthMm === 80 && !solid.depthAssumed);
  near('the first column takes the left of the map', solid.columns[0].u0, 0);
  near('the last column takes the right of the map', solid.columns[7].u1, 1);
  // From behind, the left edge of the back face is the front's right edge.
  near('the back reads mirrored', solid.columns[0].back[0][0], solid.columns[0].front[1][0]);
}

console.log('\nNo published depth');
{
  const solid = wallSolid(layer({ spec: { cabinet: { width: 500, height: 500, depth: null } } }), origin);
  check('falls back to a typical depth, and says so', solid.depthMm === ASSUMED_DEPTH_MM && solid.depthAssumed);
}

console.log('\nCurved and folded walls match the plan');
for (const [name, shape] of [['an arc', arc(5)], ['an L', fold([{ joint: 3, angle: 90 }])], ['a convex arc', arc(-4)]]) {
  const l = layer({ shape });
  const plan = planForLayer(l);
  const solid = wallSolid(l, origin);
  const worst = solid.columns.reduce((m, c, i) => {
    const p = plan.points[i];
    return Math.max(m, Math.abs(c.front[0][0] - p.x / 1000), Math.abs(c.front[0][2] - p.y / 1000));
  }, 0);
  near(`${name}: every joint where the plan puts it`, worst, 0, 1e-9);
  const widths = solid.columns.map((c) => Math.hypot(c.front[1][0] - c.front[0][0], c.front[1][2] - c.front[0][2]));
  check(`${name}: every cabinet keeps its width`, widths.every((w) => Math.abs(w - 0.5) < 1e-9));
}
{
  // A concave arc brings the ends toward the audience; the back sits behind the face.
  const solid = wallSolid(layer({ shape: arc(10) }), origin);
  const end = solid.columns[7];
  check('a concave arc wraps its ends toward the audience', end.front[1][2] > solid.columns[3].front[1][2]);
  const mid = solid.columns[3];
  const faceToCentre = Math.hypot(mid.front[0][0], mid.front[0][2] - 10);
  const backToCentre = Math.hypot(mid.back[1][0], mid.back[1][2] - 10);
  check('the back is on the far side from the audience', backToCentre > faceToCentre);
}

console.log('\nPlacing and turning');
{
  const moved = wallSolid(layer(), { x: 3, z: -1, elevation: 1.2, rotation: 0 });
  near('moves across', moved.bounds.min[0], 1);
  near('raises', moved.bounds.min[1], 1.2);
  near('moves upstage', moved.columns[0].front[0][2], -1);

  const turned = wallSolid(layer({ cols: 2 }), { x: 0, z: 0, elevation: 0, rotation: 90 });
  const c = turned.columns[0];
  // Turned 90°, the face points at +x: the back is further toward -x than the face.
  check('a positive turn faces stage left', c.back[0][0] < c.front[0][0] - 0.05);
}

console.log('\nPositions read off the canvas');
{
  const left = layer({ id: 'l', x: 0, y: 0, cols: 4, rows: 2 });
  const right = layer({ id: 'r', x: 4 * 192, y: 0, cols: 4, rows: 2 });
  const placed = canvasPlacements([left, right]);
  near('side by side on the canvas is side by side on stage', placed.get('r').x - placed.get('l').x, 2);
  near('and the pair is centred', placed.get('l').x + placed.get('r').x, 0);
  check('both on the floor', placed.get('l').elevation === 0 && placed.get('r').elevation === 0);

  const high = layer({ id: 'h', x: 0, y: 0, cols: 2, rows: 1 });
  const low = layer({ id: 'w', x: 0, y: 192 * 3, cols: 2, rows: 2 });
  const stacked = canvasPlacements([high, low]);
  near('the lowest screen stands on the floor', stacked.get('w').elevation, 0);
  near('a screen above it is raised by the gap', stacked.get('h').elevation, 2);

  const own = { x: 5, z: 2, elevation: 1, rotation: 30 };
  check('a placed screen keeps its own position', placementFor(layer({ stage: own }), placed) === own);
  check('an unplaced one follows the canvas', placementFor(left, placed) === placed.get('l'));
  check(
    'a damaged placement falls back to the canvas',
    placementFor(layer({ id: 'l', stage: { x: NaN, z: 0, elevation: 0, rotation: 0 } }), placed) === placed.get('l')
  );
  check('nothing to place, nothing placed', canvasPlacements([]).size === 0);
  const bounds = sceneBounds([wallSolid(layer(), { x: 0, z: 0, elevation: 2, rotation: 0 })]);
  near('the scene always includes the floor', bounds.min[1], 0);
}

console.log('\nThe back');
{
  check('the first column is on the right from behind', rearColumn(0, 8) === 7 && rearColumn(7, 8) === 0);
  check('a small wall gets readable cabinets', rearTile(8, 4) === 160);
  check('a huge wall still fits one texture', rearTile(200, 200) * 200 <= 4096);

  const processor = PROCESSORS[0];
  const settings = { ...DEFAULT_CABLING, mode: 'manual', cabinetsPerDataRun: 8, cabinetsPerPowerRun: 6 };
  const l = layer();
  const overlays = runOverlays(withEveryRun([l]), settings, processor, 1);
  const runs = rearRuns(l, overlays);
  check('cut into the data runs the plan sets', runs.data.runs.length === 4 && runs.data.runs.every((r) => r.length === 8));
  check('and the power circuits', runs.power.runs.length === 6 && runs.power.runs[0].length === 6);
  check(
    'chains follow the signal order',
    JSON.stringify(runs.data.runs.flat()) === JSON.stringify(signalOrder(l))
  );
  check('every data run is named for its port', runs.data.labels.length >= 4 && runs.data.labels.every(Boolean));
  check('every circuit is named', runs.power.labels[0] === 'Circuit 1');

  // Even with both overlays off on the canvas, the back carries the cabling.
  const hidden = layer({ showSignalFlow: false, showPowerRuns: false });
  const plain = rearRuns(hidden, runOverlays([hidden], settings, processor, 1));
  const full = rearRuns(hidden, runOverlays(withEveryRun([hidden]), settings, processor, 1));
  check('the canvas overlay switches would hide the runs…', plain.data.runs.length === 1);
  check('…so the back builds them with every run on', full.data.runs.length === 4);

  const drawn = layer({
    cablingPlan: 'custom',
    customRuns: { data: [[[0, 0], [1, 0]], []], power: [[[0, 0]]] },
  });
  const custom = rearRuns(drawn, runOverlays(withEveryRun([drawn]), settings, processor, 1));
  check('a hand-drawn plan is drawn as drawn', custom.data.runs.length === 1 && custom.data.runs[0].length === 2);
  check('with its power too', custom.power.runs.length === 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
