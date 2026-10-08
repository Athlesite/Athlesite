/**
 * Registers the same loader hook as register-alias-resolver.mjs, plus one extra bit:
 * it sets the flag that opts `@supabase/ssr` into its test double.
 *
 * **Why a separate entry point rather than a conditional inside the hook that checks
 * the specifier or caller.** The hook has no reliable way to tell *which test file* is
 * asking for `@supabase/ssr` — ESM resolution does not pass that context. What it can
 * read is an environment variable, and an environment variable is exactly as broad as
 * whichever `node --test` invocation set it. So the scope of the stub is controlled by
 * which register script a given `npm test` invocation loads via `--import`, not by
 * anything inside the hook itself:
 *
 * - the plain unit-test run loads register-alias-resolver.mjs and never sets the flag,
 *   so `@supabase/ssr` resolves to the real package for every file it covers
 * - the rendered-interaction run loads *this* file, so every `.tsx` test file it
 *   matches gets the stub
 *
 * The flag is set here, before `register()`, in the parent process that `node --test`
 * uses to spawn its per-file test processes — each of those children inherits it the
 * same way they inherit any other environment variable. No shell-specific env syntax
 * is needed in package.json, which keeps this working the same way on every platform
 * this repo is developed on.
 *
 * Usage: node --import ./scripts/register-alias-resolver-rendered.mjs --test <file>
 */
import { register } from "node:module";

process.env.ATHLESITE_TEST_STUB_SUPABASE = "1";

register("./alias-resolver-hook.mjs", import.meta.url);
