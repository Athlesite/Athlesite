import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { ProfileContactPath } from "@/components/profile/ProfileContactPath";
import {
  recruitingClaim,
  recruitingFacts,
  nilClaim,
  showNilSection,
  type RecruitingPosture,
} from "@/components/profile/profile-display";
import type { AthleteProfileView } from "@/lib/athlete-profile";

type ProfileRecruitingNilProps = {
  athlete: AthleteProfileView;
  /**
   * The athlete's real recruiting/NIL posture — supplied only by a surface
   * that can genuinely source it (see RecruitingPosture). Omitted on a real
   * public profile, on the owner's edit preview, and in onboarding's
   * preview, all of which then render facts only: no recruiting claim, and
   * no NIL section at all.
   */
  posture?: RecruitingPosture;
  /**
   * Whether this surface is the explicitly-labelled fictional example.
   * Gates the forward-looking "available soon" contact placeholders, which
   * describe a product capability that does not exist yet — honest on a page
   * banner-labelled as a demo, misleading on a real athlete's page where a
   * coach would read it as a contact route.
   */
  example?: boolean;
};

/**
 * The Recruiting (and, where truthfully possible, NIL) section.
 *
 * Before Checkpoint 5D.3 this component asserted, on every profile it
 * rendered, that the athlete "is open to recruiting conversations" and "is
 * open to NIL and business partnerships" — hardcoded, athlete-independent,
 * and false for anyone who had chosen otherwise. It could not have been
 * truthful: `AthleteProfileView` carries no posture fields, and the columns
 * behind them are not in the anonymous 18, so a public page has no way to
 * know. Every claim is now sourced through profile-display.ts's pure rules,
 * which render nothing at all when the value cannot be known.
 */
export function ProfileRecruitingNil({ athlete, posture, example }: ProfileRecruitingNilProps) {
  const facts = recruitingFacts(athlete);
  const recruiting = recruitingClaim(athlete.name, posture);
  const nil = nilClaim(athlete.name, posture);

  return (
    <Section className="border-b border-border">
      <Container className="max-w-3xl">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-[var(--athlete-accent-light)]">
          Recruiting
        </p>
        {facts ? (
          <p className="mt-4 text-base font-medium text-foreground sm:text-lg">{facts}</p>
        ) : null}
        {recruiting ? (
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">{recruiting}</p>
        ) : null}
        {example ? <ProfileContactPath label="Recruiting inquiries — available soon" /> : null}

        {showNilSection(posture) ? (
          <>
            <div className="my-10 h-px w-full bg-border" />

            <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-[var(--athlete-accent-light)]">
              NIL &amp; Business
            </p>
            {nil ? (
              <p className="mt-3 text-base text-muted-foreground sm:text-lg">{nil}</p>
            ) : null}
            {example ? (
              <ProfileContactPath label="Business & NIL inquiries — available soon" />
            ) : null}
          </>
        ) : null}
      </Container>
    </Section>
  );
}
