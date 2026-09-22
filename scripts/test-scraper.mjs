/**
 * Scraper parsing, against the exact PDF text layouts that were getting it
 * wrong. No network: the glyph runs below are what pdfjs actually handed back
 * from Absen's spec sheets, copied out with their measured positions.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-scraper.mjs
 */
import { joinRow } from './scraper/sources/absen.mjs';
import { num } from './scraper/util.mjs';

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

const SIZE = 10.9;

/**
 * Build a row from `[text, width, gapBefore]`, where the gap is in multiples
 * of the font size — the unit the join actually decides on.
 */
function row(...runs) {
  let x = 0;
  return runs.map(([str, width, gap = 0]) => {
    x += gap * SIZE;
    const item = { x, width, size: SIZE, str };
    x += width;
    return item;
  });
}

console.log('\nNumbers the PDF broke into pieces');
{
  // JP5 Pro, page 3: "Brightness (nit)" then a 350-wide whitespace run, then
  // "50" and "00" sitting flush. Joining every run with a space made it 50.
  const brightness = row(['Brightness (nit)', 76.4], [' ', 350.2], ['50', 12], ['00', 12]);
  check('"50" + "00" rejoins as 5000', joinRow(brightness) === 'Brightness (nit) 5000', joinRow(brightness));
  check('and num() now reads the whole figure', num(joinRow(brightness).replace('Brightness (nit)', '')) === 5000);

  // JP5 Pro, page 6: the same number arrived in three pieces.
  const three = row(['Brightness (nit)', 76.4], [' ', 350.2], ['5', 6], ['0', 6], ['00', 12]);
  check('"5" + "0" + "00" rejoins too', joinRow(three) === 'Brightness (nit) 5000', joinRow(three));

  // The same bug quietly took a digit off depths and weights.
  const depth = row(['Panel Dimensions (WxHxD)/(mm)', 163.4], [' ', 199.2], ['500x500x10', 60], ['7', 6]);
  check('a split depth rejoins', joinRow(depth).endsWith('500x500x107'), joinRow(depth));
  const weight = row(['Panel Weight (kg)', 90], [' ', 300], ['5', 6], ['.5', 10]);
  check('and a split weight', joinRow(weight).endsWith('5.5'), joinRow(weight));
}

console.log('\nSpaces the PDF really did leave');
{
  // The widest thing these sheets use between a label and its value is an
  // explicit whitespace run, which survives on its own.
  const labelled = row(['Pixel Per Panel', 75.1], [' ', 339.9], ['192x192', 41.3]);
  check('label and value stay apart', joinRow(labelled) === 'Pixel Per Panel 192x192', joinRow(labelled));

  // SA1.9-C: a real gap of 0.094 of the font size and no whitespace run. It is
  // the narrowest real space in these sheets, so it is what the threshold has
  // to clear.
  const heading = row(['SA1.9-C', 45], ['(Brompton/NovaStar)', 100, 0.094], ['- Specifications', 80, 0.02]);
  check(
    'the narrowest real gap still reads as a space',
    joinRow(heading).startsWith('SA1.9-C (Brompton/NovaStar)'),
    joinRow(heading)
  );
}

console.log('\nRuns that overlap');
{
  // The wide leader runs overshoot the run after them, giving a negative gap.
  // Flush is flush either way; the leader's own space does the separating.
  const overlapping = row(['IP Rating (Front/Rear)', 107.1], [' ', 294.2], ['IP65/IP54', 46.5, -6.72]);
  check('a negative gap does not add a space', joinRow(overlapping) === 'IP Rating (Front/Rear) IP65/IP54', joinRow(overlapping));
}

console.log('\nOrdering and tidying');
{
  const scrambled = [
    { x: 100, width: 12, size: SIZE, str: '00' },
    { x: 0, width: 76.4, size: SIZE, str: 'Brightness (nit)' },
    { x: 88, width: 12, size: SIZE, str: '50' },
    { x: 76.4, width: 11.6, size: SIZE, str: ' ' },
  ];
  check('runs are read left to right whatever order they arrive in', joinRow(scrambled) === 'Brightness (nit) 5000', joinRow(scrambled));
  check('an empty row stays empty', joinRow([]) === '');
  check('runs of whitespace collapse', joinRow(row(['a', 5], ['   ', 20], ['b', 5])) === 'a b');
}

console.log('\nThe helper the parse depends on');
{
  check('num takes the first number it finds', num('5 000') === 5);
  check('which is exactly why the join has to be right', num('5000') === 5000);
  check('commas are handled', num('5,000') === 5000);
  check('nothing in, nothing out', num(null) === null && num('nits') === null);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
