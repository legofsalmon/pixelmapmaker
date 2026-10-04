/**
 * How long a recording has to be to come back to where it started.
 *
 * Recording past one loop adds file and no video — the frames after it are
 * the frames before it. The maths is small, and wrong in two directions:
 * too short and the loop visibly jumps, too long and a 4K export takes
 * minutes to write something nobody needed.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-loop-length.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const { loopSeconds, patternLoopSeconds, EFFECT_LABELS } = await import('../src/lib/effects.ts');

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

const effect = (over = {}) => ({
  kind: 'scan', direction: 'left-right', color: '#ffffff',
  speed: 0.25, thickness: 0.1, opacity: 1, ...over,
});

console.log('\nOne loop of the pattern');
{
  check('a quarter of a loop a second is four seconds', patternLoopSeconds(effect({ speed: 0.25 })) === 4);
  check('one a second is one second', patternLoopSeconds(effect({ speed: 1 })) === 1);
  check('two a second is half', patternLoopSeconds(effect({ speed: 2 })) === 0.5);
  check('a still pattern has no loop', patternLoopSeconds(effect({ kind: 'none' })) === null);
  check('and neither does a stopped one', patternLoopSeconds(effect({ speed: 0 })) === null);
}

console.log('\nEvery pattern loops on the same clock');
{
  // They all read `phase`, so the kind cannot change the period. If one ever
  // stops doing that, this is where it shows up.
  const kinds = EFFECT_LABELS.map((e) => e.value).filter((k) => k !== 'none');
  check(`all ${kinds.length} of them`, kinds.every((kind) => patternLoopSeconds(effect({ kind, speed: 0.4 })) === 2.5));
}

console.log('\nWithout a turning centre image');
{
  const r = loopSeconds(effect({ speed: 0.5 }), { spinning: false });
  check('it is simply one loop', r.seconds === 2 && r.loops === 1);
  check('and exact', r.exact === true);
  check('a still pattern records nothing on its own', loopSeconds(effect({ kind: 'none' })).seconds === null);
}

console.log('\nWith one turning');
{
  // 4s loop against a 12s turn: three loops is one turn.
  const r = loopSeconds(effect({ speed: 0.25 }), { spinning: true, turnSeconds: 12 });
  check('it waits for both', r.seconds === 12 && r.loops === 3, `(${r.seconds}s, ${r.loops} loops)`);
  check('exactly', r.exact === true);
  check('and says so', /3 loops .* 1 turn/.test(r.why), r.why);

  // 12s loop and a 12s turn: one of each.
  const same = loopSeconds(effect({ speed: 1 / 12 }), { spinning: true, turnSeconds: 12 });
  check('a pattern already matching the turn needs one loop', same.loops === 1 && same.seconds === 12);

  // 6s loop: two loops to one turn.
  const half = loopSeconds(effect({ speed: 1 / 6 }), { spinning: true, turnSeconds: 12 });
  check('a half-turn loop needs two', half.loops === 2 && half.seconds === 12);
}

console.log('\nWhen the two never meet inside a sensible length');
{
  // 1/0.37 is 2.70s; against 12s the two first agree at 111 loops, five
  // minutes in, so inside any sensible cap they never do.
  const r = loopSeconds(effect({ speed: 0.37 }), { spinning: true, turnSeconds: 12, cap: 30 });
  check('the pattern wins', Math.abs(r.seconds - 1 / 0.37) < 1e-9, `(${r.seconds})`);
  check('and it admits the image will jump', r.exact === false);
  check('saying why', /will not come round/.test(r.why), r.why);
  check('rather than recording minutes nobody asked for', r.seconds < 30);

  // 0.35 does meet, at exactly 60s — but a minute of 4K to keep a spinning
  // logo in step is not a trade worth making, so the cap refuses it.
  const absurd = loopSeconds(effect({ speed: 0.35 }), { spinning: true, turnSeconds: 12 });
  check('an exact match past the cap is refused too', absurd.exact === false && absurd.seconds < 30,
    `(${absurd.seconds}s, exact ${absurd.exact})`);
}

console.log('\nThe cap is respected');
{
  const r = loopSeconds(effect({ speed: 1 / 50 }), { spinning: true, turnSeconds: 12, cap: 60 });
  check('a 50s loop is not multiplied past the cap', r.seconds === 50 && r.exact === false, `(${r.seconds})`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
