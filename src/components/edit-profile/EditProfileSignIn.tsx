"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { InlineOtpForm } from "@/components/auth/InlineOtpForm";
import { useInlineOtp } from "@/components/auth/useInlineOtp";

/**
 * The sign-in gate rendered by /edit-profile for a request with no session.
 *
 * Reuses the same OTP hook and form onboarding uses, unmodified. Onboarding's
 * hook deliberately never navigates, because it must not revoke the blob URLs
 * behind photo previews held in memory — that constraint does not apply here:
 * /edit-profile in this checkpoint holds no such state, so once
 * `otp.authenticated` flips true this component's own effect promotes the
 * route with `router.refresh()`.
 *
 * `router.refresh()` re-requests the current route's Server Component tree
 * rather than reloading the page or pushing a new history entry. It works
 * here because the browser Supabase client writes the same cookie the
 * server's client reads (see src/lib/supabase/client.ts) — by the time
 * `verifyEmailOtp` has resolved and the reducer has moved to its
 * authenticated state, that cookie is already set, so the refreshed request
 * carries it and the server's getUser() succeeds on the very next render.
 */
export function EditProfileSignIn() {
  const router = useRouter();
  const otp = useInlineOtp();

  useEffect(() => {
    if (otp.authenticated) {
      router.refresh();
    }
  }, [otp.authenticated, router]);

  return (
    <Section className="py-16 sm:py-20">
      <Container className="max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Sign in to manage your Athlesite
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the email you used to create your profile.
        </p>
        <div className="mt-6">
          <InlineOtpForm otp={otp} />
        </div>
      </Container>
    </Section>
  );
}
