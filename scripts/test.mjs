/**
 * Run every `scripts/test-*.mjs` in turn.
 *
 * This exists because `npm test` pointed at one file by name, and three
 * branches adding a test suite each rewrote that line to point at their own —
 * so whichever landed last would have silently stopped running the others'.
 * Finding the files is the fix: a new suite is picked up by being named, and
 * nothing has to be registered anywhere.
 *
 *   node scripts/test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = fs
  .readdirSync(here)
  .filter((name) => /^test-.+\.mjs$/.test(name))
  .sort();

if (!files.length) {
  console.error('No scripts/test-*.mjs files found.');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  console.log(`\n── ${file}`);
  const run = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', path.join(here, file)],
    { stdio: 'inherit' }
  );
  if (run.status !== 0) failed += 1;
}

if (failed) {
  console.error(`\n${failed} of ${files.length} test files failed.\n`);
  process.exit(1);
}
console.log(`\n${files.length} test file${files.length === 1 ? '' : 's'} passed.\n`);
