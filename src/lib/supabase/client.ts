import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Supabase client for Client Components ("use client").
 *
 * Reads and writes the auth cookie in the browser. Every query it makes runs as
 * the signed-in user (or `anon` when signed out), so RLS — not this client — is
 * what decides which rows are visible or writable.
 *
 * `createBrowserClient` memoizes internally, so calling this per component is
 * fine; there is no need to hoist it to a module-level singleton.
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
}
