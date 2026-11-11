# 02 · Field visibility matrix

Every field the Studio collects, and who can see it. CFul asked for it with five columns: adult,
minor, owner preview, guardian review, public.

**Status: a proposal for the two founders, not approved policy.** Facts marked "on `main`" were
checked in code at `ef04553`. Everything else follows CFul's porting responses (2026-11-10) or is
marked as needing a decision.

## How to read it

- **Public today:** returned by `get_published_profile_by_slug` (the 18-column contract on `main`).
- **Stored, private:** a column exists on `main`; the owner sees it, the public never does.
- **New, not stored:** only exists in the Studio. **It defaults to private** until each field has an
  approved column, projection and review (CFul: "new data categories default private").
- **Owner preview:** what the signed-in athlete sees while editing. It's always private.
- **Guardian review** (minors, later): the guardian approves exactly what the minor's public page
  would show, nothing more and nothing less.
- **Public:** what an anonymous visitor or an unrelated signed-in athlete can read.

Two columns are the same for every row, so they aren't repeated in the table:
- **Owner preview** shows everything the athlete entered.
- **Guardian review** shows exactly the minor public value.

## The matrix

| Studio field | On `main` | Adult public | Minor public (when minors open) |
| --- | --- | --- | --- |
| **Identity** | | | |
| `firstName`, `lastName` | Public today | First + last name | **First name + last initial** by default; full name only by athlete *and* guardian choice |
| `slug` (link name) | Public today | Existing rules, chosen near Publish | Athlete-chosen handle; **no real-name default** |
| `sport`, `position` | Public today | Yes | Yes (reduced projection) |
| `classYear` | Public today | Yes | Optional; shown in guardian review |
| `level` (HS / college), `academicYear` | New, not stored | Private (decide) | Private |
| `jerseyNumber` | New, not stored | **Decide.** Several looks lead with it | Private (decide) |
| `tagline` | New, not stored | Decide | Decide (bio rules apply) |
| `schoolOrTeam` | Stored, private | Private | Private |
| `city` | Public today | Yes | **Omitted** |
| `state` | Public today | Yes | Optional |
| `heightIn`, `weightLb` | Public today | Yes | **Private by default**; public only by deliberate choice |
| `bio` | Public today | Yes | Yes, with guidance: no address, phone, personal email, schedule or locations |
| **Photo** | | | |
| `heroPhotoUrl` → `hero_photo_path` | Public today (hero only) | Yes, via the server pipeline | Optional; in guardian review |
| `heroPhotoPositionX/Y`, `heroPhotoZoom` | Public today | Yes (**default Y differs: 0 vs Studio 0.3**) | Same |
| `heroPhotoAlt` | New, not stored | Proposed public with the photo | Reviewed with the photo |
| **Film** | | | |
| `highlightLinks` | Public today | Yes (validated HTTPS video links) | Approved HTTPS destinations only |
| Video posters (thumbnails) | New, not stored | **Deferred** (Storage review) | Deferred |
| **Recruiting** | | | |
| `recruitingStatus` | Stored, private | Private (public status deferred) | Private |
| `recruitingContact` | Stored, private | **Private**. See note A | Private |
| `recruitingNotes` | Stored, private | Private | Private |
| `profileLinks` (On3, 247, Rivals…) | New, not stored | Private / unsupported | Private |
| `committedTo`, `transferPortal`, `draftEligible`, `redshirt`, `eligibility`, `division`, `conference` | New, not stored | Private (deferred) | Private |
| **Social** | | | |
| `social.*` (Instagram, X, TikTok, YouTube, Hudl, website) | Stored, private | **Private / unsupported publicly**. See note B | Restricted list, needs review |
| **NIL** | | | |
| `nilOpen`, `nilContact`, `nilInterests` | Stored, private | Private (deferred) | Private |
| `nilOffers`, `nilAudience`, `nilPartners`, `nilContactRole` | New, not stored | Private (deferred) | Private |
| **Academics** | | | |
| `gpa`, `intendedMajor` | New, not stored | Private (deferred) | Private |
| **Page content** | | | |
| `stats` | New, not stored | **Decide** (field-level approval) | Private |
| `milestones` | New, not stored | Decide | Private |
| `results`, `resultsTitle`, `resultColumns` | New, not stored | Decide | Private |
| `sportDetails` (bats/throws, dominant foot…) | New, not stored | Decide | Private |
| `custom` (own section) | New, not stored | Decide (bio rules) | Private |
| `gallery` | New, not stored | **Deferred** (Storage + projection review) | Deferred |
| **Design** | | | |
| `design.*` (look, palette, accent, fonts, cover, layouts, order, hidden, mark, intro) | New, not stored | Proposed: allow-listed public presentation config | Same; decide which changes need guardian re-approval |

## What a published page can show today

With only today's 18 public fields, a page shows:
- the name, sport and position, class year, city and state, height and weight;
- the bio, the hero photo (with its crop), and highlight video links;
- the design, once a design field is approved.

The reference's **"Published today"** view renders each example this way, so the gap is visible on the
page itself.

## Notes for the founders

**A. Contact.** Every Studio look has a **Contact** button: in the nav, the About card, and now the
footer. It uses `recruitingContact`, which is private today. Under today's contract, published pages
would have **no contact at all**, and a coach couldn't reach the athlete. This is probably the most
important field to decide first. One option is a contact-only public field (a relay form or a
masked email) instead of the raw address.

**B. Social links.** These are stored on `main` but not public. The Studio shows them in the footer and
"Find me on". They're low-risk for adults, but they are personal accounts. Decide alongside A.

**C. Jersey number and stats.** Highlight and Cinematic lead with the number. Prospect and the cards
lead with stats. Without them, those covers fall back to their no-number / no-stats layouts, which
already exist and are tested. They still look finished, just less specific.
