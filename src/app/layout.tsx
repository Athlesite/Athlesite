import type { Metadata } from "next";
import { Anton, Geist, Geist_Mono, Oswald } from "next/font/google";
import { resolveSiteUrl } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial sports display face for headlines and athlete name-plates.
const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

// Condensed companion for stat numbers, eyebrows, and broadcast-style labels.
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  /**
   * The base every relative metadata URL resolves against. Supplied by
   * NEXT_PUBLIC_SITE_URL, falling back to localhost so local development and
   * a bare `npm run build` need no configuration — see site-url.ts, which
   * throws rather than silently accepting a malformed value.
   *
   * No page sets an Open Graph or Twitter image yet, so nothing resolves
   * against this today; it is here so the first one that does is correct in
   * production rather than pointing at localhost.
   */
  metadataBase: resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  title: "Athlesite — Your Name. Your Game. Your Brand.",
  description:
    "Athlesite gives athletes one professional digital home for their identity, recruiting story, and brand.",
};

/**
 * The true root layout: `<html>`/`<body>`, shared fonts, and the global
 * metadata base. Deliberately holds no site chrome (Header/Footer) — those
 * live in `(site)/layout.tsx` so a route outside that group (`/guardian/*`)
 * shares fonts and the skip link but renders no public-site navigation.
 *
 * This is the fix for the thing a nested layout alone cannot do: Next renders
 * every layout from the root down, so if Header/Footer lived here they would
 * wrap `/guardian/*` too regardless of what any layout below this one does.
 * Moving them into a sibling route group's own layout is what actually keeps
 * them scoped to the routes that opt into that group.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} ${oswald.variable} antialiased`}
    >
      <body className="flex min-h-screen flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-foreground"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
