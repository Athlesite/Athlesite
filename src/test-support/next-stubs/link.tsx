/**
 * Test double for `next/link`.
 *
 * The real module reaches for browser globals (`self`) and the router context. An
 * anchor is all these tests need: they assert where a link points, not how Next
 * prefetches it.
 *
 * Mapped in by scripts/alias-resolver-hook.mjs, which is test-time only.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: ReactNode;
};

export default function Link({ href, children, ...rest }: LinkProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
