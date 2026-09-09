import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AthleteProfileView } from "./AthleteProfileView";
import { getProfileBySlug, signMediaUrl } from "@/lib/profile-repository";
import { getUser } from "@/lib/supabase/server";
import { toAthleteProfileView } from "@/lib/athlete-profile";

/**
 * Whether the current viewer owns this profile.
 *
 * Purely a UI question — whether to offer an edit link. It is not access
 * control: RLS decides what may actually be read or written, and the link only
 * points at the onboarding wizard.
 *
 * Fails closed. A profile page is public and must keep rendering even if the
 * auth service is unreachable, so any error means "not the owner" and the link
 * is simply hidden. An anonymous visitor costs nothing here: with no session
 * cookie, getUser() resolves locally without a network call.
 */
async function viewerOwnsProfile(ownerUserId: string): Promise<boolean> {
  try {
    const user = await getUser();
    return user?.id === ownerUserId;
  } catch {
    return false;
  }
}

/**
 * Real metadata for a real profile. This is the whole point of fetching on the
 * server: the athlete's name and bio are in the HTML a coach's link preview
 * reads, rather than being set by an effect after hydration.
 *
 * getProfileBySlug is request-cached, so this and the page component below
 * share a single query rather than each issuing their own.
 *
 * When there is no visible profile the page calls notFound(), and the not-found
 * boundary supplies its own metadata from the root layout — so what is returned
 * here is a fallback that is not normally rendered. It stays deliberately
 * generic: an unpublished slug must not be distinguishable from a free one.
 */
export async function generateMetadata({
  params,
}: PageProps<"/athletes/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const record = await getProfileBySlug(slug);

  if (!record) {
    return { title: "Athlesite" };
  }

  const athlete = toAthleteProfileView(record.profile);
  const name = athlete.name || "Athlete";
  const descriptor = [athlete.position, athlete.sport].filter(Boolean).join(" · ");

  return {
    title: `${name} — Athlesite`,
    description:
      record.profile.bio.trim() ||
      [descriptor, athlete.classYear && `Class of ${athlete.classYear}`, athlete.location]
        .filter(Boolean)
        .join(" · ") ||
      `${name}'s Athlesite profile.`,
    // No athlete profile is indexed during the private pilot — published or
    // not. Publishing makes a profile shareable, not searchable: an athlete can
    // still send the link to a coach, and link-preview crawlers ignore this tag,
    // so nothing about sharing changes. Unconditional on purpose, so there is no
    // data-dependent path that could index a real athlete by accident.
    // See docs/ai/DECISIONS.md § Search indexing.
    robots: { index: false, follow: false },
  };
}

export default async function AthleteProfilePage({ params }: PageProps<"/athletes/[slug]">) {
  const { slug } = await params;
  const record = await getProfileBySlug(slug);

  // Null covers both "no such slug" and "unpublished and you are not the
  // owner" — RLS decides which rows are visible, and both cases must look
  // identical from outside.
  if (!record) {
    notFound();
  }

  // The profile photo is persisted but not rendered anywhere yet, so only the
  // hero is signed — an unused signed URL would be a wasted round trip.
  const [isOwner, heroPhotoUrl] = await Promise.all([
    viewerOwnsProfile(record.ownerUserId),
    signMediaUrl(record.heroPhotoPath),
  ]);

  return (
    <AthleteProfileView record={record} isOwner={isOwner} heroPhotoUrl={heroPhotoUrl} />
  );
}
