import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

/**
 * Site chrome for every public/athlete route: the marketing header, the
 * skip-link target `<main>`, and the footer. Everything under this route
 * group shares it; `/guardian/*` lives outside the group and gets none of it
 * — see the root layout's own comment for why that split is structural, not
 * incidental.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
