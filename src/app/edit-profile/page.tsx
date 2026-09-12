import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EditProfileView } from "./EditProfileView";
import { EditProfileSignIn } from "@/components/edit-profile/EditProfileSignIn";
import { getOwnProfile, signMediaUrl } from "@/lib/profile-repository";
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
 * Three states, resolved server-side in order:
 *  - no session            -> render the inline OTP sign-in gate in place
 *  - session, no profile   -> redirect to /get-started (nothing to manage yet)
 *  - session, has profile  -> load and render the full row, read-only
 *
 * getUser() revalidates with the Auth server rather than trusting a cached
 * session (see docs/ai/GUARDRAILS.md § Ownership) — the same helper the
 * public profile page already uses to decide whether to show an edit link.
 */
export default async function EditProfilePage() {
  const user = await getUser();

  if (!user) {
    return <EditProfileSignIn />;
  }

  const record = await getOwnProfile(user.id);

  if (!record) {
    redirect("/get-started");
  }

  const heroPhotoUrl = await signMediaUrl(record.heroPhotoPath);

  return <EditProfileView record={record} heroPhotoUrl={heroPhotoUrl} />;
}
