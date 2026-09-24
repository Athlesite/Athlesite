/**
 * The origin this deployment is publicly served from.
 *
 * Used for `metadataBase`, which is what Next resolves relative metadata URLs
 * against (Open Graph and Twitter images, and any canonical link). Nothing in
 * the app renders an absolute URL from this today — the athlete-facing link is
 * built from `PUBLIC_HOST` in athlete-profile.ts, deliberately separately,
 * because that one is spoken and copied by athletes rather than fetched.
 *
 * Deliberately NOT hardcoded to a Supabase URL, a Vercel preview hostname, or
 * anything else environment-specific: the production origin is supplied by
 * `NEXT_PUBLIC_SITE_URL` and nothing else.
 */

/** Where the app runs when nobody has said otherwise — plain local development. */
export const DEFAULT_SITE_URL = "http://localhost:3000";

/** The env var carrying the production origin. `NEXT_PUBLIC_*` is inlined at build time. */
export const SITE_URL_ENV = "NEXT_PUBLIC_SITE_URL";

/**
 * Resolves the site origin, or throws.
 *
 * Three cases, and the third is the point of this function existing:
 *
 *  - **Unset** — falls back to localhost, so `npm run dev` and `npm run build`
 *    work with no configuration at all. This is the normal local case.
 *  - **Set and valid** — used as given, normalized to its origin so a stray
 *    path, query or trailing slash cannot leak into resolved metadata URLs.
 *  - **Set but malformed** — throws. It deliberately does *not* quietly fall
 *    back to localhost: a typo'd production value would otherwise ship real
 *    pages advertising `http://localhost:3000`, and that failure is invisible
 *    until someone inspects the HTML. Failing the build is the safe outcome.
 *
 * `http` and `https` are the only accepted protocols — anything else (a
 * `file:`, a bare `athlesite.com` parsed as a protocol-relative string, and so
 * on) is a configuration mistake, not a site origin.
 */
export function resolveSiteUrl(rawValue?: string): URL {
  const trimmed = rawValue?.trim();

  if (!trimmed) {
    return new URL(DEFAULT_SITE_URL);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `${SITE_URL_ENV} is not a valid absolute URL. Expected something like ` +
        `"https://athlesite.com". Fix the value or unset it to fall back to ` +
        `${DEFAULT_SITE_URL}.`
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `${SITE_URL_ENV} must use http or https. Fix the value or unset it to ` +
        `fall back to ${DEFAULT_SITE_URL}.`
    );
  }

  // Origin only: drops any path/query/hash so metadata resolution starts from
  // a clean base regardless of how the value was pasted in.
  return new URL(parsed.origin);
}
