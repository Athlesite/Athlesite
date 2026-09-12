import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { ExampleBadge } from "@/components/profile/ExampleBadge";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { ProfileBio } from "@/components/profile/ProfileBio";
import { ProfileHighlights } from "@/components/profile/ProfileHighlights";
import { ProfileRecruitingNil } from "@/components/profile/ProfileRecruitingNil";
import { toAthleteProfileView, MIN_HERO_ZOOM } from "@/lib/athlete-profile";
import type { OwnerAthleteProfileRecord } from "@/lib/db-mappers";

type EditProfileViewProps = {
  record: OwnerAthleteProfileRecord;
  /** Signed, short-lived URL for the hero photo. Undefined if none is stored. */
  heroPhotoUrl?: string;
};

/**
 * Read-only view of the signed-in athlete's own full profile.
 *
 * Deliberately not a form. This checkpoint (5A) exists to prove the
 * authenticated full-row load and the routing around it, not to let anyone
 * change anything yet — editable fields, saving, slug changes,
 * publish/unpublish, and media replace/remove are all later work.
 *
 * A Server Component, like the public AthleteProfileView it mirrors: it
 * renders already-fetched data and needs no interactivity of its own.
 */
export function EditProfileView({ record, heroPhotoUrl }: EditProfileViewProps) {
  const athlete = toAthleteProfileView(record.profile);

  return (
    <div>
      <Section className="border-b border-border pb-8 pt-12 sm:pt-16">
        <Container className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Your Athlesite
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This is everything currently saved on your profile. Editing isn&apos;t available
            here yet — this page only confirms what&apos;s live.
          </p>
          {record.isPublished ? (
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="text-accent-light">●</span> Published — visible at{" "}
              <Link
                href={athlete.routePath}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {athlete.displayUrl}
              </Link>
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              <span className="text-muted-foreground/60">●</span> Not published — only you can
              see this
            </p>
          )}
        </Container>
      </Section>

      <div className="athlete-theme">
        {record.isPublished ? null : (
          <ExampleBadge variant="quiet" message="Private draft · only you can see this" />
        )}
        <ProfileHero
          athlete={athlete}
          photoUrl={heroPhotoUrl}
          photoPosition={{
            x: record.profile.heroPhotoPositionX,
            y: record.profile.heroPhotoPositionY,
          }}
          photoZoom={record.profile.heroPhotoZoom ?? MIN_HERO_ZOOM}
        />
        <ProfileBio bio={athlete.bio} />
        <ProfileHighlights highlights={athlete.highlights} />
        <ProfileRecruitingNil athlete={athlete} />
      </div>
    </div>
  );
}
