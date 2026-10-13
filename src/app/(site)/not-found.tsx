import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

/**
 * The App Router's 404 surface, shown for any unmatched route and for every
 * `notFound()` call WITHIN THIS ROUTE GROUP — see the `(site)` placement
 * note below.
 *
 * Lives in `(site)/` rather than the true `app/` root (moved there during
 * the Phase 2 route-group refactor that gave `/guardian/*` its own
 * chrome-free layout — see `src/app/layout.tsx`'s own comment). This is a
 * FIX for a regression that refactor introduced and a live `npm start`
 * check caught: a `not-found.tsx` at the true root is wrapped ONLY by the
 * true root layout, never by `(site)/layout.tsx` — so an athlete-slug 404
 * (`[slug]/page.tsx` calling `notFound()`) rendered with NO Header/Footer
 * once Header/Footer moved out of the root layout, even though every other
 * `(site)` page kept them. Living here instead makes this the NEAREST
 * `not-found.tsx` for every route inside `(site)` (including `[slug]`), so
 * it is wrapped by `(site)/layout.tsx` exactly like a normal page is.
 * `/guardian/*` has no `not-found.tsx` of its own and intentionally falls
 * back to Next's own generic, unbranded 404 rather than this one — showing
 * athlete-facing marketing copy ("Create your Athlesite") on a mistyped
 * guardian link would be more wrong than showing nothing branded at all.
 *
 * The wording is deliberately generic and identical in every case. `/[slug]`
 * calls `notFound()` for two different situations — no such slug, and a real
 * profile that is unpublished and not yours — and those must stay
 * indistinguishable from outside. Anything that hinted "this one exists but is
 * private" would turn this page into an oracle for whether a given athlete has
 * claimed a username (docs/ai/DECISIONS.md § `is_published` is the only
 * public-visibility switch). So: no slug echoed back, no "private", no
 * "unpublished", no distinction of any kind.
 */
export default function NotFound() {
  return (
    <Section>
      <Container className="max-w-xl text-center">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent-light">
          404
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          This page isn&apos;t here
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          The link may be mistyped, or it may have changed. If an athlete sent you their
          Athlesite, ask them to share it again — athletes can change their link.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button href="/">Go to homepage</Button>
          <Link
            href="/get-started"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Create your Athlesite →
          </Link>
        </div>
      </Container>
    </Section>
  );
}
