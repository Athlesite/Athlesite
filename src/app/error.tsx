"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

/**
 * The App Router's error boundary for everything below the root layout.
 *
 * Before this existed, an unhandled server render — a Supabase outage, a
 * missing environment variable, a schema drift — reached a visitor as the raw
 * framework error screen. On an athlete's public profile that is the moment
 * their credibility is on screen, so it gets a real page.
 *
 * Nothing about the underlying failure is rendered. `error.message` and
 * `error.stack` are never shown: in production Next already replaces the
 * message with a generic string and a digest, but this boundary also runs in
 * development, where the real message *is* present and can name internal
 * modules, table names, or environment variables. The digest is logged to the
 * console for a developer with the browser open, and deliberately not painted
 * into the page.
 *
 * There is still no server-side error reporting, so a failure here is invisible
 * to the founders unless the athlete reports it (docs/ai/NOW.md).
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Console only — never rendered. Gives a developer something to correlate
    // with a server log without exposing anything to a visitor.
    console.error("[athlesite] unhandled error", error.digest ?? "(no digest)");
  }, [error]);

  return (
    <Section>
      <Container className="max-w-xl text-center">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent-light">
          Something went wrong
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          This page didn&apos;t load
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          We couldn&apos;t load this page. Try again in a moment, or return to the homepage.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Go to homepage
          </Link>
        </div>
      </Container>
    </Section>
  );
}
