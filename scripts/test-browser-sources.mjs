/**
 * The two sources that need a browser, and the run audit that decides whether
 * a scrape is fit to ship.
 *
 * No network: the tables below are what Chromium actually handed back from
 * Unilumin's and INFiLED's live pages on 2026-09-22, copied out cell for cell.
 * That is the point — these parsers exist to survive the exact punctuation
 * these two vendors use, and a paraphrase would not test it.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-browser-sources.mjs
 */
import { parseSpecTable } from './scraper/sources/unilumin.mjs';
import { parseSpecGrid } from './scraper/sources/infiled.mjs';
import { auditRun, countByBrand, implausible } from './scraper/index.mjs';
import { asciiRomanNumerals, dimsMm, localeNum } from './scraper/util.mjs';

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

const is = (name, actual, expected) =>
  check(name, Object.is(actual, expected), `(got ${actual}, wanted ${expected})`);

console.log('\nNumbers written in two conventions on one page');
{
  // INFiLED's AMT sheet carries all four of these, side by side.
  is('a comma decimal is a decimal', localeNum('5,95mm'), 5.95);
  is('a comma thousand is a thousand', localeNum('28,224 pixels/m2'), 28224);
  is('a dot thousand is a thousand', localeNum('14.400 pixels/㎡'), 14400);
  is('and so is one with a unit stuck to it', localeNum('7.680Hz'), 7680);
  is('a dot decimal is still a decimal', localeNum('20.4kg (44.97lb)'), 20.4);
  is('both separators: the last one decides', localeNum('1.234,5'), 1234.5);
  is('a bare number is left alone', localeNum('5000nits'), 5000);
  is('nothing numeric reads as nothing', localeNum('n/a'), null);
  // num() reads "8,09kg" as 809 and shipped a 20kg panel at 809kg until this
  // was used instead; the plausibility check below is the second net.
  is('the weight that started this', localeNum('8,09kg (17,83lb)'), 8.09);
}

console.log('\nDimensions with the imperial half in brackets');
{
  const d = dimsMm('1000x1000mm (39,37x39,37inch)');
  check('the metric pair is read', d.width === 1000 && d.height === 1000, JSON.stringify(d));
  is('and the inches are not mistaken for a depth', d.depth, null);
  const roe = dimsMm('500mm x 500mm x 90mm');
  check('a real depth still comes through', roe.depth === 90, JSON.stringify(roe));
}

console.log('\nUnilumin writes generations as Unicode Roman numerals');
{
  is('folded to ASCII', asciiRomanNumerals('UpadⅣ1.5'), 'UpadIV1.5');
  check(
    'so two generations no longer collide on one id',
    asciiRomanNumerals('UpadⅢ1.5') !== asciiRomanNumerals('UpadⅣ1.5')
  );
}

// ---------------------------------------------------------------------------

/** The spec table on https://unilumin.com/products/rental/upadpro-series.html */
const UPAD = [
  ['Model', 'UpadⅣ1.5', 'UpadⅣ1.9', 'UpadⅣ2'],
  ['Pixel Pitch', '1.5mm', '1.9mm', '2.6mm'],
  ['Brightness', '800cd/㎡', '800 cd/㎡', '1,200-1,500 cd/㎡'],
  ['Pixels Per Panel (W x H)', '320 x 320 dots', '256 × 256 dots', '192 × 192 dots'],
  ['Pixels Density', '409,600 pixels/m²', '262,144 pixels/m²', '147,456 pixels/m²'],
  ['Weight/Panel', '6.3 kg', '6.3 kg', '6.3 kg'],
  ['Module Size (W x H)', '250mm x 250mm', '250mm x 250mm', '250mm x 250mm'],
  [
    'Cabinet Size(W x H x D)',
    '500mm × 500mm × 70.1mm',
    '500mm × 500mm × 70.1mm',
    '500mm × 500mm × 70.1mm',
  ],
  ['Contrast Ratio', '4000:1/8000:1', '5000:01:00', '6000:1/8000:1'],
  ['Material', 'Die-cast Magnesium', 'Die-cast Magnesium', 'Die-cast Magnesium'],
  ['Maintenance', 'Front&Rear', 'Front&Rear', 'Front&Rear'],
  ['Environment', 'Indoor', 'Indoor', 'Indoor'],
];

/** The marketing table that sits above it on the same page. */
const MARKETING = [
  ['Parameter', 'U-shield', 'Traditional Lamp'],
  ['Brightness', '1600nits', '1200nits'],
  ['Viewing Angle', '170°', '160°'],
  ['Thrust', '13kg (130N)', '2.5kg(24.5N)'],
  ['Color Gamut', '96% DCI-P3', '90% DCI-P3'],
];

console.log('\nOne Unilumin page is a series, not a panel');
{
  const ctx = { series: 'UpadIV', sourceUrl: 'https://unilumin.com/products/rental/upadpro-series.html' };
  const found = parseSpecTable(UPAD, ctx);
  is('every column is a panel', found.length, 3);

  const [fine] = found;
  is('the model name is ASCII', fine.model, 'UpadIV1.5');
  is('ids are unique per panel', new Set(found.map((c) => c.id)).size, 3);
  is('pitch', fine.pixelPitch, 1.5);
  is('cabinet width', fine.cabinet.width, 500);
  is('cabinet depth', fine.cabinet.depth, 70.1);
  is('published resolution is used, not derived', fine.resolution.w, 320);
  is('so it is not flagged as a guess', fine.derivedResolution, undefined);
  is('weight', fine.weightKg, 6.3);
  is('brightness takes the low end of a range', fine.brightnessNits, 800);
  is('the Environment row decides indoor/outdoor', fine.environment, 'indoor');
  is('no power row means no power, not zero', fine.power, null);

  // 500 / 192 is 2.604, and Unilumin rounds it to 2.6 on a panel it calls "2".
  is('the coarse panel keeps the published pitch', found[2].pixelPitch, 2.6);
  is('and the × separator is read like an x', found[2].resolution.h, 192);

  check('a marketing comparison is not a spec table', parseSpecTable(MARKETING, ctx).length === 0);
  check('nor is an empty one', parseSpecTable([], ctx).length === 0);
}

console.log('\nUnilumin labels its power rows in either order');
{
  // The loose "power consumption" fallback matches both of these rows, so the
  // maximum has to be found by asking for "max" first rather than by position.
  const rows = [
    ['Model', 'X1', 'X2'],
    ['Pixel Pitch', '2.5mm', '2.5mm'],
    ['Cabinet Size(W x H x D)', '500mm × 500mm × 80mm', '500mm × 500mm × 80mm'],
    ['Pixels Per Panel (W x H)', '200 x 200', '200 x 200'],
    ['Average Power Consumption', '120W', '120W'],
    ['Max Power Consumption', '360W', '360W'],
  ];
  const [p] = parseSpecTable(rows, { series: 'X', sourceUrl: 'x' });
  is('the maximum is the maximum', p.power.max, 360);
  is('and the average is the average', p.power.avg, 120);
}

console.log('\nA Unilumin page that drops the Model row still names its panels');
{
  const noModelRow = UPAD.slice(1);
  const found = parseSpecTable(noModelRow, { series: 'UpadIV', sourceUrl: 'x' });
  is('one per column still', found.length, 3);
  is('named by series and pitch', found[0].model, 'UpadIV 1.5mm');
}

// ---------------------------------------------------------------------------

/** The spec panel on https://www.infiled.com/series/led-screen-hire-for-events-amt-series/ */
const AMT_LABELS = [
  'Downloads',
  'In / out',
  'Pixel pitch',
  'Physical density',
  'Led arrangement',
  'Module resolution (H/V)',
  'Module dimensions',
  'Cabinet resolution (H/V)',
  'Cabinet dimensions',
  'Cabinet weight',
  'Brightness',
  'Max power consumption (W/Panel)',
  'Avg power consumption (W/Panel)',
  'Viewing angle (H/V)',
  'Scan rate',
  'Operating power source',
  'Operating temperature',
  'Refresh rate',
  'Ip rating',
  'Transparency',
  'Signal input source',
  'Certifications',
];

const AMT_VALUES = [
  'Datasheet',
  'OUTDOOR',
  '5,95mm',
  '28,224 pixels/m2',
  '3-in-1 SMD',
  '84x42pixels',
  '500x250mm (23,62x9.84inch)',
  '168x168pixels',
  '1000x1000mm (39,37x39,37inch)',
  '20.4kg (44.97lb)',
  '5000nits',
  '720',
  '240',
  '160°/160°',
  '1/7',
  '100-240V AC 50/60Hz',
  '-20℃~+50℃',
  '7.680Hz',
  'IP65',
  '70%',
  'DVI. HDMI. DP. SDI',
  'CE.FCC.ETL. RoHS',
];

console.log('\nINFiLED publishes a label column and one slide per panel');
{
  const ctx = {
    series: 'AMT Series',
    sourceUrl: 'https://www.infiled.com/series/led-screen-hire-for-events-amt-series/',
  };
  const found = parseSpecGrid(
    {
      labels: AMT_LABELS,
      products: [
        { model: 'IL-RSS-ORAMT5.95', values: AMT_VALUES },
        // Swiper clones a slide to loop the carousel.
        { model: 'IL-RSS-ORAMT5.95', values: AMT_VALUES },
      ],
    },
    ctx
  );
  is('the carousel clone is not a second panel', found.length, 1);

  const [p] = found;
  is('pitch reads the comma as a decimal', p.pixelPitch, 5.95);
  is('cabinet is the cabinet, not the module', p.cabinet.width, 1000);
  is('cabinet resolution', p.resolution.h, 168);
  is('weight', p.weightKg, 20.4);
  is('brightness', p.brightnessNits, 5000);
  is('max power', p.power.max, 720);
  is('average power is kept separate', p.power.avg, 240);
  is('refresh reads the dot as a thousand', p.refreshHz, 7680);
  is('IP65 is outdoor', p.environment, 'outdoor');
  is('scan rate is passed through as written', p.scanRate, '1/7');

  check('an empty grid yields nothing', parseSpecGrid({ labels: [], products: [] }, ctx).length === 0);
  check(
    'and so does a slide whose values no longer line up',
    parseSpecGrid({ labels: AMT_LABELS, products: [{ model: 'X', values: ['Datasheet'] }] }, ctx)
      .length === 0
  );
}

// ---------------------------------------------------------------------------

console.log('\nFigures no cabinet has');
{
  const half = 0.25; // a 500 x 500 panel
  check('809kg on a half-square-metre panel is a parse bug', implausible({ weightKg: 809 }, half).includes('weightKg'));
  check('8.09kg on the same panel is fine', implausible({ weightKg: 8.09 }, half).length === 0);
  check('a missing weight is not a problem', implausible({ weightKg: null }, half).length === 0);
  check('5 nits is a parse bug', implausible({ brightnessNits: 5 }, half).includes('brightnessNits'));
  check('5000 nits is not', implausible({ brightnessNits: 5000 }, half).length === 0);
  check('a kilowatt on a half metre is', implausible({ power: { max: 4000 } }, half).includes('power'));
}

console.log('\nTelling a site rebuild from a bad afternoon');
{
  const previous = { 'ROE Visual': 74, Unilumin: 44 };

  check(
    'a clean run passes',
    auditRun({
      results: [{ brand: 'Unilumin', cabinets: 46, transportFailures: 0, shapeFailures: 0, pagesVisited: 46 }],
      previous,
    }).length === 0
  );

  const unreachable = auditRun({
    results: [{ brand: 'Unilumin', cabinets: 10, transportFailures: 34, shapeFailures: 0, pagesVisited: 44 }],
    previous,
  });
  check('a collapse is refused', unreachable.length > 0);
  check(
    'and it says the pages were unreachable, so the run was short rather than wrong',
    /34 pages were unreachable/.test(unreachable[0]),
    unreachable[0]
  );

  const moved = auditRun({
    results: [{ brand: 'Unilumin', cabinets: 0, transportFailures: 0, shapeFailures: 44, pagesVisited: 44 }],
    previous,
  });
  check('pages that load with no specs are refused too', moved.length === 1);
  check(
    'and that reads as the parser no longer matching',
    /no longer matches the site/.test(moved[0]),
    moved[0]
  );

  check(
    'a new brand with no history is not compared against nothing',
    auditRun({
      results: [{ brand: 'INFiLED', cabinets: 12, transportFailures: 0, shapeFailures: 0, pagesVisited: 12 }],
      previous,
    }).length === 0
  );

  // ...but it cannot collapse either, so a first run that only half happened
  // would otherwise ship as though it were the whole catalogue.
  const holes = auditRun({
    results: [{ brand: 'INFiLED', cabinets: 12, transportFailures: 20, shapeFailures: 0, pagesVisited: 32 }],
    previous,
  });
  check('a first run full of holes is refused', holes.length === 1);
  check('and says how much of the site it actually read', /20 of 32 pages never loaded/.test(holes[0]), holes[0]);

  check(
    'a couple of dead pages in a catalogue is not a hole',
    auditRun({
      results: [{ brand: 'INFiLED', cabinets: 30, transportFailures: 2, shapeFailures: 0, pagesVisited: 32 }],
      previous,
    }).length === 0
  );

  // A source that throws before it visits anything — no browser installed, an
  // index page that did not render — reports nothing at all, and a brand with
  // no history would otherwise sail through on zero.
  const never = auditRun({
    results: [{ brand: 'Unilumin', cabinets: 0, transportFailures: 0, shapeFailures: 0, pagesVisited: 0, fatal: 'no product links' }],
    previous: {},
  });
  check('a source that never ran is refused, history or not', never.length === 1);
  check('and says so in its own words', /did not run — no product links/.test(never[0]), never[0]);

  is(
    'counting by brand',
    countByBrand([{ brand: 'A' }, { brand: 'A' }, { brand: 'B' }]).A,
    2
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
