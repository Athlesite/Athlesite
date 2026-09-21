import type { AthleteProfileView, HighlightLink, RecruitingStatus } from "@/lib/athlete-profile";

/**
 * What a profile surface may truthfully say, as pure rules.
 *
 * Kept dependency-free and separate from the .tsx components (which this
 * project's plain node:test runner cannot import — see save-state.ts's own
 * docblock for the same reasoning) so the one thing this checkpoint is
 * actually about — never rendering a claim the athlete did not make — is
 * directly testable. See profile-display.test.ts.
 *
 * The governing rule: **a claim is rendered only when its surface can supply
 * the athlete's real value for it.** An absent value means "this surface
 * cannot know", which must render nothing — never a default, and never the
 * opposite claim. A public profile can never know an athlete's recruiting or
 * NIL posture, because neither column is in the approved anonymous 18
 * (docs/ai/DECISIONS.md § Anonymous reads are column-scoped), so a public
 * profile renders neither.
 */

/**
 * An athlete's real recruiting/NIL posture, supplied only by a surface that
 * can genuinely source it.
 *
 * Today that is exactly one surface: the fictional Jordan Bell example, which
 * holds a complete in-repo fixture and is explicitly banner-labelled as
 * sample content. Real public profiles, the owner's edit preview, and
 * onboarding's preview all pass `undefined` — the previews deliberately so,
 * since a preview that showed more than the public page would teach an
 * athlete their posture is published when it is not.
 */
export type RecruitingPosture = {
  recruitingStatus: RecruitingStatus;
  nilOpen: boolean;
};

/**
 * The recruiting sentence, or null when no claim may be made.
 *
 * `undecided` deliberately yields null rather than "hasn't decided": an
 * athlete who never touched the field has the same stored value as one who
 * chose it deliberately, so there is nothing truthful to say either way.
 */
export function recruitingClaim(name: string, posture?: RecruitingPosture): string | null {
  if (!posture) return null;

  const who = name.trim() || "This athlete";

  if (posture.recruitingStatus === "open") {
    return `${who} is open to recruiting conversations with college programs.`;
  }
  if (posture.recruitingStatus === "not_open") {
    return `${who} is not currently seeking recruiting conversations.`;
  }
  return null;
}

/** Whether the NIL block may be rendered at all. Absent posture means no. */
export function showNilSection(posture?: RecruitingPosture): boolean {
  return posture !== undefined;
}

/**
 * The NIL sentence, or null when no claim may be made.
 *
 * Unlike recruiting status, `nilOpen` is a boolean with no "undecided" —
 * false is a real stored answer, so it can be stated truthfully when the
 * surface has it.
 */
export function nilClaim(name: string, posture?: RecruitingPosture): string | null {
  if (!posture) return null;

  const who = name.trim() || "This athlete";

  return posture.nilOpen
    ? `${who} is open to NIL and business partnerships.`
    : `${who} is not currently taking NIL or business inquiries.`;
}

/**
 * The factual line under the Recruiting heading — position, class year,
 * location, height/weight.
 *
 * Every part is athlete-entered and already inside the public 18 columns, so
 * this is the one thing the recruiting section can always show truthfully.
 * Empty parts are dropped rather than joined, so a missing value can never
 * produce a dangling separator.
 */
export function recruitingFacts(athlete: AthleteProfileView): string {
  return [
    athlete.position,
    athlete.classYear ? `Class of ${athlete.classYear}` : "",
    athlete.location,
    athlete.heightWeight,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The hero's sport/position line. Empty parts dropped — never a bare "·". */
export function heroHeadline(athlete: AthleteProfileView): string {
  return [athlete.sport, athlete.position].filter(Boolean).join(" · ");
}

/**
 * The hero's class-year/location line.
 *
 * "Class of" is only emitted alongside an actual year, so an athlete with no
 * class year never gets a stranded "Class of ·".
 */
export function heroMeta(athlete: AthleteProfileView): string {
  return [athlete.classYear ? `Class of ${athlete.classYear}` : "", athlete.location]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The highlights actually worth rendering.
 *
 * A highlight with a label but no URL renders as a card with a play icon that
 * does nothing — it looks like film a coach can watch and isn't. On a real
 * profile those are dropped. The fictional example keeps them, because
 * demonstrating the empty-slot presentation is the point of a labelled demo.
 */
export function usableHighlights(
  highlights: HighlightLink[],
  options: { example?: boolean } = {}
): HighlightLink[] {
  if (options.example) return highlights;
  return highlights.filter((highlight) => highlight.url.trim() !== "");
}
