import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const metadata: Metadata = {
  title: "Create Your Athlesite",
  description:
    "Build your Athlesite — an early preview of the athlete profile onboarding experience.",
};

export default function GetStartedPage() {
  return <OnboardingWizard />;
}
