/**
 * Viewing distance maths, checked against the published figures it claims to
 * reproduce and against worked examples done by hand.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-viewing.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const {
  ACUITY_SCALE,
  SMPTE_MIN_ANGLE_DEG,
  VIEWING_GRADES,
  acuityDistanceM,
  arcminutesPerPixel,
  frontRowRuleM,
  gradeFor,
  horizontalAngleDeg,
  resolvableDetailMm,
  tenXRuleDistanceM,
  viewingForLayer,
  viewingForProject,
} = await import('../src/lib/viewing.ts');

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

const M_PER_FT = 0.3048;

/**
 * A screen, built by hand rather than from the cabinet library, so a change to
 * the scraped data cannot quietly move a test.
 */
function layer(overrides = {}) {
  const { spec: specOverrides = {}, ...rest } = overrides;
  return {
    id: 'test-layer',
    name: 'Test screen',
    cols: 8,
    rows: 4,
    spec: {
      pixelPitch: 2.6,
      cabinet: { width: 500, height: 500, depth: 80 },
      resolution: { w: 192, h: 192 },
      ...specOverrides,
    },
    ...rest,
  };
}

console.log('\nThe constant everything rests on');
{
  // Planar quote 3438 as the multiplier from pitch in mm to acuity distance in
  // mm; it is 1 / tan(1 arcminute), and if these ever disagree the doc comment
  // in viewing.ts is wrong.
  near('ACUITY_SCALE is 1 / tan(1 arcminute)', ACUITY_SCALE, 3437.75, 0.01);
  near("matches the trade's rounded 3438", ACUITY_SCALE, 3438, 0.3);
  near('one arcminute is 0.291 mm at one metre', resolvableDetailMm(1), 0.29089, 0.0001);
  near('and ten times that at ten metres', resolvableDetailMm(10), 2.9089, 0.001);
}

console.log("\nPlanar's worked example: a 2.5 mm panel");
{
  // "2.50 x 3438 = 28.1" ft, from the Planar white paper.
  near('acuity distance is 28.1 ft', acuityDistanceM(2.5) / M_PER_FT, 28.1, 0.2);
  near('which is 8.59 m', acuityDistanceM(2.5), 8.594, 0.01);
  // "2.50 x 10 = 25.0" ft.
  near('the 10x rule gives 25.0 ft', tenXRuleDistanceM(2.5) / M_PER_FT, 25.0, 0.01);
  check(
    'the 10x rule undershoots the real figure, as a shorthand should',
    tenXRuleDistanceM(2.5) < acuityDistanceM(2.5)
  );
  near('by about 11%', 1 - tenXRuleDistanceM(2.5) / acuityDistanceM(2.5), 0.113, 0.005);
}

console.log('\nArcminutes per pixel');
{
  near('a pixel subtends exactly 1 arcminute at the acuity distance', arcminutesPerPixel(4, acuityDistanceM(4)), 1, 1e-9);
  near('and the same for any pitch', arcminutesPerPixel(0.9, acuityDistanceM(0.9)), 1, 1e-9);
  near('half the distance doubles the angle', arcminutesPerPixel(4, acuityDistanceM(4) / 2), 2, 1e-6);
  near('2.6 mm at 5 m is 1.79 arcmin', arcminutesPerPixel(2.6, 5), 1.7876, 0.001);
  check('a zero distance is not a number the maths can give', arcminutesPerPixel(2.6, 0) === Infinity);
  check('nor is a zero pitch', arcminutesPerPixel(0, 5) === Infinity);
}

console.log('\nThe grades, and the rule of thumb they are checked against');
{
  check('below the acuity limit is beyond-acuity', gradeFor(0.99) === 'beyond-acuity');
  check('at the limit it becomes clean', gradeFor(1) === 'clean');
  check('twice the limit is structure visible', gradeFor(2) === 'visible');
  check('four times the limit is coarse', gradeFor(4) === 'coarse');
  check('every grade carries a label and a meaning', Object.values(VIEWING_GRADES).every((g) => g.label && g.meaning));

  // The trade's "stand no closer than the pitch in metres" rule is the reason
  // the bands are where they are: it has to land inside `visible`, because
  // that is what it describes.
  const atRule = arcminutesPerPixel(2.6, frontRowRuleM(2.6));
  near('pitch x 1 m puts a pixel at 3.44 arcmin', atRule, 3.4377, 0.001);
  check('which grades as structure visible', gradeFor(atRule) === 'visible');
  check('and the same for a 10 mm panel', gradeFor(arcminutesPerPixel(10, frontRowRuleM(10))) === 'visible');
}

console.log('\nHow much of the view the screen fills');
{
  near('a 10 m screen at 5 m fills 90 degrees', horizontalAngleDeg(10, 5), 90, 1e-9);
  near('a screen as wide as it is far fills 53.1 degrees', horizontalAngleDeg(6, 6), 53.13, 0.01);
  near('4 m at 30 m fills 7.6 degrees', horizontalAngleDeg(4, 30), 7.628, 0.001);
  check('a zero distance gives no angle rather than a crash', horizontalAngleDeg(4, 0) === 0);
  check('SMPTE EG-18 is carried as 30 degrees', SMPTE_MIN_ANGLE_DEG === 30);
}

console.log('\nA 2.6 mm wall, 4 x 2 m, audience from 5 m to 30 m');
{
  const v = viewingForLayer(layer(), { nearestM: 5, furthestM: 30 });

  near('the wall is 4 m across', v.widthM, 4, 1e-9);
  check('and 1536 px across', v.widthPx === 1536);
  near('pixels vanish at 8.9 m', v.acuityDistanceM, 8.938, 0.01);
  near('the front row sees 1.79 arcmin', v.near.arcminutesPerPixel, 1.7876, 0.001);
  check('which reads as clean', v.near.grade === 'clean');
  check('the back row is past the acuity limit', v.far.grade === 'beyond-acuity');
  near('the screen fills 43.6 degrees from the front', v.near.angleDeg, 43.6, 0.1);
  near('and 7.6 degrees from the back', v.far.angleDeg, 7.628, 0.01);
  near('458 of the 1536 pixels across are separable from the back', v.far.resolvablePixels, 458.4, 0.5);
  near('so the back of the room gets 30% of the detail', v.far.resolvedFraction, 0.2984, 0.001);
  check('the pitch is not finer than the front row needs', v.finerThanNeeded === false);

  check(
    'the note names the detail lost at the back',
    v.notes.some((n) => n.includes('1,536') && n.includes('30%')),
    JSON.stringify(v.notes)
  );
  check(
    'a viewer who can resolve every pixel is told nothing about detail',
    !viewingForLayer(layer(), { nearestM: 1, furthestM: 1 }).notes.some((n) => n.includes('of the detail'))
  );
  check(
    'and says the screen is under the SMPTE angle from there',
    v.notes.some((n) => n.includes('SMPTE EG-18')),
    JSON.stringify(v.notes)
  );
}

console.log('\nA pitch finer than anyone can see');
{
  const v = viewingForLayer(layer({ spec: { pixelPitch: 1.2 } }), { nearestM: 10, furthestM: 40 });
  check('the nearest viewer is already past the acuity limit', v.near.grade === 'beyond-acuity');
  check('so the money is flagged as spent on nothing', v.finerThanNeeded === true);
  near('2.9 mm would look the same from 10 m', v.pitchForNearestMm, 2.909, 0.001);
  check(
    'and the note says so with the pitch that would do',
    v.notes.some((n) => n.includes('2.9 mm')),
    JSON.stringify(v.notes)
  );
}

console.log('\nA pitch too coarse for the front row');
{
  const v = viewingForLayer(layer({ spec: { pixelPitch: 10 } }), { nearestM: 5, furthestM: 40 });
  near('a pixel subtends 6.88 arcmin at 5 m', v.near.arcminutesPerPixel, 6.876, 0.001);
  check('which is coarse', v.near.grade === 'coarse');
  check('it is not flagged as too fine', v.finerThanNeeded === false);
  check(
    'and the note offers both ways out: move back, or go finer',
    v.notes.some((n) => n.includes('34.4 m') && n.includes('1.5 mm')),
    JSON.stringify(v.notes)
  );

  // At arm's length the arithmetic asks for a pitch nobody makes, so quoting
  // it as an option would be advice you cannot act on.
  const onTop = viewingForLayer(layer(), { nearestM: 1, furthestM: 40 });
  check(
    'a fix finer than anything shipping is named as impossible, not offered',
    onTop.notes.some((n) => n.includes('finer than anything that ships')),
    JSON.stringify(onTop.notes)
  );
  check(
    'and the distance is given as the lever instead',
    onTop.notes.some((n) => n.includes('8.9 m')),
    JSON.stringify(onTop.notes)
  );
}

console.log('\nThings people type');
{
  const straight = viewingForLayer(layer(), { nearestM: 5, furthestM: 30 });
  const swapped = viewingForLayer(layer(), { nearestM: 30, furthestM: 5 });
  check(
    'nearest and furthest the wrong way round give the same answer',
    swapped.near.distanceM === straight.near.distanceM && swapped.far.distanceM === straight.far.distanceM
  );

  const onTop = viewingForLayer(layer(), { nearestM: 0.2, furthestM: 30 });
  check('standing closer than the wall can resolve caps the detail at 100%', onTop.near.resolvedFraction === 1);
  check('and still grades the pixels as coarse', onTop.near.grade === 'coarse');

  const same = viewingForLayer(layer(), { nearestM: 12, furthestM: 12 });
  check('one distance for the whole room is not an error', same.near.distanceM === 12 && same.far.distanceM === 12);
  check('and nothing is lost between front and back', same.far.resolvedFraction === same.near.resolvedFraction);
}

console.log('\nWhere the panel data is shaky');
{
  const v = viewingForLayer(layer({ spec: { derivedResolution: true } }), { nearestM: 5, furthestM: 30 });
  check(
    'a derived resolution is called out, because the pixel count is a guess',
    v.notes.some((n) => n.includes('derived')),
    JSON.stringify(v.notes)
  );
}

console.log('\nA whole project');
{
  const results = viewingForProject(
    [
      layer({ id: 'imag', name: 'IMAG left', spec: { pixelPitch: 3.9 } }),
      layer({ id: 'upstage', name: 'Upstage', spec: { pixelPitch: 2.6 } }),
    ],
    { nearestM: 8, furthestM: 45 }
  );
  check('every screen is read against the same room', results.length === 2);
  check('and keeps its own identity', results[0].layerId === 'imag' && results[1].layerName === 'Upstage');
  check(
    'the coarser panel needs more distance than the finer one',
    results[0].acuityDistanceM > results[1].acuityDistanceM
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
