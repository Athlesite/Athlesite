import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * Must be created per request — never hoisted to a module-level singleton —
 * because it closes over that request's cookies. A shared instance would leak
 * one user's session into another user's request.
 *
 * `cookies()` is async in Next.js 16, hence the await.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. This is expected and safe to
          // ignore: proxy.ts refreshes the session on every request, so the
          // cookie stays current even though this write is a no-op here.
        }
      },
    },
  });
}

/**
 * The signed-in user, or null.
 *
 * Uses `getUser()` rather than `getSession()` deliberately — `getUser()`
 * revalidates the token with the Supabase Auth server, while `getSession()`
 * trusts whatever is in the cookie. Only the former is safe for authorization
 * decisions on the server.
 *
 * Note that this is a convenience for rendering, not an access control layer:
 * ownership is enforced by RLS in the database (docs/ai/GUARDRAILS.md).
 */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
