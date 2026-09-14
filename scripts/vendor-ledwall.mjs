#!/usr/bin/env node
/**
 * Re-vendors the ground-support solver from the tipping-point project.
 *
 *   node scripts/vendor-ledwall.mjs [path-to-tipping-point-checkout]
 *
 * The only edit is the module wrapper: upstream ships a UMD that assigns to
 * `module.exports` or a global, and this swaps that for an ES module export so
 * a bundler can handle it. The physics is copied verbatim — fix bugs upstream
 * and re-run this, rather than editing the vendored copy.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = process.argv[2] ?? '/home/user/legofsalmon/tipping-point';
const OUT = resolve(root, 'src/lib/vendor/ledwall.js');

const UMD_HEADER = `(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LedWall = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';`;

const source = readFileSync(resolve(upstream, 'src/ledwall.js'), 'utf8');
if (!source.includes(UMD_HEADER)) {
  throw new Error('The upstream UMD wrapper has changed shape — update this script.');
}

const sha = execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const banner = [
  '/*',
  ' * Vendored from legofsalmon/tipping-point, MIT licensed.',
  ' *   https://github.com/legofsalmon/tipping-point  (src/ledwall.js)',
  ` *   commit ${sha}`,
  ' *',
  ' * The only change is the module wrapper: the upstream UMD header and footer',
  ' * are swapped for an ES module export so a bundler can handle it and it never',
  ' * touches a global. The physics below is untouched — re-vendor with',
  ' * scripts/vendor-ledwall.mjs rather than editing it here.',
  ' */',
  'const LedWall = (function () {',
  "  'use strict';",
].join('\n');

let out = source.replace(UMD_HEADER, banner);
const trimmed = out.trimEnd();
if (!trimmed.endsWith('});')) throw new Error('The upstream UMD footer has changed shape.');
out = `${trimmed.slice(0, -3).trimEnd()}\n})();\n\nexport default LedWall;\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);
console.log(`Vendored ledwall.js from ${sha.slice(0, 12)} -> ${OUT} (${out.length} bytes)`);
