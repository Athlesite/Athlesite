import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { ExampleBadge } from "@/components/profile/ExampleBadge";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { ProfileBio } from "@/components/profile/ProfileBio";
import { ProfileHighlights } from "@/components/profile/ProfileHighlights";
import { ProfileRecruitingNil } from "@/components/profile/ProfileRecruitingNil";
import { toAthleteProfileView, MIN_HERO_ZOOM } from "@/lib/athlete-profile";
import type { AthleteProfileRecord } from "@/lib/db-mappers";

type AthleteProfileViewProps = {
  record: AthleteProfileRecord;
  /**
   * Whether the viewer owns this profile. Controls only whether the edit link
   * is offered — a coach or an anonymous visitor has no use for it. Access
   * control remains RLS's job, not this flag's.
   */
  isOwner: boolean;
};

/**
 * Renders a real, Supabase-backed athlete profile.
 *
 * This is a Server Component. Every profile component it composes is
 * server-safe, so there is no client boundary here and no browser-storage
 * lookup — the data arrives already fetched. The visual composition is
 * unchanged from the previous localStorage-backed version.
 *
 * Hero photo rendering stays on the placeholder path for now: media lives in a
 * private bucket and needs a signed URL generated at render time, which lands
 * in checkpoint 5.
 */
export function AthleteProfileView({ record, isOwner }: AthleteProfileViewProps) {
  const athlete = toAthleteProfileView(record.profile);

  return (
    <div className="athlete-theme">
      {record.isPublished ? null : (
        <ExampleBadge variant="quiet" message="Private draft · only you can see this" />
      )}
      <ProfileHero
        athlete={athlete}
        photoPosition={{
          x: record.profile.heroPhotoPositionX,
          y: record.profile.heroPhotoPositionY,
        }}
        photoZoom={record.profile.heroPhotoZoom ?? MIN_HERO_ZOOM}
      />
      <ProfileBio bio={athlete.bio} />
      <ProfileHighlights highlights={athlete.highlights} />
      <ProfileRecruitingNil athlete={athlete} />
      {isOwner ? (
        <Section className="text-center">
          <Container>
            <Link
              href="/get-started"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Edit your profile →
            </Link>
          </Container>
        </Section>
      ) : null}
    </div>
  );
}
