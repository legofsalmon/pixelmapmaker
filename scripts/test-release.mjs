/**
 * The two halves of the release path: the changelog reader CI cuts releases
 * from, and the bump that prepares one.
 *
 * Worth testing for a reason the other suites are not: this one decides what
 * a release says about itself, and a release body is wrong in public. The
 * last check is the useful one day to day — it fails `npm test` if the
 * version in package.json has no notes written for it, which is the mistake
 * that would otherwise be found by a release going out empty.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-release.mjs
 */
import fs from 'node:fs';
import { CHANGELOG, notesFor, sectionFor } from './release-notes.mjs';
import { compareVersions, promote } from './release.mjs';

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

const doc = [
  '# Changelog',
  '',
  '## Unreleased',
  '',
  '_Nothing yet._',
  '',
  '## 1.2.0',
  '',
  '- something happened',
  '- and something else',
  '',
  '## 1.1.0',
  '',
  '- older news',
  '',
].join('\n');

console.log('\nFinding a version');
{
  check('takes everything under the heading', sectionFor(doc, '1.2.0') === '- something happened\n- and something else');
  check('stops at the next version', !sectionFor(doc, '1.2.0').includes('older news'));
  check('reads the last section to the end of the file', sectionFor(doc, '1.1.0') === '- older news');
  check('trims the blank lines around it', !/^\n|\n$/.test(sectionFor(doc, '1.2.0')));
}

console.log('\nRefusing what is not there');
{
  check('a version with no section is null', sectionFor(doc, '9.9.9') === null);
  check('a heading with nothing under it is null', sectionFor(doc, 'Unreleased') !== null && sectionFor('## 3.0.0\n\n## 2.0.0\n\nx\n', '3.0.0') === null);
  check('the placeholder still counts as written', sectionFor(doc, 'Unreleased') === '_Nothing yet._');
}

console.log('\nMatching the heading whole');
{
  const pre = '## 0.3.0-rc.1\n\n- a candidate\n\n## 0.2.0\n\n- shipped\n';
  check('0.3.0 does not answer to 0.3.0-rc.1', sectionFor(pre, '0.3.0') === null);
  check('the pre-release finds its own notes', sectionFor(pre, '0.3.0-rc.1') === '- a candidate');
  const indented = '##  1.0.0\n\n- spaced heading\n';
  check('a heading that is not exactly "## x" is not a match', sectionFor(indented, '1.0.0') === null);
}

console.log('\nAgainst the real changelog');
{
  const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const notes = notesFor(version);
  check(`package.json is at ${version}, and the changelog has notes for it`, typeof notes === 'string' && notes.length > 0);
  check('read off disk, they match the file', notes === sectionFor(fs.readFileSync(CHANGELOG, 'utf8'), version));
  check('and they are more than a stub', (notes ?? '').length > 200, `(${(notes ?? '').length} characters)`);
}

console.log('\nOrdering versions');
{
  check('a patch is a step forward', compareVersions('0.3.1', '0.3.0') === 1);
  check('a minor outranks a patch', compareVersions('0.4.0', '0.3.9') === 1);
  check('ten is after nine, not before it', compareVersions('0.10.0', '0.9.0') === 1);
  check('the same version is neither', compareVersions('1.2.3', '1.2.3') === 0);
  check('and backwards is backwards', compareVersions('1.0.0', '2.0.0') === -1);
}

console.log('\nPromoting Unreleased');
{
  const next = promote(doc, '1.3.0', '- the new thing');
  check('the new version gets what was pending', sectionFor(next, '1.3.0') === '- the new thing');
  check('Unreleased is left empty for next time', sectionFor(next, 'Unreleased') === '_Nothing yet._');
  check('it lands above the previous release', next.indexOf('## 1.3.0') < next.indexOf('## 1.2.0'));
  check('and the older sections are untouched', sectionFor(next, '1.2.0') === sectionFor(doc, '1.2.0'));

  const real = promote(fs.readFileSync(CHANGELOG, 'utf8'), '0.99.0', '- from the real file');
  check('it works on the real changelog too', sectionFor(real, '0.99.0') === '- from the real file');
  check('without disturbing the shipped notes', sectionFor(real, '0.3.0') === notesFor('0.3.0'));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
