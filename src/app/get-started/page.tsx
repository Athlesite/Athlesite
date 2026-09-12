import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { getUser } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile-repository";

export const metadata: Metadata = {
  title: "Create Your Athlesite",
  description:
    "Build your Athlesite — an early preview of the athlete profile onboarding experience.",
  // Onboarding is a form, not a landing page, and it server-renders an empty
  // shell until hydration — nothing here is worth a search result. `follow` is
  // stated rather than omitted (the two are equivalent in effect) to record that
  // crawlers should keep moving back into the marketing pages.
  robots: { index: false, follow: true },
};

/**
 * Onboarding is first-time creation only.
 *
 * An athlete who already has a profile is sent to /edit-profile instead,
 * resolved entirely server-side before anything renders. This has to happen
 * here rather than inside OnboardingWizard: the wizard hydrates its draft from
 * localStorage on mount, and on a fresh session (no local draft) that would
 * start an existing owner from a blank profile — saving would then silently
 * overwrite their real one, since the save path upserts on owner_user_id.
 * Resolving it before the wizard ever mounts means that code path is simply
 * never reached for an existing owner, rather than patched around.
 */
export default async function GetStartedPage() {
  const user = await getUser();
  if (user) {
    const existing = await getOwnProfile(user.id);
    if (existing) redirect("/edit-profile");
  }

  return <OnboardingWizard />;
}
