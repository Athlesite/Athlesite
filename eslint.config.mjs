import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Static design reference: plain browser scripts and fixtures, not app code.
    "design-reference/**",
    // Willy's local design lab, kept beside the app but outside the repo (.git/info/exclude).
    "athlesite-design/**",
  ]),
]);

export default eslintConfig;
