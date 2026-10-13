import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { getUser } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile-repository";

export const metadata: Metadata = {
  title: "Create Your Athlesite",
  description:
    "Build your Athlesite — an early preview of the athlete profile onboarding experience.",
  // Onboarding is a form, not a landing page — nothing here is worth a search
  // result. `follow` is stated rather than omitted (the two are equivalent in
  // effect) to record that crawlers should keep moving back into the marketing
  // pages.
  robots: { index: false, follow: true },
};

/**
 * Onboarding is first-time creation only.
 *
 * An athlete who already has a profile is sent to /edit-profile instead,
 * resolved entirely server-side before anything renders. This has to happen
 * here rather than inside OnboardingWizard: the wizard always starts from a
 * blank profile — pre-auth state is memory-only and nothing is restored from the
 * browser (see onboarding-storage.ts) — so an existing owner reaching it would
 * begin from an empty form and, on save, hit `createProfile`'s plain `.insert()`
 * (profile-save.ts), which fails on the `owner_user_id` unique constraint rather
 * than overwriting their real profile. Resolving it before the wizard ever mounts
 * means that failure is never reached for an existing owner in the first place,
 * rather than surfaced as a confusing save error.
 *
 * Note this reasoning got *stronger*, not weaker, when the draft cache was
 * removed: previously a returning owner might by luck have had a local draft to
 * hydrate from; now the form is unconditionally empty.
 */
export default async function GetStartedPage() {
  const user = await getUser();
  if (user) {
    const existing = await getOwnProfile(user.id);
    if (existing) redirect("/edit-profile");
  }

  return <OnboardingWizard />;
}
