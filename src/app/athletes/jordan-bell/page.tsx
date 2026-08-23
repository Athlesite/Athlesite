import type { Metadata } from "next";
import { exampleAthlete } from "@/lib/example-athlete";
import { ExampleBadge } from "@/components/profile/ExampleBadge";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { ProfileBio } from "@/components/profile/ProfileBio";
import { ProfileHighlights } from "@/components/profile/ProfileHighlights";
import { ProfileRecruitingNil } from "@/components/profile/ProfileRecruitingNil";
import { ProfileClosingCta } from "@/components/profile/ProfileClosingCta";

export const metadata: Metadata = {
  title: "Jordan Bell — Example Athlesite Profile",
  description:
    "A fictional example Athlesite profile demonstrating what an athlete's professional digital home can look like.",
};

export default function JordanBellExamplePage() {
  return (
    <div className="athlete-theme">
      <ExampleBadge variant="banner" />
      <ProfileHero athlete={exampleAthlete} />
      <ProfileBio bio={exampleAthlete.bio} />
      <ProfileHighlights highlights={exampleAthlete.highlights} />
      <ProfileRecruitingNil athlete={exampleAthlete} />
      <ProfileClosingCta />
    </div>
  );
}
