/**
 * Curved and angled wall geometry, checked against the circle geometry it
 * claims to reproduce and against L-shapes worked out by hand.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-curve.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const {
  FLAT_SHAPE,
  MAX_JOINT_ANGLE,
  angleForRadius,
  curveWarnings,
  jointAngles,
  normaliseShape,
  planForLayer,
  radiusForAngle,
  wallPlan,
} = await import('../src/lib/curve.ts');

const { layerRect, layerSizeMm, signalOrder } = await import('../src/lib/geometry.ts');

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

const deg = (d) => (d * Math.PI) / 180;

const arc = (anglePerJoint) => ({ kind: 'arc', anglePerJoint, folds: [] });
const fold = (folds) => ({ kind: 'fold', anglePerJoint: 0, folds });

/**
 * A screen built by hand rather than from the cabinet library, so a change to
 * the scraped data cannot quietly move a test.
 */
function layer(overrides = {}) {
  const { spec: specOverrides = {}, ...rest } = overrides;
  return {
    id: 'test-layer',
    name: 'Test screen',
    cols: 8,
    rows: 4,
    x: 0,
    y: 0,
    signalStart: 'tl',
    signalPath: 'serpentine',
    spec: {
      pixelPitch: 2.6,
      cabinet: { width: 500, height: 500, depth: 80 },
      resolution: { w: 192, h: 192 },
      maxCurveAngle: null,
      ...specOverrides,
    },
    ...rest,
  };
}

console.log('\nJoint angles');
check('a single column has no joints', jointAngles(1, arc(10)).length === 0);
check('n columns have n-1 joints', jointAngles(8, arc(10)).length === 7);
check('an arc bends every joint the same', jointAngles(5, arc(3)).every((a) => a === 3));
check('a flat shape bends nothing', jointAngles(5, FLAT_SHAPE).every((a) => a === 0));
check('an absent shape is flat', jointAngles(5, undefined).every((a) => a === 0));
check(
  'a fold bends only its own joint',
  JSON.stringify(jointAngles(5, fold([{ joint: 2, angle: 90 }]))) === JSON.stringify([0, 0, 90, 0])
);
check(
  'a fold past the last joint is dropped rather than wrapping',
  JSON.stringify(jointAngles(3, fold([{ joint: 7, angle: 90 }]))) === JSON.stringify([0, 0])
);
check(
  'a fold dropped by a narrower wall comes back when it is widened',
  jointAngles(9, fold([{ joint: 7, angle: 90 }]))[7] === 90
);
check(
  'two folds on one joint add up',
  jointAngles(4, fold([{ joint: 1, angle: 30 }, { joint: 1, angle: 20 }]))[1] === 50
);
check('a bend past the limit is clamped', jointAngles(3, arc(400))[0] === MAX_JOINT_ANGLE);

console.log('\nNormalising a shape');
check('undefined comes back flat', normaliseShape(undefined).kind === 'flat');
check('an unknown kind comes back flat', normaliseShape({ kind: 'spiral' }).kind === 'flat');
check('a missing fold list comes back empty', normaliseShape({ kind: 'fold' }).folds.length === 0);
check(
  'a fold with a non-numeric angle is dropped',
  normaliseShape({ kind: 'fold', folds: [{ joint: 1, angle: 'a lot' }, { joint: 2, angle: 10 }] }).folds
    .length === 1
);
check(
  'a fractional joint index is rounded to a real joint',
  normaliseShape({ kind: 'fold', folds: [{ joint: 2.6, angle: 10 }] }).folds[0].joint === 3
);

console.log('\nRadius and bend per joint');
// R = (w/2) / tan(θ/2): a 500 mm cabinet at 5° per joint sits on 5.73 m.
near('500 mm at 5° is a 5.73 m radius', radiusForAngle(5, 500), 250 / Math.tan(deg(2.5)), 0.001);
near('500 mm at 5° in metres', radiusForAngle(5, 500) / 1000, 5.726, 0.001);
near('a right angle puts the radius at half the cabinet', radiusForAngle(90, 500), 250, 0.001);
check('no bend has no radius', radiusForAngle(0, 500) === null);
check('a bend on a zero-width cabinet has no radius', radiusForAngle(5, 0) === null);
near('the two directions agree', angleForRadius(radiusForAngle(5, 500), 500), 5, 1e-9);
near('a 10 m radius on 600 mm cabinets is a 3.44° bend', angleForRadius(10000, 600), 3.4367, 0.0005);
check('a radius of zero is no bend', angleForRadius(0, 500) === 0);

console.log('\nA flat wall');
{
  const plan = wallPlan(8, 500, FLAT_SHAPE);
  check('reports itself flat', plan.flat === true);
  near('is as wide across the ends as it is of screen', plan.spanMm, 4000, 1e-9);
  near('takes no depth', plan.footprintMm.depth, 0, 1e-9);
  near('turns through nothing', plan.includedAngleDeg, 0, 1e-9);
  check('has no radius', plan.radiusMm === null);
  check('has a point per cabinet plus one', plan.points.length === 9);
  near('starts half its width to the left of centre', plan.points[0].x, -2000, 1e-9);
}

console.log('\nA curved wall against the circle it approximates');
{
  /*
   * The cabinet joints of an arc sit on a circle of circumradius
   * (w/2)/sin(θ/2), and n cabinets subtend nθ at its centre. So the distance
   * across the ends is w·sin(nθ/2)/sin(θ/2) — which is what the walk should
   * produce without ever knowing the circle is there.
   */
  const w = 500;
  const cols = 6;
  const theta = 10;
  const plan = wallPlan(cols, w, arc(theta));
  const expectedSpan = (w * Math.sin(deg((cols * theta) / 2))) / Math.sin(deg(theta / 2));
  near('across the ends matches the chord of the arc', plan.spanMm, expectedSpan, 0.01);
  near('across the ends is 2.87 m', plan.spanMm, 2868.5, 0.5);

  const circumradius = w / 2 / Math.sin(deg(theta / 2));
  const expectedDepth = circumradius * (1 - Math.cos(deg((cols * theta) / 2)));
  near('depth matches the arc sagitta', plan.footprintMm.depth, expectedDepth, 0.01);
  near('depth is 385 mm', plan.footprintMm.depth, 384.6, 0.5);

  near('screen width is unchanged by the curve', plan.developedWidthMm, 3000, 1e-9);
  check('a curve always eats into the distance across the ends', plan.spanMm < plan.developedWidthMm);
  near('turn is the sum of the joints', plan.includedAngleDeg, 50, 1e-9);
  near('the radius is to the cabinet faces', plan.radiusMm, w / 2 / Math.tan(deg(theta / 2)), 0.001);
}

console.log('\nWhich way the wall bends');
{
  const positive = wallPlan(6, 500, arc(10));
  const negative = wallPlan(6, 500, arc(-10));
  const mid = (plan) => plan.points[Math.floor(plan.points.length / 2)].y;
  check('a positive bend sets the middle back from the audience', mid(positive) < 0);
  check('a negative bend pushes the middle at the audience', mid(negative) > 0);
  near('both take the same floor', positive.footprintMm.depth, negative.footprintMm.depth, 1e-9);
  near('both reach the same distance across', positive.spanMm, negative.spanMm, 1e-9);
}

console.log('\nThe outline is squared up on its own ends');
{
  const plan = wallPlan(7, 500, arc(8));
  const last = plan.points[plan.points.length - 1];
  near('the first end sits on the axis', plan.points[0].y, 0, 1e-9);
  near('the last end sits on the axis', last.y, 0, 1e-9);
  near('and they straddle the centre', plan.points[0].x + last.x, 0, 1e-9);
  near('so the ends are the span apart', last.x - plan.points[0].x, plan.spanMm, 1e-9);
}

console.log('\nAn angled wall: two 2 m legs at a right angle');
{
  // Four 1 m cabinets, turning 90° after the second: an L of two 2 m legs. On
  // the floor that is 2.83 m corner to corner and 1.41 m front to back.
  const plan = wallPlan(4, 1000, fold([{ joint: 1, angle: 90 }]));
  near('screen width is still four cabinets', plan.developedWidthMm, 4000, 1e-9);
  near('across the ends is the diagonal', plan.spanMm, Math.sqrt(2) * 2000, 0.001);
  near('and the corner reaches half that back', plan.footprintMm.depth, Math.sqrt(2) * 1000, 0.001);
  near('the floor it takes is the span wide', plan.footprintMm.width, Math.sqrt(2) * 2000, 0.001);
  near('it turns through a right angle', plan.includedAngleDeg, 90, 1e-9);
  check('an uneven bend has no single radius', plan.radiusMm === null);
  check('the largest joint is the corner', plan.maxJointAngleDeg === 90);
}

console.log('\nA wall bent round on itself');
{
  // Twelve cabinets at 30° close a dodecagon: the ends meet and there is no
  // chord left to square the drawing up against.
  const plan = wallPlan(12, 500, arc(30));
  check('still produces a drawable outline', plan.points.length === 13);
  check('and does not report a negative footprint', plan.footprintMm.depth >= 0);
  near('turns through 330° across eleven joints', plan.includedAngleDeg, 330, 1e-9);
}

console.log('\nWarnings');
{
  const flat = wallPlan(8, 500, FLAT_SHAPE);
  check('a flat wall says nothing', curveWarnings(flat, { maxCurveAngle: null }).length === 0);

  const curved = wallPlan(8, 500, arc(10));
  const unchecked = curveWarnings(curved, { maxCurveAngle: null });
  check('an unrated panel gets one warning', unchecked.length === 1);
  check('which says the bend is unchecked', unchecked[0].includes('unchecked'));

  const overBent = curveWarnings(curved, { maxCurveAngle: 5 });
  check('a bend past the rating is called out', overBent.length === 1 && overBent[0].includes('5°'));

  check('a bend inside the rating is not', curveWarnings(curved, { maxCurveAngle: 10 }).length === 0);
  check(
    'and neither is one exactly on it',
    curveWarnings(wallPlan(8, 500, arc(5)), { maxCurveAngle: 5 }).length === 0
  );

  const wrapped = curveWarnings(wallPlan(20, 500, arc(10)), { maxCurveAngle: 10 });
  check('a wall wrapping past 180° is flagged', wrapped.some((w) => w.includes('wraps')));

  const closed = curveWarnings(wallPlan(40, 500, arc(10)), { maxCurveAngle: 10 });
  check('a wall closing on itself is flagged', closed.some((w) => w.includes('closes on itself')));
}

console.log('\nA shape never touches the pixel map');
{
  /*
   * The load-bearing claim of the whole feature: the pixel map of a curved wall
   * is the same flat rectangle as a straight one, so the canvas, the export and
   * the signal order must not be able to tell the difference.
   */
  const flat = layer();
  const curved = layer({ shape: arc(12) });
  const angled = layer({ shape: fold([{ joint: 3, angle: 90 }]) });

  for (const [name, shaped] of [['A curved', curved], ['An angled', angled]]) {
    check(
      `${name} wall has the same canvas rectangle`,
      JSON.stringify(layerRect(shaped)) === JSON.stringify(layerRect(flat))
    );
    check(
      `${name} wall has the same screen size in millimetres`,
      JSON.stringify(layerSizeMm(shaped)) === JSON.stringify(layerSizeMm(flat))
    );
    check(
      `${name} wall feeds its cabinets in the same order`,
      JSON.stringify(signalOrder(shaped)) === JSON.stringify(signalOrder(flat))
    );
  }

  near(
    'and the screen is still as wide as its cabinets make it',
    planForLayer(curved).developedWidthMm,
    layerSizeMm(flat).width,
    1e-9
  );
  check('while the floor it takes has shrunk', planForLayer(curved).spanMm < layerSizeMm(flat).width);
}

console.log('\nFrom a layer');
{
  const plan = planForLayer(layer({ cols: 6, shape: arc(10) }));
  near('reads the cabinet width off the spec', plan.spanMm, wallPlan(6, 500, arc(10)).spanMm, 1e-9);
  check('a layer saved before shapes existed is flat', planForLayer(layer()).flat === true);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
