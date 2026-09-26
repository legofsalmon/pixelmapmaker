/**
 * Prepare a release: move what is under `## Unreleased` to its own version
 * heading, and set that version in package.json and package-lock.json.
 *
 *   npm run release -- 0.4.0
 *
 * It stops there rather than committing. Pushing is the thing that publishes
 * — CI releases whatever version main names once the checks pass — so the
 * last look at the diff belongs to a person, not to this script.
 *
 * Everything it refuses, it refuses before writing anything: a version that
 * goes backwards, one already in the changelog, or an Unreleased section with
 * nothing in it. Half-applied is the one state worth engineering against,
 * because it leaves the two files disagreeing about what is being shipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sectionFor } from './release-notes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = (name) => path.join(root, name);

const PLACEHOLDER = '_Nothing yet._';

const die = (...lines) => {
  for (const line of lines) console.error(line);
  process.exit(1);
};

/** -1, 0 or 1, comparing release versions numerically part by part. */
export function compareVersions(a, b) {
  const parts = (v) => v.split('.').map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/**
 * The changelog with `version` split out of Unreleased.
 *
 * Unreleased is left behind holding the placeholder, so the file is ready for
 * the next change rather than missing the heading the next release needs.
 */
export function promote(markdown, version, body) {
  const heading = `## ${version}`;
  return markdown.replace(
    /^## Unreleased\n[\s\S]*?(?=\n## )/m,
    `## Unreleased\n\n${PLACEHOLDER}\n\n${heading}\n\n${body}\n`
  );
}

function main(version) {
  if (!version) die('Usage: npm run release -- <version>', 'For example: npm run release -- 0.4.0');
  if (!/^\d+\.\d+\.\d+$/.test(version)) die(`"${version}" is not a version like 0.4.0.`);

  const pkg = JSON.parse(fs.readFileSync(file('package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(file('package-lock.json'), 'utf8'));
  const changelog = fs.readFileSync(file('CHANGELOG.md'), 'utf8');

  if (compareVersions(version, pkg.version) <= 0) {
    die(`package.json is already at ${pkg.version}, so ${version} is not a step forward.`);
  }
  if (sectionFor(changelog, version)) {
    die(`CHANGELOG.md already has a "## ${version}" section.`);
  }

  const pending = sectionFor(changelog, 'Unreleased');
  if (!pending || pending === PLACEHOLDER) {
    die(
      'Nothing is written under "## Unreleased" in CHANGELOG.md.',
      'Write what changed there first — it becomes the release body.'
    );
  }

  const next = promote(changelog, version, pending);
  if (!sectionFor(next, version)) {
    die('Could not move the Unreleased section — is the "## Unreleased" heading still there?');
  }

  pkg.version = version;
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;

  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(file('CHANGELOG.md'), next);
  fs.writeFileSync(file('package.json'), json(pkg));
  fs.writeFileSync(file('package-lock.json'), json(lock));

  console.log(`Prepared ${version}. Three files changed:`);
  console.log('  CHANGELOG.md        Unreleased moved under its own heading');
  console.log('  package.json        version bumped');
  console.log('  package-lock.json   version bumped');
  console.log('\nRead the diff, then:');
  console.log(`  git commit -am "Release ${version}" && git push`);
  console.log('\nCI cuts the tag and the GitHub release once the checks pass.');
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) main(process.argv[2]);
