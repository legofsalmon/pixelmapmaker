/**
 * Print one version's section of CHANGELOG.md.
 *
 * The release body used to be copied out of this file by hand — open the
 * changelog, find the heading, select down to the next one, paste it into the
 * form. That is the kind of job that stays done right up until the once it
 * does not, and the once it does not is the release that goes out with the
 * previous version's notes on it.
 *
 * CI reads the body from here instead, so a release cannot say something the
 * changelog does not. A version with no section, or a heading with nothing
 * under it, exits non-zero: better a failed build than an empty release.
 *
 *   node scripts/release-notes.mjs 0.3.0
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CHANGELOG = path.join(root, 'CHANGELOG.md');

/**
 * The body under `## <version>`, up to the next `## ` heading.
 *
 * The heading is matched whole rather than by prefix, so `0.3.0` does not
 * find `0.3.0-rc.1` and walk off with a pre-release's notes. Returns null
 * when there is no such heading, and also when there is one with nothing
 * under it — an empty section is a mistake, not a release with no news.
 */
export function sectionFor(markdown, version) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body || null;
}

/** The same, read off disk. */
export function notesFor(version, file = CHANGELOG) {
  return sectionFor(fs.readFileSync(file, 'utf8'), version);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/release-notes.mjs <version>');
    process.exit(2);
  }

  const notes = notesFor(version);
  if (!notes) {
    console.error(`CHANGELOG.md has no "## ${version}" section with anything under it.`);
    console.error('Write the notes there first — the release body is read from it.');
    process.exit(1);
  }

  process.stdout.write(`${notes}\n`);
}
