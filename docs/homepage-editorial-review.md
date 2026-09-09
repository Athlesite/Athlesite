# CW homepage editorial overhaul — review checkpoint

2026-09-09. Review branch: `willy/homepage-editorial-overhaul`.
Base: `136990f5b09ad3490cb93aa3b0b740464a280904` on the saved Brand V1 branch.

## Scope and authority

CW requested a complete public-homepage overhaul while preserving the approved
brand and athlete-identity concept. The baseline includes the restored layered
Section 01 and prior phone refinement. Existing local worktrees are untouched.
This branch does not merge or replace newer product/backend work on main.

`docs/ai/NOW.md` and the old Brand V1 description in `DECISIONS.md` are stale on
this branch. Do not interpret their flat-vector statement as permission to replace
the founder-approved reference artwork used by `Logo.tsx`. No brand file changes.

## Design changes

- Photographic hero; approved headline and cobalt/black identity remain.
- One coherent phone/laptop preview shares the canonical Jordan example data.
- Photo-first editorial sections replace abstract SVG athletes and unrelated themes.
- Native expandable feature explanations and FAQ work without JavaScript.
- Product hierarchy: introduction → profile → content → individuality → setup → FAQ → CTA.
- Removed invented season numbers, five-star ratings, and unverified nationwide trust.
- All new CSS is module-scoped. Onboarding, live athlete pages, shared header/footer,
  brand masters, global tokens, authentication, storage, and database code unchanged.
- New homepage loaded from `src/app/page.tsx`. Old marketing components remain for
  comparison and rollback; they are not rendered by this homepage.

## Important limits

- Device content is a *design illustration*, not a screenshot of a shipped profile.
  Visible disclosure distinguishes it from the unchanged live example route.
- Real stock photography is illustrative, not an athlete endorsement. Check the
  source/permissions notes in `public/marketing/editorial/README.md` before launch.
- The shared browser blocked both localhost and local-file navigation. No browser
  workaround was attempted after that explicit policy rejection. Visual browser QA
  is **pending**; a successful build is not visual approval.
- The offline HTML handoff is a static layout preview with native disclosures. It
  does not contain Next.js hydration, the mobile menu, or scroll entrance animations.
- Main has subsequent product/security work. Integrate through review, not by
  replacing main or merging old product state wholesale.

## Motion and responsiveness

- Existing Anton / Geist / Oswald font setup unchanged.
- Entrance enhancement: 480 ms, 16 px, once, using Web Animations + IntersectionObserver.
  Content is visible without JS. Reduced motion skips/cancels animations.
- Button transitions: 180 ms; photo hover: 500 ms, 1.035 scale, pointer devices only.
- No new animation dependency, custom cursor, video autoplay, or scroll hijacking.
- Desktop bounded hero; at <=600 px text and phone stack without horizontal scaling.
- All native controls keep keyboard focus outlines. No clickable controls inside the
  decorative device screens; an actual example link sits outside the preview.

## Validation and acceptance

Run `npm run lint`, `npm run build`, and `npx tsc --noEmit` before committing.
Also run `node --test tests/homepage-editorial.test.mjs` after a production build.

Completed in this review: ESLint PASS, production build PASS, TypeScript PASS,
all 6 structural tests PASS, and `git diff --check` PASS. The standalone layout
preview embeds its photographs, CSS, and fonts and contains no app scripts or
unresolved `/_next/` resource paths. This is byte/structure verification, not a
browser rendering test.

Before design approval, inspect at 390×844, 768×1024, 1366×768, and 1440×900:

1. Hero photo framing, title legibility, phone fit, and above-fold CTA.
2. No horizontal overflow, clipped headings, tiny body copy, or stretched device shells.
3. Feature and FAQ keyboard open/close, focus visibility, and anchor offsets.
4. Existing mobile menu open/close, Escape, focus trap, and route navigation.
5. Real example and signup links; reduced-motion setting; no-JS content visibility.
6. Image requests, layout shift, hydration errors, and performance in a production preview.

Do not call this visually verified until these browser checks have been performed.
