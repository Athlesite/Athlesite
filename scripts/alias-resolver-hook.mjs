/**
 * Node ESM loader hook for tests. Two jobs.
 *
 * **1. Path aliases.** Rewrites "@/..." specifiers to this project's src/ directory,
 * mirroring tsconfig.json's own `"@/*": ["./src/*"]` path alias. Node's native module
 * resolution has no concept of TypeScript path aliases — Next.js/Turbopack resolve them
 * via their own bundler, which is irrelevant when a test imports application source
 * directly under `node --test`. This exists solely to let such a test exercise real
 * production modules unmodified, rather than needing test-only injection points added
 * to them.
 *
 * **2. JSX.** Node strips TypeScript types natively but cannot parse JSX, so a `.tsx`
 * import fails outright with "Unknown file extension". Most of this repo sidesteps that
 * by keeping logic in plain `.ts` modules (`otpMachine.ts`, `age-eligibility.ts`,
 * `profile-save-decisions.ts`) — which is the right default and should stay the default.
 * But some behaviour only exists in a mounted component: state collected before a
 * Back-navigation, blob URLs held by a live tree, a remount reading module state. The
 * `load` hook below transpiles `.tsx` through `typescript`, which is already a declared
 * devDependency, so rendering those components in a test needs no new transform package.
 *
 * Test-time only. Never loaded by the Next.js build or by `npm run dev`.
 * See scripts/register-alias-resolver.mjs and src/test-support/render.tsx.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const projectRoot = new URL("../", import.meta.url);

/**
 * Next entry points replaced by test doubles, unconditionally. See src/test-support/
 * next-stubs/. The real modules need a mounted App Router context and browser globals
 * that no test here provides, so every test gets the double — there is no normal test
 * that wants the real thing.
 */
const NEXT_STUBS = {
  "next/link": "link.tsx",
  "next/navigation": "navigation.ts",
};

/**
 * Whether `@supabase/ssr` resolves to its test double this process.
 *
 * Unlike the Next stubs above, this one is opt-in: most tests — the whole `lib/`,
 * `components/edit-profile` and reducer suites — want and get the *real* package
 * (undisturbed, just never given valid credentials, which is what `lib/supabase/auth.ts`
 * and its own injectable-client tests are built to handle). Only the rendered onboarding/
 * OTP interaction tests, which drive `useInlineOtp` end to end, need the network faked.
 *
 * The flag is set by scripts/register-alias-resolver-rendered.mjs, which only the
 * rendered-interaction `npm test` invocation loads — see that file for why an env flag,
 * set per `--import`, is the mechanism rather than something inside this hook.
 */
const STUB_SUPABASE = process.env.ATHLESITE_TEST_STUB_SUPABASE === "1";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const withoutPrefix = specifier.slice(2);
    const hasExtension = /\.[a-z]+$/i.test(withoutPrefix);

    if (hasExtension) {
      return nextResolve(new URL(`src/${withoutPrefix}`, projectRoot).href, context);
    }

    // `.ts` first so existing behaviour is unchanged; `.tsx` only as a fallback, for
    // component imports that previously could not resolve at all.
    for (const extension of [".ts", ".tsx"]) {
      const candidate = new URL(`src/${withoutPrefix}${extension}`, projectRoot);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }

    // Neither exists: resolve as `.ts` so the failure reads the way it always has.
    return nextResolve(new URL(`src/${withoutPrefix}.ts`, projectRoot).href, context);
  }

  // `next/link` and `next/navigation` are replaced by test doubles — these tests are
  // about application state rather than Next's routing, so a double is both sufficient
  // and more honest than threading Next internals through the harness. Test-time only:
  // the Next build never loads this hook.
  const stub = NEXT_STUBS[specifier];
  if (stub) {
    return nextResolve(new URL(`src/test-support/next-stubs/${stub}`, projectRoot).href, context);
  }

  // `@supabase/ssr` only when this process opted in. Everywhere else it resolves
  // normally, so a plain unit test exercises the real package.
  if (specifier === "@supabase/ssr" && STUB_SUPABASE) {
    return nextResolve(
      new URL("src/test-support/next-stubs/supabase-ssr.ts", projectRoot).href,
      context
    );
  }

  // Other `next/*` entry points exist on disk as plain `.js` files, and
  // the `next` package ships no `exports` map — so CommonJS resolution finds them by
  // extension guessing while ESM resolution, which does not guess, does not. Next's own
  // bundler papers over this; a bare `node --test` needs it spelled out.
  if (specifier.startsWith("next/") && !/\.[a-z]+$/i.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch {
      // Fall through to the unmodified specifier so the original error surfaces.
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".tsx")) {
    const source = await readFile(new URL(url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: url,
      compilerOptions: {
        // The automatic runtime, so a component needs no React import — matching how
        // Next compiles these files.
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        verbatimModuleSyntax: false,
      },
    });
    return { format: "module", shortCircuit: true, source: outputText };
  }

  return nextLoad(url, context);
}
