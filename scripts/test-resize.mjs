/**
 * Dragging a corner handle to add and remove cabinets.
 *
 * The maths is small but every part of it is a place to be subtly wrong: the
 * anchor moving when it should not, a west drag growing the wrong way, a
 * rounding that loses the last cabinet. Those are all invisible in code review
 * and obvious the moment someone drags a wall, so they are checked here rather
 * than by eye.
 *
 *   node --experimental-strip-types --no-warnings scripts/test-resize.mjs
 */
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

const {
  HANDLES,
  MAX_CABINETS,
  anchorFor,
  clampCabinets,
  handleAtPoint,
  handlePoint,
  layerRect,
  resizeFromAnchor,
} = await import('../src/lib/geometry.ts');

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

/** A plain 8 x 4 screen of 192 x 192 px cabinets, at the origin. */
function layer(overrides = {}) {
  const { spec: specOverrides = {}, ...rest } = overrides;
  return {
    id: 'test-layer',
    name: 'Test screen',
    cols: 8,
    rows: 4,
    x: 0,
    y: 0,
    signalStart: 'tl',
    signalPath: 'serpentine',
    spec: {
      pixelPitch: 2.6,
      cabinet: { width: 500, height: 500, depth: 80 },
      resolution: { w: 192, h: 192 },
      maxCurveAngle: null,
      ...specOverrides,
    },
    ...rest,
  };
}

/** Drag `handle` to `point`, with the anchor taken from the layer as it is. */
const drag = (l, handle, point) => resizeFromAnchor(l, handle, anchorFor(layerRect(l), handle), point);

console.log('\nWhere the handles are');
{
  const rect = layerRect(layer()); // 1536 x 768
  check('nw is the top left', JSON.stringify(handlePoint(rect, 'nw')) === JSON.stringify({ x: 0, y: 0 }));
  check('se is the bottom right', JSON.stringify(handlePoint(rect, 'se')) === JSON.stringify({ x: 1536, y: 768 }));
  check('ne is across the top', JSON.stringify(handlePoint(rect, 'ne')) === JSON.stringify({ x: 1536, y: 0 }));
  check('sw is down the left', JSON.stringify(handlePoint(rect, 'sw')) === JSON.stringify({ x: 0, y: 768 }));
  check('every handle is a corner of the rect', HANDLES.every((h) => {
    const p = handlePoint(rect, h);
    return (p.x === rect.x || p.x === rect.x + rect.width) && (p.y === rect.y || p.y === rect.y + rect.height);
  }));
}

console.log('\nThe anchor is the opposite corner');
{
  const rect = layerRect(layer());
  const same = (a, b) => a.x === b.x && a.y === b.y;
  check('dragging nw pins se', same(anchorFor(rect, 'nw'), handlePoint(rect, 'se')));
  check('dragging se pins nw', same(anchorFor(rect, 'se'), handlePoint(rect, 'nw')));
  check('dragging ne pins sw', same(anchorFor(rect, 'ne'), handlePoint(rect, 'sw')));
  check('dragging sw pins ne', same(anchorFor(rect, 'sw'), handlePoint(rect, 'ne')));
}

console.log('\nGrowing and shrinking from the south-east');
{
  const l = layer();
  check('dragging to where it already is changes nothing',
    JSON.stringify(drag(l, 'se', { x: 1536, y: 768 })) === JSON.stringify({ cols: 8, rows: 4, x: 0, y: 0 }));

  const bigger = drag(l, 'se', { x: 1536 + 192 * 2, y: 768 + 192 });
  check('two cabinets right and one down', bigger.cols === 10 && bigger.rows === 5);
  check('and the top left has not moved', bigger.x === 0 && bigger.y === 0);

  const smaller = drag(l, 'se', { x: 1536 - 192 * 3, y: 768 - 192 * 2 });
  check('three fewer across, two fewer down', smaller.cols === 5 && smaller.rows === 2);
  check('the top left still has not moved', smaller.x === 0 && smaller.y === 0);
}

console.log('\nDragging the west and north edges moves the origin');
{
  const l = layer();
  const nw = drag(l, 'nw', { x: -192 * 2, y: -192 });
  check('two cabinets added to the left', nw.cols === 10);
  check('one added above', nw.rows === 5);
  check('so x moves left by two cabinets', nw.x === -384);
  check('and y moves up by one', nw.y === -192);
  check('while the bottom right stays put',
    nw.x + nw.cols * 192 === 1536 && nw.y + nw.rows * 192 === 768);

  const sw = drag(l, 'sw', { x: -192, y: 768 + 192 });
  check('sw grows left and down', sw.cols === 9 && sw.rows === 5);
  check('moving x but not y', sw.x === -192 && sw.y === 0);

  const ne = drag(l, 'ne', { x: 1536 + 192, y: -192 });
  check('ne grows right and up', ne.cols === 9 && ne.rows === 5);
  check('moving y but not x', ne.x === 0 && ne.y === -192);
}

console.log('\nRounding to whole cabinets');
{
  const l = layer();
  check('just under half a cabinet does not add one', drag(l, 'se', { x: 1536 + 95, y: 768 }).cols === 8);
  check('just over half a cabinet adds one', drag(l, 'se', { x: 1536 + 97, y: 768 }).cols === 9);
  check('the same going backwards', drag(l, 'se', { x: 1536 - 97, y: 768 }).cols === 7);
  check('a screen is always a whole number across', Number.isInteger(drag(l, 'se', { x: 1234.567, y: 890.123 }).cols));
  check('and its origin is a whole pixel', Number.isInteger(drag(l, 'nw', { x: -13.7, y: -9.2 }).x));
}

console.log('\nRefusing to turn inside out');
{
  const l = layer();
  const past = drag(l, 'se', { x: -5000, y: -5000 });
  check('dragging se far past the anchor stops at one cabinet', past.cols === 1 && past.rows === 1);
  check('and stays on the anchor, not the far side', past.x === 0 && past.y === 0);

  const pastNw = drag(l, 'nw', { x: 9999, y: 9999 });
  check('the same from nw', pastNw.cols === 1 && pastNw.rows === 1);
  check('with the screen kept against its anchor',
    pastNw.x + pastNw.cols * 192 === 1536 && pastNw.y + pastNw.rows * 192 === 768);
}

console.log('\nThe ceiling');
{
  const l = layer();
  const huge = drag(l, 'se', { x: 192 * 5000, y: 192 * 5000 });
  check(`never more than ${MAX_CABINETS} across`, huge.cols === MAX_CABINETS);
  check('nor down', huge.rows === MAX_CABINETS);
  check('clampCabinets floors at one', clampCabinets(0) === 1 && clampCabinets(-40) === 1);
  check('and rounds what it is given', clampCabinets(3.6) === 4);
}

console.log('\nFinding a handle under the pointer');
{
  const rect = layerRect(layer());
  check('right on the corner', handleAtPoint(rect, { x: 0, y: 0 }, 10) === 'nw');
  check('just inside the tolerance', handleAtPoint(rect, { x: 6, y: 6 }, 10) === 'nw');
  check('just outside it is nothing', handleAtPoint(rect, { x: 9, y: 9 }, 10) === null);
  check('well away from any corner is nothing', handleAtPoint(rect, { x: 768, y: 384 }, 10) === null);
  check('the middle of an edge is nothing', handleAtPoint(rect, { x: 768, y: 0 }, 10) === null);
  check('the nearest corner wins when two are close', handleAtPoint(rect, { x: 1530, y: 4 }, 40) === 'ne');
  check('a bigger tolerance reaches further', handleAtPoint(rect, { x: 20, y: 20 }, 40) === 'nw');
}

console.log('\nCabinets of other shapes');
{
  const tall = layer({ spec: { resolution: { w: 128, h: 256 } }, cols: 4, rows: 2 });
  const grown = drag(tall, 'se', { x: 128 * 6, y: 256 * 3 });
  check('a non-square cabinet counts on its own size', grown.cols === 6 && grown.rows === 3);

  const l = layer();
  check('the cabinet size, not the pitch, sets the step', drag(l, 'se', { x: 1536 + 192, y: 768 }).cols === 9);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
