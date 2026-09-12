/**
 * Node ESM loader hook: rewrites "@/..." specifiers to this project's src/
 * directory, mirroring tsconfig.json's own `"@/*": ["./src/*"]` path alias.
 *
 * Node's native module resolution has no concept of TypeScript path
 * aliases — Next.js/Turbopack resolve them via their own bundler, which is
 * irrelevant when a test imports application source directly under
 * `node --test` rather than through Next's build. This exists solely to let
 * such a test exercise real production modules (e.g. media-storage.ts)
 * unmodified, rather than needing test-only injection points added to them.
 *
 * Test-time only. Never loaded by the Next.js build or by `npm run dev`.
 * See scripts/register-alias-resolver.mjs and
 * src/lib/media-storage.upload-classification.test.ts.
 */
const projectRoot = new URL("../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const withoutPrefix = specifier.slice(2);
    const hasExtension = /\.[a-z]+$/i.test(withoutPrefix);
    const rewritten = new URL(`src/${withoutPrefix}${hasExtension ? "" : ".ts"}`, projectRoot).href;
    return nextResolve(rewritten, context);
  }
  return nextResolve(specifier, context);
}
