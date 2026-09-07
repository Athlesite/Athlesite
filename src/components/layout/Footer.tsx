import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <Container className="flex flex-col items-start justify-between gap-6 py-12 sm:flex-row sm:items-center">
        <div>
          <Logo />
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            One professional digital home for every athlete&apos;s identity, recruiting
            story, and brand.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Athlesite. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}
