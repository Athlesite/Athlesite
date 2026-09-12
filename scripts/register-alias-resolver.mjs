/**
 * Registers alias-resolver-hook.mjs as a Node ESM loader hook, so a test can
 * `import` this project's "@/..." aliased modules directly.
 *
 * Usage: node --import ./scripts/register-alias-resolver.mjs --test <file>
 */
import { register } from "node:module";

register("./alias-resolver-hook.mjs", import.meta.url);
