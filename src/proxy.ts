import type { NextRequest } from "next/server";
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
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static assets and image optimization — without this, every CSS, JS,
  // font, and image request would pay for a session refresh.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf)$).*)",
  ],
};
