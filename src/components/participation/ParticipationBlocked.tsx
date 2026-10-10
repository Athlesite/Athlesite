import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { VisibilityOnlyPanel } from "@/components/participation/VisibilityOnlyPanel";
import type { ParticipationStatus } from "@/lib/participation";

type ParticipationBlockedProps = {
  status: Exclude<ParticipationStatus, "absent" | "adult_approved">;
  publicationState: { exists: boolean; isPublished: boolean };
};

const HEADINGS: Record<ParticipationBlockedProps["status"], string> = {
  minor_pending: "Waiting on a parent or guardian",
  minor_approved: "Athlesite accounts for athletes under 18 aren't available yet.",
  minor_declined: "Your request wasn't approved",
  revoked: "Participation was withdrawn",
  expired: "Your request has expired",
};

const BODIES: Record<ParticipationBlockedProps["status"], string> = {
  minor_pending:
    "We're waiting to hear back from the parent or guardian email you provided.",
  minor_approved:
    "Guardian participation approval covers taking part, not publishing yet. A separate " +
    "approval is needed before anything can go public — that isn't available during the " +
    "pilot.",
  minor_declined: "A parent or guardian didn't approve this request.",
  revoked: "A parent or guardian withdrew their earlier approval.",
  expired: "That request is no longer valid. You're welcome to start again.",
};

/**
 * Rendered by `/edit-profile` for every gated status except "absent" — the
 * "blocked" route from resolveEditProfileRoute. No code path in Phase 1a can
 * produce any of these statuses yet (no bracket='minor' row can exist), so this
 * component is exercised only by tests until the later guardian-request phases
 * land; it ships now so the routing and the visibility control are complete and
 * reviewable together, rather than arriving piecemeal.
 *
 * Carries no Back button, no step machinery, and no route back into the editor —
 * the same "terminal, not a dead-end-looking step" shape as onboarding's own
 * AgeBlocked. The one thing offered beyond the plain message is VisibilityOnlyPanel,
 * because reducing public exposure must remain available in every one of these
 * states.
 */
export function ParticipationBlocked({ status, publicationState }: ParticipationBlockedProps) {
  return (
    <Section className="py-16 sm:py-20">
      <Container className="max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {HEADINGS[status]}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{BODIES[status]}</p>

        <div className="mt-6">
          <VisibilityOnlyPanel exists={publicationState.exists} isPublished={publicationState.isPublished} />
        </div>
      </Container>
    </Section>
  );
}
