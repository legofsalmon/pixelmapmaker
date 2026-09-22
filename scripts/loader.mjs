/**
 * Minimal loader so tests can import the app's TypeScript modules directly.
 *
 * Node strips types on its own; what it will not do is guess an extension or
 * understand the `@/` alias, both of which the app's own source relies on.
 * Adding thirty lines here is cheaper than a test framework and a bundler
 * config, and it means a test imports exactly the module that ships.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, '..', 'src');

function resolveFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return base;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    return { url: pathToFileURL(resolveFile(path.join(src, specifier.slice(2)))).href, shortCircuit: true };
  }

  // Relative imports between the app's own TS modules need the extension added.
  if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    const resolved = resolveFile(base);
    if (resolved !== base || fs.existsSync(resolved)) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  return next(specifier, context);
}
