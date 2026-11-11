# Athlesite design reference

The finished design of the athlete experience, connected end to end: the homepage, the Studio setup and
editor, and the athlete pages they make. For CFul (and anyone porting it) to see the product as
designed and to plan the backend against it.

**Start here: open `index.html` in a browser** (double-click it; no install, no server). It walks the
flow in order and shows each of the 15 example pages three ways: the full design, **published today**
(only the product's public fields), and **as a minor's page**.

**This is a design reference, not production code.** Nothing here is wired to Supabase, and nothing in
this folder is served by the Next.js app (it serves `public/` and `src/app/` only).

## What's inside

| Path | What |
| --- | --- |
| `index.html` | Start page: the flow, the examples, links to everything below |
| `01-COMPARISON.md` | The Studio lab vs the product on `main` (fresh read-only comparison) |
| `02-VISIBILITY-MATRIX.md` | Every field: adult, minor, owner preview, guardian review, public |
| `03-BACKEND-HOOKS.md` | Every place in the lab where a stand-in does the backend's job |
| `studio-v1/` | Snapshot of the Studio lab: the editor (`studio.html`), athlete pages (`site.html`), the five looks, 15 examples, tests (`tools/`), and its own notes (`HANDOFF.md`, `PORTING.md`, `DECISIONS-SESSION-7.md`) |
| `homepage-v2/` | Snapshot of the homepage design (it loads the Studio's looks and examples from `../studio-v1/`) |
| `brand/` | Current brand masters |
| `archive/` | Earlier reference material, kept for history |

## Version

| | |
| --- | --- |
| Studio lab | `athlesite-design` @ `26faec9` (local design repo, 2026-11-10) |
| Homepage | its last committed version in the same lab repo |
| Product compared against | `main` @ `ef04553` (2026-10-14) |

The lab stays the working copy. This folder is refreshed from it when the design changes, so edit the
lab, not this copy.

## Status and limits

- Everything about visibility, sign-up order, storage and publishing is a **proposal for the two
  founders**, following CFul's porting responses (2026-11-10). It authorizes no migrations, RLS or
  Storage changes, auth changes or deployment.
- The 15 athletes are **fictional**. Some sections they show (stats, NIL, gallery, contact, socials)
  are not approved for public pages; the "Published today" view shows what is.
- Example photos are from Pexels, credited in `studio-v1/PHOTO-CREDITS.md`.
- The Reel and Folio motion is adapted from motionin; its licence must be confirmed before shipping.

## Running the lab's tests (optional)

The tests drive a local Chrome. They need Node, and are run from `studio-v1/`:
`node tools/run-all.js` (or `--quick`). See `studio-v1/tools/README.md`. They check rendering,
accessibility, layout and the setup flow; they don't test authorization.
