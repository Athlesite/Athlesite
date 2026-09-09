"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/supabase/auth";
import { toAthleteProfileRow } from "@/lib/db-mappers";
import type { AthleteProfileData } from "@/lib/athlete-profile";

/**
 * Save/publish an athlete's profile to Supabase.
 *
 * Runs as the signed-in athlete from the browser, so RLS is the enforcement
 * layer rather than anything in this file. There is no service-role key in this
 * project by design (docs/ai/DECISIONS.md § Auth & Ownership).
 *
 * Reads live in profile-repository.ts, which is server-side. This module is the
 * write half and is client-only, because the session is established in the
 * browser by the inline OTP flow.
 */

export type SaveProfileResult =
  | { ok: true; slug: string }
  | { ok: false; message: string; field?: "slug" };

/**
 * Postgres error codes we can say something useful about. Anything else gets a
 * calm fallback — a raw PostgREST message must never reach an athlete.
 */
function describeError(code: string | undefined, message: string): SaveProfileResult {
  // Unique violation. Two unique constraints exist on this table, so decide
  // which one from the constraint name in the message.
  if (code === "23505") {
    if (message.includes("slug")) {
      return {
        ok: false,
        field: "slug",
        message: "That username is already taken. Go back and choose another.",
      };
    }
    return {
      ok: false,
      message: "You already have a profile. Refresh the page and try again.",
    };
  }

  // RLS rejected the write — no session, or owner_user_id did not match auth.uid().
  if (code === "42501") {
    return { ok: false, message: "You need to be signed in to save your Athlesite." };
  }

  // A column check constraint failed (hero zoom range, recruiting status enum).
  if (code === "23514") {
    return { ok: false, message: "Something in your profile isn't valid. Go back and review it." };
  }

  return { ok: false, message: "Couldn't save your Athlesite. Try again in a moment." };
}

/**
 * Creates the athlete's profile row, or updates it if they already have one.
 *
 * The conflict target is `owner_user_id`, not the primary key. It is unique but
 * not the PK, and PostgREST resolves conflicts on the PK by default — without
 * this, a repeat save would attempt a second insert and fail rather than update.
 *
 * Ownership comes from getCurrentUser(), never from the profile argument, so a
 * caller cannot aim this at somebody else's row. RLS would reject that anyway.
 */
export async function saveProfile(profile: AthleteProfileData): Promise<SaveProfileResult> {
  let userId: string;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, message: "You need to be signed in to save your Athlesite." };
    }
    userId = user.id;
  } catch {
    return { ok: false, message: "Couldn't confirm your account. Try again in a moment." };
  }

  const row = toAthleteProfileRow(profile, userId);

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("athlete_profiles")
      .upsert(row, { onConflict: "owner_user_id" })
      .select("slug")
      .single();

    if (error) {
      return describeError(error.code, `${error.message} ${error.details ?? ""}`.toLowerCase());
    }

    if (!data?.slug) {
      return { ok: false, message: "Saved, but couldn't confirm your profile link. Try again." };
    }

    return { ok: true, slug: data.slug };
  } catch {
    return { ok: false, message: "Couldn't reach Athlesite. Check your connection and try again." };
  }
}
