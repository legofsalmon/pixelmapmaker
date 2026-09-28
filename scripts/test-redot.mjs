/**
 * The REDOT source, against the markup redotled.com actually serves.
 *
 * No network: the fragments below were copied out of the live pages on
 * 2026-09-28, punctuation intact. That is the point — an en-dash in the curve
 * rating, a comma inside a brightness figure and a mobile copy of the spec
 * list are exactly the things a rewrite would tidy away and the site will not.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-redot.mjs
 */
import {
  SIZE_TOLERANCE,
  brand,
  curveLimit,
  field,
  modelNames,
  pitchMm,
  seriesFrom,
  sizeDisagrees,
  specPairs,
} from './scraper/sources/redot.mjs';
import { dimsMm, num, resolution } from './scraper/util.mjs';

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

/** The RC-i1.5 spec list, as served. */
const RC_I15 = `
<ul class="proDet1Pro-list mt30 fs14 fw7 flex white">
<li>				LED configuration			</li>
<li>				4in1 common cathode			</li>
<li>				Pixel Pitch			</li>
<li>				1.56mm			</li>
<li>				Cabinet Resolution			</li>
<li>				320x320			</li>
<li>				LED Cabinet Size(WxHxD)			</li>
<li>				500x500x73mm			</li>
<li>				Max. Brightness Calibrated			</li>
<li>				1,200nits			</li>
<li>				Cabinet Weight			</li>
<li>				4.95kg			</li>
<li>				Curving			</li>
<li>				+5 or -5°			</li>
<li>				IP Rate(Front&amp;Rear)			</li>
<li>				indoor			</li>
<li>				Refresh Rate			</li>
<li>				7680Hz			</li>
<li>				Power Consumption, Maximum (watts)			</li>
<li>				126w/cabinet |504W/sqm			</li>
<li>				Power Consumption, Typical (watts)			</li>
<li>				63w/cabinet |252W/sqm			</li>
</ul>`;

/** The same page's narrower copy of the list, which carries fewer rows. */
const SHORT_COPY = `
<ul class="proDet1Pro-list mobile">
<li>Pixel Pitch</li><li>1.56mm</li>
</ul>`;

console.log('\nReading the spec list');
{
  const pairs = specPairs(RC_I15);
  check('it finds every pair', pairs.size === 11, `(${pairs.size})`);
  check('labels keep their wording', pairs.has('LED Cabinet Size(WxHxD)'));
  check('entities are decoded', [...pairs.keys()].some((k) => k.includes('Front&Rear')));
  check('the tab-indented values are trimmed', pairs.get('Pixel Pitch') === '1.56mm');
  check('a missing label reads as nothing', field(pairs, 'scan rate') === null);
  check('a label can be found loosely', field(pairs, 'cabinet size') === '500x500x73mm');
  check('the first matching spelling wins', field(pairs, 'nothing here', 'refresh') === '7680Hz');
}

console.log('\nTwo copies of the list on one page');
{
  const both = specPairs(`${SHORT_COPY}${RC_I15}`);
  check('the longer copy is the one read', both.size === 11, `(${both.size})`);
  const reversed = specPairs(`${RC_I15}${SHORT_COPY}`);
  check('and order on the page does not decide it', reversed.size === 11, `(${reversed.size})`);
}

console.log('\nThe values the app needs');
{
  const pairs = specPairs(RC_I15);
  const cabinet = dimsMm(field(pairs, 'cabinet size'));
  const res = resolution(field(pairs, 'cabinet resolution'));
  check('cabinet size in millimetres', cabinet.width === 500 && cabinet.height === 500 && cabinet.depth === 73);
  check('resolution', res.w === 320 && res.h === 320);
  check('weight', num(field(pairs, 'cabinet weight')) === 4.95);
  check('brightness reads through the comma', num(field(pairs, 'brightness')) === 1200);
  check('power takes the per-cabinet figure, not the per-square-metre one',
    num(field(pairs, 'power consumption, maximum')) === 126);
  check('and typical is its own row', num(field(pairs, 'power consumption, typical')) === 63);
}

console.log('\nPitch, and the panels that have two');
{
  check('a plain pitch', pitchMm('1.56mm') === 1.56);
  check('quoted per axis but equal', pitchMm('3.91mm(H) 3.91mm(V)') === 3.91);
  check('genuinely non-square is refused', pitchMm('3.9mm(H) 7.8mm(V)') === null);
  check('the other way round too', pitchMm('7.8mm(H) 3.9mm(V)') === null);
  check('nothing at all is nothing', pitchMm('') === null && pitchMm(null) === null);
  check('a lone axis still reads', pitchMm('2.6mm(H)') === 2.6);
}

console.log('\nThe bend rating');
{
  check('a plain ASCII pair', curveLimit('+5 or -5°') === 5);
  check('the en-dash the site actually uses', curveLimit('+ 10 or – 10°') === 10);
  check('two ratings take the tighter one', curveLimit('+ 10 or – 10°,+ 5 or – 5°') === 5);
  check('no rating is null, not zero', curveLimit('') === null && curveLimit(null) === null);
  check('a flat panel is not read as a bend of nothing', curveLimit('N/A') === null);
}

console.log('\nCatching a size that cannot be right');
{
  // Rounded pitches never divide exactly; 320 x 1.56 is 499.2 against 500.
  check('a rounded pitch is not a mismatch',
    sizeDisagrees({ width: 500, height: 500 }, { w: 320, h: 320 }, 1.56) === null);
  check('nor is 256 x 3.91 against a metre',
    sizeDisagrees({ width: 1000, height: 1000 }, { w: 256, h: 256 }, 3.91) === null);
  check('a digit typed twice is',
    sizeDisagrees({ width: 1000, height: 5000 }, { w: 256, h: 64 }, 7.8) !== null);
  const off = sizeDisagrees({ width: 1000, height: 5000 }, { w: 256, h: 64 }, 7.8);
  check('and it says which way it is out', off.down > 80, `(${off.down}%)`);
  check('missing figures are not a mismatch',
    sizeDisagrees(null, { w: 1, h: 1 }, 1) === null && sizeDisagrees({ width: 1, height: 1 }, null, 1) === null);
  check('the tolerance is loose enough for rounding, tight enough for typos',
    SIZE_TOLERANCE > 0.01 && SIZE_TOLERANCE < 0.2);
}

console.log('\nModel names off the menu');
{
  const menu = `
    <a href="/Indoor-fine-pitch/142.html" class="item">RC-i1.5</a>
    <a href="/Indoor-series/203.html" class="item">RC-iL2.6</a>
    <a href="/Indoor-fine-pitch/142.html" class="other">RC-i1.5 fine pitch panel</a>
    <a href="/about">About Us</a>`;
  const names = modelNames(menu);
  check('each product path gets its model', names.get('/Indoor-fine-pitch/142.html') === 'RC-i1.5');
  check('a second link does not overwrite the first', names.size === 2);
  check('non-product links are ignored', !names.has('/about'));
}

console.log('\nSeries from the path');
{
  check('the suffix goes', seriesFrom('/Indoor-series/203.html') === 'Indoor');
  check('hyphens become spaces', seriesFrom('/Indoor-fine-pitch/142.html') === 'Indoor fine pitch');
  check('a folder that is not a series is left alone', seriesFrom('/Holo-series/143.html') === 'Holo');
  check('the brand is spelt the way REDOT spells it', brand === 'REDOT');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
