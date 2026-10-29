/**
 * The shared design system, as this app takes it.
 *
 *   1. src/ds/ holds what the design system's scripts/sync.mjs vendored,
 *      untouched since, and every `var(--ds-…)` the app reads is one
 *      tokens.css defines. Both are the design system's own checker,
 *      src/ds/ds-check.mjs, vendored with the rest: a hand edit there is a fix
 *      the design-system repo should get, and a misspelt role would fall back
 *      to nothing. Whether a copy is behind the published system is
 *      `npm run ds:check`, which warns rather than fails.
 *   2. src/ds holds the files this app takes.
 *   3. The app's stylesheet keeps its colours in the design system: outside
 *      the lines that say why they are not a token, globals.css has no literal
 *      colour, and its own names only point at roles.
 *   4. The vendored stylesheets load, and in the right order: the tokens,
 *      then base.css's page defaults, then the app's own globals.css, so the
 *      app's rules sit on top of the system's rather than under them.
 *   5. State is drawn from ARIA (states.md): no component sets an is-on,
 *      is-active or is-selected class for a state its aria-pressed,
 *      aria-checked, aria-current or aria-selected already carries.
 *
 *   node scripts/test-design-system.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main as dsCheck } from '../src/ds/ds-check.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DS = path.join(root, 'src', 'ds');

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
function* sources(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (p === DS) continue;
    if (fs.statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(css|tsx?)$/.test(name)) yield p;
  }
}

console.log('\nVendored copies, and the roles the app reads');
const said = [];
const code = await dsCheck(['src/ds', '--reads', 'src', '--offline'], { cwd: root, env: {}, log: (l) => said.push(l), warn: (l) => said.push(l) });
check('src/ds is as vendored and every var(--ds-…) read is defined (ds-check.mjs)', code === 0, `\n    ${said.join('\n    ')}`);
const vendored = fs.readdirSync(DS).sort();
const WANTED = ['base.css', 'ds-check.mjs', 'icons.d.ts', 'icons.js', 'tokens.css', 'tokens.d.ts', 'tokens.js'];
check(`src/ds holds ${WANTED.join(', ')}`, WANTED.every((f) => vendored.includes(f)), `(found ${vendored.join(', ')})`);

console.log('\nThe stylesheet');
const GLOBALS = path.join(root, 'src', 'app', 'globals.css');
const globals = fs.readFileSync(GLOBALS, 'utf8');
// Comments are blanked so a colour quoted in one is not counted; a line that
// carries `not a token:` is a deliberate exception, and says why.
const lines = globals.split('\n');
const blanked = globals.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).split('\n');
const literals = [];
let inPrint = false;
blanked.forEach((line, i) => {
  if (/@media print/.test(line)) inPrint = true;
  else if (inPrint && /^\}/.test(line)) inPrint = false;
  if (inPrint || /not a token:/.test(lines[i])) return;
  for (const c of line.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) ?? []) literals.push(`globals.css:${i + 1} ${c}`);
});
check('globals.css has no literal colour outside print and marked exceptions', literals.length === 0, `\n    ${literals.join('\n    ')}`);

console.log('\nLoad order');
const layout = fs.readFileSync(path.join(root, 'src', 'app', 'layout.tsx'), 'utf8');
const at = (spec) => layout.indexOf(`import '${spec}'`);
const order = ['../ds/tokens.css', '../ds/base.css', './globals.css'].map(at);
check('layout.tsx imports tokens.css, then base.css, then globals.css', order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2], `(positions ${order.join(', ')})`);

console.log('\nState from ARIA');
const stateClasses = [];
for (const file of sources(path.join(root, 'src', 'components'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/['"` ]is-(on|active|selected)\b/g)) stateClasses.push(`${path.relative(root, file)}: is-${m[1]}`);
}
check('no component draws a state with an is-on, is-active or is-selected class', stateClasses.length === 0, `\n    ${stateClasses.join('\n    ')}`);
const css = globals;
check('globals.css draws no state with an is-on, is-active or is-selected class', !/\.is-(on|active|selected)\b/.test(css));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
