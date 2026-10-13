import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Dedicated, stateless Supabase transport for the guardian bearer surface.
 *
 * Deliberately NOT `@/lib/supabase/client` (`createBrowserClient` from
 * `@supabase/ssr`): that client manages the ATHLETE's auth cookie, persists
 * its session, and auto-refreshes it. A guardian is never signed in — their
 * authority is the bearer token passed as an RPC argument, not `auth.uid()` —
 * and a browser that happens to also have an athlete session open (the same
 * device, a different tab) must never let that session leak into a guardian
 * call. Using the raw `@supabase/supabase-js` client with every persistence
 * feature explicitly turned off is what makes that structurally true rather
 * than merely intended:
 *
 *   - `persistSession: false` — nothing about this client's state survives
 *     past this call; it never reads or writes any session storage.
 *   - `autoRefreshToken: false` — there is no token to refresh; this client
 *     never acquires one.
 *   - `detectSessionInUrl: false` — Supabase's own URL-based session
 *     detection must never run against this route's fragment. The guardian
 *     token in `#token=...` is parsed and consumed entirely by
 *     guardian-fragment.ts/guardian-token.ts, by hand, before this client is
 *     ever constructed; this flag is belt-and-braces against the library
 *     trying to interpret that same fragment as an auth callback.
 *
 * Every call through this client runs as `anon` (the publishable key's
 * default role) — see the migration's own grant: both guardian RPCs are
 * granted EXECUTE to `anon` only, never `authenticated`.
 */
export function createGuardianClient() {
  return createSupabaseClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
