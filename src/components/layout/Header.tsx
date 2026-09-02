import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { MobileNav } from "@/components/layout/MobileNav";

export const navLinks = [
  { href: "/#for-athletes", label: "For Athletes" },
  { href: "/#recruiting", label: "Recruiting" },
  { href: "/#nil", label: "NIL" },
  { href: "/#resources", label: "Resources", hasMenu: true },
  { href: "/#about", label: "About" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-background/95 backdrop-blur-md">
      <Container
        size="wide"
        className="grid h-16 grid-cols-[auto_1fr_auto] items-center gap-6 lg:h-[92px]"
      >
        <Logo />

        <nav
          aria-label="Primary"
          className="hidden items-center justify-center gap-9 lg:flex lg:gap-11"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm text-[0.9rem] font-medium text-white/75 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {link.label}
              {link.hasMenu ? <ChevronIcon /> : null}
            </Link>
          ))}
        </nav>

        <div className="hidden justify-self-end lg:block">
          <Button href="/get-started" shape="rounded" className="h-10 whitespace-nowrap px-5 text-[0.9rem]">
            Create Your Athlesite
          </Button>
        </div>

        <div className="justify-self-end lg:hidden">
          <MobileNav links={navLinks} />
        </div>
      </Container>
    </header>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
      <path d="M1 1.25 5 4.75l4-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
