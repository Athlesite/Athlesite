import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AthleteProfileView } from "./AthleteProfileView";
import { getProfileBySlug } from "@/lib/profile-repository";
import { toAthleteProfileView } from "@/lib/athlete-profile";

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
    // Unpublished drafts are owner-only; keep them out of indexes even though
    // RLS already prevents anyone else from loading them.
    robots: record.isPublished ? undefined : { index: false, follow: false },
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

  return <AthleteProfileView record={record} />;
}
