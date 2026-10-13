import type { Metadata } from "next";
import { GuardianParticipationClient } from "./GuardianParticipationClient";

/**
 * Guardian bearer participation approval — `/guardian/participation#token=...`.
 *
 * A credential-bearing approval surface, not a normal page: generic metadata,
 * no indexing, no personalized server rendering, and nothing credential- or
 * guardian-specific in the server response. The bearer token lives only in
 * the URL fragment, which this Server Component never sees — fragments are
 * never sent to the server by the browser at all, so there is nothing here to
 * leak even in principle. All real work happens client-side in
 * GuardianParticipationClient, after the fragment is captured and cleared.
 *
 * This route deliberately renders OUTSIDE the `(site)` route group — see
 * src/app/layout.tsx's own comment — so it gets no Header, no Footer, and no
 * public-site navigation chrome.
 */
export const metadata: Metadata = {
  title: "Guardian approval",
  description: "Guardian participation approval.",
  robots: {
    index: false,
    follow: false,
  },
};

// Every request is independent (a fresh bearer token, or none); nothing about
// this route may be cached or reused across requests.
export const dynamic = "force-dynamic";

export default function GuardianParticipationPage() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen items-center justify-center px-6 py-16"
    >
      {/*
        id="main-content" is the true root layout's skip-link target
        (src/app/layout.tsx's "Skip to content" anchor). That skip link is
        shared by every route under the true root, guardian included — this
        route renders outside `(site)/layout.tsx` (which supplies its OWN
        `#main-content` for every normal site page), so without this id here
        specifically, the guardian route would be the one page where
        "Skip to content" silently did nothing.
      */}
      <div className="w-full max-w-md">
        <GuardianParticipationClient />
      </div>
    </main>
  );
}
