/**
 * The shared design system, as this app takes it.
 *
 *   1. src/ds/ holds only what the design system's scripts/sync.mjs vendored,
 *      untouched since. Each copy opens with a stamp: the version, the file,
 *      and a hash of everything after the stamp line. A hand edit there is a
 *      fix the design-system repo should get, and the next `npm run ds:sync`
 *      would silently drop it. Whether a copy is BEHIND the design system needs
 *      a checkout of that private repo (`npm run ds:check`); whether it was
 *      edited here does not, so CI holds this half.
 *   2. Every `var(--ds-…)` the app reads is one tokens.css defines, so a
 *      misspelt role cannot fall back to nothing without anyone noticing.
 *   3. The app's stylesheet keeps its colours in the design system: outside
 *      the lines that say why they are not a token, globals.css has no literal
 *      colour, and its own names only point at roles.
 *
 *   node scripts/test-design-system.mjs
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

console.log('\nVendored copies');
const vendored = fs.readdirSync(DS).sort();
check('src/ds holds tokens.css, tokens.js and tokens.d.ts', ['tokens.css', 'tokens.d.ts', 'tokens.js'].every((f) => vendored.includes(f)), `(found ${vendored.join(', ')})`);
for (const file of vendored) {
  const text = fs.readFileSync(path.join(DS, file), 'utf8');
  const newline = text.indexOf('\n');
  const stamp = /@letissier\/design-system (\S+) · (\S+) · sha256-([0-9a-f]{16}) · /.exec(text.slice(0, newline));
  if (!stamp) {
    check(`${file} carries the design system's stamp`, false, '(src/ds holds only what `npm run ds:sync` vendors)');
    continue;
  }
  const sum = createHash('sha256').update(text.slice(newline + 1)).digest('hex').slice(0, 16);
  check(`${file} is design-system ${stamp[1]} as vendored`, sum === stamp[3], '(edited by hand: make the change in the design-system repo, then `npm run ds:sync`)');
}

console.log('\nRoles the app reads');
const tokensCss = fs.readFileSync(path.join(DS, 'tokens.css'), 'utf8');
const defined = new Set([...tokensCss.matchAll(/^\s*(--ds-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
function* sources(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (p === DS) continue;
    if (fs.statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(css|tsx?)$/.test(name)) yield p;
  }
}
const unknown = [];
for (const file of sources(path.join(root, 'src'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/var\((--ds-[a-z0-9-]+)/g)) {
    if (!defined.has(m[1])) unknown.push(`${path.relative(root, file)}: ${m[1]}`);
  }
}
check('every var(--ds-…) read is defined by tokens.css', unknown.length === 0, `\n    ${unknown.join('\n    ')}`);

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
