import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { MobileNav } from "@/components/layout/MobileNav";

export const navLinks = [
  { href: "/#for-athletes", label: "For Athletes" },
  { href: "/#recruiting", label: "Recruiting & NIL" },
  { href: "/athletes/jordan-bell", label: "Example Profile" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <Container
        size="wide"
        className="grid h-16 grid-cols-[auto_1fr_auto] items-center gap-6 lg:h-[92px]"
      >
        <Logo className="relative z-50" />

        <nav
          aria-label="Primary"
          className="hidden items-center justify-center gap-10 lg:flex"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative inline-flex min-h-11 items-center whitespace-nowrap rounded-sm text-[0.875rem] font-medium text-muted-foreground transition-colors after:absolute after:inset-x-0 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-accent after:transition-transform hover:text-foreground hover:after:scale-x-100 focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden justify-self-end lg:block">
          <Button href="/get-started" shape="rounded" className="h-10 whitespace-nowrap px-5 text-[0.875rem]">
            Get Started
          </Button>
        </div>

        <div className="justify-self-end lg:hidden">
          <MobileNav links={navLinks} />
        </div>
      </Container>
    </header>
  );
}
