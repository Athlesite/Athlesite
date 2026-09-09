import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

/**
 * Refreshes the Supabase auth session for an incoming request and returns a
 * response carrying any rotated cookies.
 *
 * This exists because Server Components can read cookies but cannot write them.
 * Auth tokens expire, so without a refresh at the request boundary a signed-in
 * athlete would be silently logged out once their token aged out. Next.js 16
 * advises using proxy sparingly; token rotation is the case where there is no
 * alternative.
 *
 * This function only refreshes the session. It performs no redirects and makes
 * no authorization decisions — those belong to RLS and to the routes
 * themselves (docs/ai/GUARDRAILS.md § Ownership).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  // Without configuration there is no session to refresh. Pass the request
  // through so the marketing site and the local-draft onboarding flow keep
  // working before Supabase env values are set.
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to the request first so anything downstream in this same pass
          // sees the refreshed cookie, then rebuild the response around it and
          // mirror the cookies onto the outgoing response.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // Touching getUser() is what triggers the refresh-and-rotate. The result is
    // deliberately unused here.
    await supabase.auth.getUser();
  } catch {
    // This proxy runs on every page request, so a Supabase or network fault
    // here would otherwise 500 the entire site — including the marketing pages,
    // which need no session at all.
    //
    // Failing open is safe precisely because this function makes no
    // authorization decision. The worst outcome is that a token is not rotated
    // on this request: a signed-in athlete may be treated as signed out until
    // the next one, and RLS still decides what any request may read or write.
    // Availability is the only thing at stake, so keep serving the page.
    return NextResponse.next({ request });
  }

  return response;
}
