import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

/**
 * Runs before every matched request and refreshes the Supabase auth session so
 * a signed-in athlete is not silently logged out when their token expires.
 *
 * In Next.js 16 this file convention is `proxy.ts` with an exported `proxy`
 * function — `middleware.ts` / `export function middleware` is deprecated.
 *
 * Nothing here redirects or gates access. Ownership is enforced by RLS in the
 * database; see docs/ai/GUARDRAILS.md.
 *
 * ── THE GUARDIAN BRANCH (Guardian-First Participation Phase 2) ───────────
 *
 * `/guardian/*` takes a DIFFERENT path through this function, for two
 * independent reasons:
 *
 *   1. It needs a per-request CSP NONCE, which only Proxy can generate. A
 *      nonce lets that route's `script-src`/`style-src` require `'self'
 *      'nonce-<value>'` instead of `'unsafe-inline'`, while still letting
 *      Next's own framework scripts and RSC payload inline scripts execute —
 *      Next parses its OWN response's `Content-Security-Policy` header
 *      during server rendering and attaches a nonce it finds there to every
 *      script/style it generates automatically (see
 *      node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md,
 *      "How nonces work in Next.js"). `next.config.ts`'s `headers()` config
 *      cannot do this: it has no access to a fresh value per request, only a
 *      static string decided at build/config time.
 *   2. It deliberately SKIPS `updateSession` — the athlete-session cookie
 *      refresh below — rather than running it unconditionally. A guardian is
 *      never signed in, and the founder decision is explicit: "Do not use
 *      the signed-in athlete account as guardian authority even if the same
 *      browser currently has an athlete session." Running the athlete
 *      session refresh here would not GRANT guardian authority by itself
 *      (that still only comes from the bearer token passed to the RPCs), but
 *      it is unnecessary Supabase-client/cookie traffic on a route this
 *      project's own architecture says should have no athlete-session
 *      coupling at all — so it is skipped outright rather than merely
 *      harmless.
 *
 * `dynamic = "force-dynamic"` on `/guardian/participation` (see
 * src/app/guardian/participation/page.tsx) is what makes a nonce usable here
 * at all: nonces require per-request server rendering, never a statically
 * generated page.
 */
const GUARDIAN_PATH_PREFIX = "/guardian/";

/**
 * Builds the guardian route's CSP, following the documented Next.js nonce
 * pattern exactly (`script-src 'self' 'nonce-<value>' 'strict-dynamic'`,
 * `'unsafe-eval'` added only in development for React's debug `eval` use —
 * never in production). `'strict-dynamic'` is what lets Next's own
 * nonce-bearing bootstrap script load every further script it needs (the
 * page bundle, chunks) without each one needing `'self'` to cover it
 * separately; browsers that do not support `strict-dynamic` fall back to
 * `'self' 'nonce-<value>'`, which still covers Next's own same-origin
 * scripts.
 */
function buildGuardianCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function guardianResponse(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildGuardianCsp(nonce);

  // Set on the REQUEST headers too (not just the response): this is what
  // lets a Server Component read the nonce back out via `headers()` if a
  // future change here ever needs to hand it to a specific `<Script>` by
  // hand, matching the documented pattern exactly — nothing in this
  // checkpoint's page currently needs to read it itself, since Next applies
  // it automatically to its own scripts purely from the RESPONSE header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith(GUARDIAN_PATH_PREFIX)) {
    return guardianResponse(request);
  }

  return updateSession(request);
}

export const config = {
  // Skip static assets and image optimization — without this, every CSS, JS,
  // font, and image request would pay for a session refresh.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf)$).*)",
  ],
};
