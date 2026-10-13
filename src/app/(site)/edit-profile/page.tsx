import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EditProfileForm } from "@/components/edit-profile/EditProfileForm";
import { EditProfileSignIn } from "@/components/edit-profile/EditProfileSignIn";
import { AdultAttestationGate } from "@/components/participation/AdultAttestationGate";
import { ParticipationBlocked } from "@/components/participation/ParticipationBlocked";
import { getOwnProfile, signMediaUrl } from "@/lib/profile-repository";
import {
  getOwnPublicationState,
  getParticipationStatusServer,
} from "@/lib/participation-repository.server";
import { resolveEditProfileRoute } from "@/lib/participation";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Manage Your Athlesite",
  description: "Sign in to view and manage your Athlesite profile.",
  // An authenticated management page, never a search result — same reasoning
  // as /get-started, one step further: this one also carries the athlete's
  // own data, not just a form shell.
  robots: { index: false, follow: false },
};

/**
 * Entry point for a returning athlete.
 *
 * Five states, resolved server-side in order (see resolveEditProfileRoute, the
 * pure function this page defers the actual decision to):
 *  - no session                        -> render the inline OTP sign-in gate in place
 *  - session, participation absent     -> AdultAttestationGate (never auto-initialized)
 *  - session, minor/*, revoked, expired -> ParticipationBlocked
 *  - adult_approved, no profile        -> redirect to /get-started (nothing to manage yet)
 *  - adult_approved, has profile       -> load the full row and render the editable form
 *
 * getUser() revalidates with the Auth server rather than trusting a cached
 * session (see docs/ai/GUARDRAILS.md § Ownership) — the same helper the
 * public profile page already uses to decide whether to show an edit link.
 *
 * The participation status read happens for every authenticated request, before
 * anything else — an authenticated owner with no participation row must see the
 * attestation gate, never the editor, no matter how they arrived here (fresh
 * sign-in, a restored session, or a stale bookmark). Nothing on this page ever
 * calls initialize_adult_participation itself; that call lives only inside
 * AdultAcceptancePanel's own explicit button handler.
 *
 * EditProfileForm is seeded once, here, from the server-authoritative
 * record — never from localStorage. The now-unused EditProfileView (5A's
 * read-only scaffold) stays in the tree rather than being deleted: reverting
 * this route to read-only, if that were ever needed, is then a one-line
 * change here rather than a re-implementation.
 */
export default async function EditProfilePage() {
  const user = await getUser();

  if (!user) {
    return <EditProfileSignIn />;
  }

  const [status, publicationState] = await Promise.all([
    getParticipationStatusServer(),
    getOwnPublicationState(user.id),
  ]);

  const route = resolveEditProfileRoute({
    hasSession: true,
    status,
    hasProfile: publicationState.exists,
  });

  if (route === "attestation-gate") {
    return <AdultAttestationGate publicationState={publicationState} />;
  }

  if (route === "blocked") {
    // route === "blocked" guarantees status is neither "absent" nor
    // "adult_approved" — resolveEditProfileRoute's own contract — so this
    // narrowing is sound without a redundant runtime check.
    return (
      <ParticipationBlocked
        status={status as Exclude<typeof status, "absent" | "adult_approved">}
        publicationState={publicationState}
      />
    );
  }

  if (route === "onboarding-redirect") {
    redirect("/get-started");
  }

  const record = await getOwnProfile(user.id);

  if (!record) {
    // route === "editor" implies publicationState.exists, which was read a moment
    // ago — if it is somehow gone now (a race with a deletion elsewhere), fail
    // the same way the pre-participation code always did rather than rendering a
    // broken editor.
    redirect("/get-started");
  }

  // The profile photo is signed here (the owner's own edit surface) but
  // still never signed on the public route — it has no public rendering
  // surface, in or out of this checkpoint (Checkpoint 5C).
  const [heroPhotoUrl, profilePhotoUrl] = await Promise.all([
    signMediaUrl(record.heroPhotoPath),
    signMediaUrl(record.profilePhotoPath),
  ]);

  return <EditProfileForm record={record} heroPhotoUrl={heroPhotoUrl} profilePhotoUrl={profilePhotoUrl} />;
}
