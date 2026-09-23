/**
 * Three-phase supply and distro balancing, checked against the identities the
 * module claims to reproduce and against cases worked by hand.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-power.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const {
  DEFAULT_POWER,
  LEG_NAMES,
  SUPPLIES,
  balanceLoads,
  circuitsForProject,
  connectorFor,
  getSupply,
  imbalancePercent,
  legAmps,
  neutralAmps,
  planPower,
  serviceSizeFor,
  threePhaseLineAmps,
} = await import('../src/lib/power.ts');

const { DEFAULT_CABLING, cablingForProject } = await import('../src/lib/cabling.ts');

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

/**
 * A processor and a screen built by hand rather than from the library, so a
 * change to the scraped data or the processor list cannot quietly move a test.
 */
const processor = {
  id: 'test-processor',
  brand: 'Test',
  model: 'Box',
  ports: 8,
  portType: '1G',
  totalPixels: 4_000_000,
  maxCabinetsPerPort: null,
  sourceUrl: null,
};

function layer(overrides = {}) {
  const { spec: specOverrides = {}, ...rest } = overrides;
  return {
    id: 'test-layer',
    name: 'Test screen',
    cols: 8,
    rows: 4,
    signalStart: 'tl',
    signalPath: 'serpentine',
    spec: {
      pixelPitch: 2.6,
      cabinet: { width: 500, height: 500, depth: 80 },
      resolution: { w: 192, h: 192 },
      power: { max: 500, avg: 250 },
      ...specOverrides,
    },
    ...rest,
  };
}

/** The whole chain: cabling sizes the circuits, power spreads them over legs. */
function plan(layers, cabling = {}, power = {}) {
  const cablingSettings = { ...DEFAULT_CABLING, ...cabling };
  const runs = cablingForProject(layers, cablingSettings, processor);
  return planPower(layers, cablingSettings, runs, { ...DEFAULT_POWER, ...power });
}

console.log('\nThe supply table');
{
  for (const supply of SUPPLIES.filter((s) => s.legs === 3)) {
    // A wye's line-to-line volts are √3 times its line-to-neutral volts. The
    // table carries the nominal pairs the paperwork uses (400/230, 208/120,
    // 480/277), each within a percent of exact — a typo would be far wider.
    const exact = supply.phaseVolts * Math.sqrt(3);
    check(
      `${supply.label} is a √3 pair (${supply.phaseVolts} × √3 ≈ ${supply.lineVolts})`,
      Math.abs(exact - supply.lineVolts) / supply.lineVolts < 0.01,
      `(√3 × ${supply.phaseVolts} = ${exact.toFixed(1)})`
    );
  }
  for (const supply of SUPPLIES.filter((s) => s.legs === 1)) {
    check(
      `${supply.label} has one voltage, not two`,
      supply.lineVolts === supply.phaseVolts
    );
  }
  check(
    'every supply lists feed ratings smallest first',
    SUPPLIES.every((s) => s.serviceSizes.every((v, i, a) => i === 0 || a[i - 1] < v))
  );
  check('an unknown id falls back rather than throwing', getSupply('nonsense').id === SUPPLIES[0].id);
}

console.log('\nCurrent in one leg');
{
  // A cabinet is a line-to-neutral load, so its leg carries watts ÷ 230, not
  // anything involving √3.
  near('23 kW at 230 V is 100 A', legAmps(23_000, 230), 100, 0.001);
  near('12 kW at 120 V is 100 A', legAmps(12_000, 120), 100, 0.001);
  near(
    'a 0.95 power factor raises it by 5.3%',
    legAmps(23_000, 230, 0.95),
    105.263,
    0.001
  );
  check('a power factor of zero cannot divide by zero', Number.isFinite(legAmps(1000, 230, 0)));
}

console.log('\nThe √3 the trade quotes, and where it belongs');
{
  // P = √3 · V(L-L) · I is the balanced whole-service form. On a wye with
  // V(L-L) = √3 · V(L-N) it is the same current as a third of the load in one
  // leg — which is the point: the two must never disagree.
  const phase = 400 / Math.sqrt(3);
  near(
    'a third of the load in one leg equals the balanced line current',
    legAmps(90_000 / 3, phase),
    threePhaseLineAmps(90_000, 400),
    1e-9
  );
  near(
    'and on the nominal 400/230 pair they agree within half a percent',
    legAmps(90_000 / 3, 230),
    threePhaseLineAmps(90_000, 400),
    threePhaseLineAmps(90_000, 400) * 0.005
  );
  // The mistake this guards against: using √3 per leg understates by 42%.
  near(
    'using √3 on one leg would read 42% low',
    threePhaseLineAmps(23_000, 230) / legAmps(23_000, 230),
    1 / Math.sqrt(3),
    1e-9
  );
}

console.log('\nWhat comes back down the neutral');
{
  near('three equal legs cancel', neutralAmps(60, 60, 60), 0, 1e-9);
  near('one leg loaded returns the whole of it', neutralAmps(60, 0, 0), 60, 1e-9);
  near('two equal legs return one leg s worth', neutralAmps(60, 60, 0), 60, 1e-9);
  // √(100² + 50² − 100 × 50) = √7500 = 86.6
  near('100 A and 50 A return 86.6 A', neutralAmps(100, 50, 0), 86.603, 0.001);
  near('a small imbalance returns a small current', neutralAmps(62, 60, 58), 3.464, 0.001);
  check('it is never negative', neutralAmps(0, 0, 0) === 0);
}

console.log('\nHow far apart the legs are');
{
  near('three equal legs are level', imbalancePercent([100, 100, 100]), 0, 1e-9);
  // Mean 100, worst deviation 20.
  near('120 / 90 / 90 is 20% out', imbalancePercent([120, 90, 90]), 20, 1e-9);
  near('one leg carrying everything is 200% out', imbalancePercent([300, 0, 0]), 200, 1e-9);
  check('a single leg cannot be unbalanced', imbalancePercent([500]) === 0);
  check('nothing loaded is not an imbalance', imbalancePercent([0, 0, 0]) === 0);
}

console.log('\nDealing circuits onto legs');
{
  check(
    'three equal circuits go one to a leg',
    JSON.stringify(balanceLoads([10, 10, 10], 3)) === JSON.stringify([0, 1, 2])
  );
  // Heaviest first: 30 to L1, then the three 10s to whichever leg is lightest.
  check(
    'a heavy circuit is placed first and the rest fill in around it',
    JSON.stringify(balanceLoads([30, 10, 10, 10], 3)) === JSON.stringify([0, 1, 2, 1]),
    JSON.stringify(balanceLoads([30, 10, 10, 10], 3))
  );
  {
    const loads = [8, 7, 6, 5, 4];
    const legs = balanceLoads(loads, 3);
    const totals = [0, 0, 0];
    loads.forEach((load, i) => (totals[legs[i]] += load));
    // 8, 7+4, 6+5 — greedy, so not the perfect 10 / 10 / 10 that hindsight
    // finds. That is the trade: LPT is never worse than 4/3 of the perfect
    // split, and a rearranging patch sheet costs more than the extra amp.
    check('30 split five ways lands 8 / 11 / 11', JSON.stringify(totals) === JSON.stringify([8, 11, 11]), JSON.stringify(totals));
    check('inside the 4/3 bound greedy guarantees', Math.max(...totals) <= (30 / 3) * (4 / 3));
  }
  check(
    'the same project balances the same way twice',
    JSON.stringify(balanceLoads([5, 5, 9, 2, 7], 3)) === JSON.stringify(balanceLoads([5, 5, 9, 2, 7], 3))
  );
  check(
    'a single-phase supply puts everything on the one leg',
    balanceLoads([10, 20, 30], 1).every((leg) => leg === 0)
  );
  check('nothing to place is not an error', balanceLoads([], 3).length === 0);
}

console.log('\nSizing the feed');
{
  const iec = getSupply('three-400');
  check('44 A wants a 63 A feed', serviceSizeFor(44, iec) === 63);
  check('exactly 63 A still fits 63 A', serviceSizeFor(63, iec) === 63);
  check('64 A steps up to 125 A', serviceSizeFor(64, iec) === 125);
  check('past the biggest stocked size there is nothing to offer', serviceSizeFor(400, iec) === null);
  check('63 A is a 5-pin', connectorFor(63, iec) === '63 A 5-pin');
  check('16 A is the smallest 5-pin', connectorFor(9, iec) === '16 A 5-pin (IEC 60309)');
  check(
    'past the biggest connector it names the biggest anyway',
    connectorFor(500, iec) === '125 A 5-pin'
  );
}

console.log('\nA wall on a three-phase service');
{
  // 32 cabinets at 500 W max is 16 kW. DEFAULT_CABLING allows 230 × 16 × 0.8 =
  // 2944 W a circuit, so 5 cabinets each: seven circuits, the last one short.
  const p = plan([layer()]);
  check('the circuits are counted one at a time', p.circuits === 7, `(got ${p.circuits})`);
  near('and they add up to the whole wall', p.totalMaxW, 16_000, 1e-9);
  near('average draw comes through too', p.totalAvgW, 8000, 1e-9);
  check('nothing is left unaccounted for', p.incomplete === false && p.unknown.length === 0);

  const legTotal = p.legs.reduce((a, l) => a + l.maxW, 0);
  near('every watt lands on a leg', legTotal, p.totalMaxW, 1e-9);
  check('on three legs', p.legs.length === 3);
  check('named L1, L2, L3', p.legs.map((l) => l.name).join(',') === LEG_NAMES.join(','));

  // Six circuits of 2500 W and one of 1000 W: 6000 / 6000 / 4000 is the best
  // split, so the worst leg is 6 kW ÷ 230 V.
  near('the worst leg draws 26.1 A', p.worstLegAmps, 6000 / 230, 0.01);
  near('a perfect split would be 23.2 A', p.balancedAmps, 16_000 / 3 / 230, 0.01);
  // Six circuits of 2500 W and one of 1000 W cannot divide evenly, so 12.5%
  // apart is the closest split there is — not something to warn about.
  near('the legs come out 12.5% apart', p.imbalancePercent, 12.5, 0.01);
  check('which is the best there is, so nothing is flagged', p.warnings.length === 0, JSON.stringify(p.warnings));
  near('the neutral carries the difference', p.neutralAmps, neutralAmps(...p.legs.map((l) => l.amps)), 1e-9);
  check('the neutral is not zero, because the legs are not equal', p.neutralAmps > 1);

  check('a 32 A feed holds 26 A', p.recommendedService === 32, `(got ${p.recommendedService})`);
  check('on a 32 A 5-pin', p.connector === '32 A 5-pin');
  check('and the 63 A default is not stretched', p.overService === false);
  near('using a third of the feed', p.legs[0].utilisation, p.legs[0].amps / 63, 1e-9);
}

console.log('\nThe distro patch');
{
  const p = plan([layer()], {}, { waysPerDistro: 4 });
  check('every circuit gets a way', p.ways.length === p.circuits);
  check('seven ways over four-way distros is two distros', p.distros === 2);
  check('ways are numbered within their own distro', p.ways[4].distro === 2 && p.ways[4].way === 1);
  check(
    'and rotate through the legs the way a distro is wired',
    p.ways.slice(0, 3).map((w) => w.leg).join(',') === 'L1,L2,L3',
    p.ways.map((w) => w.leg).join(',')
  );
  check(
    'each way carries the circuit its leg was given',
    p.ways.every((w) => p.legs.find((l) => l.name === w.leg).circuits.includes(w.circuit))
  );
  check('and says where it comes from', p.ways[0].circuit.layerName === 'Test screen');
}

console.log('\nA panel that publishes no power');
{
  const p = plan([layer({ spec: { power: null } })]);
  check('its circuits cannot be balanced', p.unknown.length === p.circuits);
  check('and the plan says so rather than reading zero', p.incomplete === true);
  near('no leg carries anything', p.legs.reduce((a, l) => a + l.maxW, 0), 0, 1e-9);
  check(
    'with a warning that names the gap',
    p.warnings.some((w) => w.includes('publish no power')),
    JSON.stringify(p.warnings)
  );
}

console.log('\nWhen the service is too small');
{
  // Ten screens of 32 cabinets at 500 W is 160 kW — 232 A a leg balanced.
  const layers = Array.from({ length: 10 }, (_, i) =>
    layer({ id: `screen-${i}`, name: `Screen ${i + 1}` })
  );
  const p = plan(layers, {}, { serviceAmpsPerLeg: 63 });
  check('the legs are called overloaded', p.legs.every((l) => l.overloaded));
  check('and the plan is', p.overService === true);
  check(
    'with a warning that names the feed',
    p.warnings.some((w) => w.includes('63 A feed')),
    JSON.stringify(p.warnings)
  );
  check('nothing stocked would hold it', p.recommendedService === null);
  check('utilisation goes past 1 rather than clamping', p.legs[0].utilisation > 3);
}

console.log('\nToo few circuits to balance');
{
  // One screen of two cabinets is one circuit, which can only sit on one leg.
  const p = plan([layer({ cols: 2, rows: 1 })]);
  check('one circuit means one loaded leg', p.legs.filter((l) => l.maxW > 0).length === 1);
  near('200% out, by definition', p.imbalancePercent, 200, 1e-9);
  check(
    'and it says why rather than just reporting the number',
    p.warnings.some((w) => w.includes('too few or too unequal')),
    JSON.stringify(p.warnings)
  );
  near('the neutral carries the full leg current', p.neutralAmps, p.worstLegAmps, 1e-9);
}

console.log('\nSingle phase');
{
  const p = plan([layer()], {}, { supplyId: 'single-230' });
  check('there is one leg', p.legs.length === 1);
  check('called what it is', p.legs[0].name === 'Single phase');
  near('carrying the whole wall', p.legs[0].maxW, 16_000, 1e-9);
  near('at 69.6 A', p.legs[0].amps, 16_000 / 230, 0.01);
  check('there is no neutral figure to give', p.neutralAmps === null);
  check('and no imbalance to report', p.imbalancePercent === 0);
  check('every way sits on the one leg', p.ways.every((w) => w.leg === 'Single phase'));
}

console.log('\nA circuit bigger than its breaker');
{
  // Manual mode takes the user's figure without sizing it: 20 cabinets at
  // 500 W is 10 kW, or 43 A, well past the 16 A branch breaker.
  const p = plan([layer({ cols: 10, rows: 2 })], {
    mode: 'manual',
    cabinetsPerPowerRun: 20,
  });
  check(
    'it is called out against the breaker size',
    p.warnings.some((w) => w.includes('16 A branch breaker')),
    JSON.stringify(p.warnings)
  );
}

console.log('\nA supply the circuits were not sized for');
{
  // Circuits sized at 230 V, then read on a 208/120 V service: the same run of
  // panels now pulls nearly twice the current per way.
  const p = plan([layer()], {}, { supplyId: 'three-208' });
  check(
    'the mismatch is named rather than quietly applied',
    p.warnings.some((w) => w.includes('sized at 230 V')),
    JSON.stringify(p.warnings)
  );
}

console.log('\nAn empty project');
{
  const p = plan([]);
  check('no circuits', p.circuits === 0);
  check('no distros to hire', p.distros === 0);
  check('no ways', p.ways.length === 0);
  near('nothing drawn', p.worstLegAmps, 0, 1e-9);
  check('and the smallest feed would do', p.recommendedService === 16);
}

console.log('\nCircuits carry their screen with them');
{
  const layers = [
    layer({ id: 'imag-l', name: 'IMAG left' }),
    layer({ id: 'upstage', name: 'Upstage', cols: 4, rows: 2 }),
  ];
  const runs = cablingForProject(layers, DEFAULT_CABLING, processor);
  const circuits = circuitsForProject(layers, runs, 1, 230);
  check('one entry per circuit across the project', circuits.length === runs.powerRuns);
  check('each knowing its screen', circuits.some((c) => c.layerName === 'Upstage'));
  check('with unique ids', new Set(circuits.map((c) => c.id)).size === circuits.length);
  near(
    'and the cabinets adding back up to the wall',
    circuits.reduce((a, c) => a + c.cabinets, 0),
    32 + 8,
    1e-9
  );
  check('no circuit is empty', circuits.every((c) => c.cabinets > 0));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
