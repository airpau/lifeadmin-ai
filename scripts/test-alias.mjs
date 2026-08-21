// scripts/test-alias.mjs
//
// Resolves the `@/` path alias for `node --test`.
//
// The repo's unit tests are run with node's built-in runner, which has
// no idea about tsconfig `paths`. Until now that quietly limited what
// could be tested: any module importing `@/lib/...` was untestable, so
// the tests clustered on the few files with no internal imports.
// recurring-qualification.ts imports exactly one thing that way, and it
// is far too load-bearing to leave untested for that reason.
//
// Usage: node --test --experimental-strip-types --import ./scripts/test-alias.mjs <file>
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const SRC = pathToFileURL(resolvePath(process.cwd(), 'src') + '/').href;

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context);

  // TypeScript source is extensionless in these imports; node's ESM
  // resolver is not, so try the real file suffixes in turn.
  const base = SRC + specifier.slice(2);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    try {
      return await nextResolve(candidate, context);
    } catch {
      // try the next suffix
    }
  }
  return nextResolve(base, context);
}
