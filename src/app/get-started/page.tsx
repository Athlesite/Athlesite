import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

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

export default function GetStartedPage() {
  return <OnboardingWizard />;
}
