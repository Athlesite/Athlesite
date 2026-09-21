import type { Metadata } from "next";
import { exampleAthlete, exampleAthletePosture } from "@/lib/example-athlete";
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

/**
 * The fictional example profile, at the canonical root shape every real
 * athlete now uses (`/jordan-bell`, not `/athletes/jordan-bell`). `jordan-bell`
 * is a reserved slug, so no real athlete can ever collide with it.
 *
 * This is the one surface that passes `example` and a real `posture`: it is
 * banner-labelled as fictional sample data, and its fixture holds actual
 * recruiting/NIL values, so the richer demo presentation is truthful here in
 * a way it can never be on a real public profile.
 */
export default function JordanBellExamplePage() {
  return (
    <div className="athlete-theme">
      <ExampleBadge variant="banner" />
      <ProfileHero athlete={exampleAthlete} example />
      <ProfileBio bio={exampleAthlete.bio} />
      <ProfileHighlights highlights={exampleAthlete.highlights} example />
      <ProfileRecruitingNil athlete={exampleAthlete} posture={exampleAthletePosture} example />
      <ProfileClosingCta />
    </div>
  );
}
