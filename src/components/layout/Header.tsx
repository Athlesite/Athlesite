import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { MobileNav } from "@/components/layout/MobileNav";

export const navLinks = [
  { href: "/#for-athletes", label: "For Athletes" },
  { href: "/#recruiting", label: "Recruiting" },
  { href: "/#nil", label: "NIL" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between sm:h-20">
        <Logo />

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-sm text-sm font-medium text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button href="/get-started" size="sm">
            Create Your Athlesite
          </Button>
        </div>

        <MobileNav links={navLinks} />
      </Container>
    </header>
  );
}
