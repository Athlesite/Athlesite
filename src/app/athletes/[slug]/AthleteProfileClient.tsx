"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { ExampleBadge } from "@/components/profile/ExampleBadge";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { ProfileBio } from "@/components/profile/ProfileBio";
import { ProfileHighlights } from "@/components/profile/ProfileHighlights";
import { ProfileRecruitingNil } from "@/components/profile/ProfileRecruitingNil";
import { toAthleteProfileView, MIN_HERO_ZOOM } from "@/lib/athlete-profile";
import { loadAthleteProfile, type StoredAthleteProfile } from "@/lib/onboarding-storage";

type Status = "loading" | "found" | "missing";

export function AthleteProfileClient({ slug }: { slug: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [stored, setStored] = useState<StoredAthleteProfile | null>(null);

  useEffect(() => {
    // One-time lookup in a browser-only store (localStorage) on mount, gated behind
    // `status` so the server render and the initial client render both produce the
    // same "loading" (empty) output before this runs.
    const result = loadAthleteProfile(slug);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored(result);
    setStatus(result ? "found" : "missing");
  }, [slug]);

  useEffect(() => {
    if (stored) {
      document.title = `${stored.profile.firstName} ${stored.profile.lastName} — Athlesite`.trim();
    }
  }, [stored]);

  if (status === "loading") {
    return null;
  }

  if (status === "missing" || !stored) {
    return (
      <Section className="py-28 text-center">
        <Container className="max-w-xl">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent-light">
            Profile not found
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
            No Athlesite saved for &ldquo;{slug}&rdquo; in this browser.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Profiles created during this preview are saved only on the device and browser
            that created them. If this profile was created elsewhere, it won&apos;t appear
            here yet.
          </p>
          <Button href="/get-started" className="mt-8">
            Create Your Athlesite
          </Button>
        </Container>
      </Section>
    );
  }

  const athlete = toAthleteProfileView(stored.profile);

  return (
    <div className="athlete-theme">
      <ExampleBadge variant="quiet" message="Preview profile · saved on this device" />
      <ProfileHero
        athlete={athlete}
        photoPosition={{
          x: stored.profile.heroPhotoPositionX ?? 0.5,
          y: stored.profile.heroPhotoPositionY ?? 0,
        }}
        photoZoom={stored.profile.heroPhotoZoom ?? MIN_HERO_ZOOM}
      />
      <ProfileBio bio={athlete.bio} />
      <ProfileHighlights highlights={athlete.highlights} />
      <ProfileRecruitingNil athlete={athlete} />
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
    </div>
  );
}
