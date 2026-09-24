import type { Metadata } from "next";
import { Anton, Geist, Geist_Mono, Oswald } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
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
        <Header />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
