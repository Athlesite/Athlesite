"use client";

import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import {
  AGE_GATE_MINOR_BODY,
  AGE_GATE_MINOR_HEADING,
  AGE_GATE_UNDER_13_BODY,
  AGE_GATE_UNDER_13_HEADING,
} from "@/lib/age-gate-copy";

type AgeBlockedProps = {
  /** Which outcome produced the block. The two say different things on purpose. */
  reason: "under_13" | "minor";
};

/**
 * Terminal state for an athlete the pilot cannot serve yet.
 *
 * "Terminal" is the point: the wizard renders this *instead of* the step machinery, so
 * there is no Back button, no progress bar, and no control that leads onward. There is
 * also deliberately **no way to re-enter a date** — no edit link, no "try again", no
 * pre-filled form. Offering one would be an invitation to answer differently, which is
 * precisely the dark pattern this gate is meant to avoid.
 *
 * The only forward action is a link home, so the page is not a dead end for someone who
 * simply wants to leave.
 *
 * A refresh does reset the gate, because eligibility is memory-only. That is a direct
 * consequence of the pre-auth privacy fix (PR #26) and is accepted: persisting a
 * "blocked" marker would mean storing data about a child Athlesite just declined to
 * serve. This is a normal-product-path control, not age assurance.
 */
export function AgeBlocked({ reason }: AgeBlockedProps) {
  const heading = reason === "under_13" ? AGE_GATE_UNDER_13_HEADING : AGE_GATE_MINOR_HEADING;
  const body = reason === "under_13" ? AGE_GATE_UNDER_13_BODY : AGE_GATE_MINOR_BODY;

  return (
    <Section>
      <Container className="max-w-xl">
        <SectionHeading title={heading} />
        <p className="mt-4 text-sm text-muted-foreground">{body}</p>
        <p className="mt-8 text-sm">
          <Link href="/" className="text-foreground underline-offset-4 hover:underline">
            Back to Athlesite
          </Link>
        </p>
      </Container>
    </Section>
  );
}
