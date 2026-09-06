# Intake — filtered Athlesite principles

Durable principles that actually change decisions. **Not** a notes file, a reading list,
or a transcript archive.

**Filter — three yeses or it does not go in:**
1. Is it specific to Athlesite's situation, rather than generic startup or AI advice?
2. Would it change a decision we would otherwise make?
3. Will it still be true in six months?

**Format.** One principle, two lines at most, plus what it changes. No quotes, no
sources, no attributions. Raw source material never enters this repository.

**Cap ~15.** Adding a sixteenth means retiring one. A principle that starts governing
implementation is no longer a principle — promote it to `DECISIONS.md` or
`GUARDRAILS.md` and remove it here.

---

- **The software is not the moat.** Athlete value, distribution, adoption, trust,
  data/network effects, and brand are what compound.
  *Changes:* work is justified by athlete outcome and reach, not by technical
  sophistication. A feature no athlete shares is not progress.

- **Athletes should own their digital identity.** The profile is the athlete's, not
  Athlesite's.
  *Changes:* ownership and control are product requirements, not settings. Anything that
  makes an athlete's page feel like Athlesite's asset is wrong.

- **One shareable link is the whole wedge.** Discipline here is the strategy.
  *Changes:* if a feature does not make the link more worth sending, it waits.

- **Trust is a feature and it is fragile.** These are high-school athletes, many of them
  minors, being viewed by adults with leverage over their future.
  *Changes:* privacy, accuracy, and control get weighted above growth mechanics. No dark
  patterns and no bulk exposure of athletes.

- **A link that breaks is worse than a link that never existed.** Sharing is the point.
  *Changes:* URL stability outranks naming flexibility. See `DECISIONS.md §
  Identity & Slugs`.

- **Keep the domain model vendor-independent.** Vendors are rented; the model is owned.
  *Changes:* vendor types stay behind a mapper. Infrastructure convenience never
  justifies vendor concepts in the product model.

- **Never sacrifice security for speed.** Especially around athlete data.
  *Changes:* a shortcut through auth, RLS, or ownership is not a shortcut — it is
  a different, worse product.

- **Preserve existing work.** Multiple founders and multiple AI agents work in parallel.
  *Changes:* inspect before editing; never reset or absorb someone's branch. When work
  overlaps, stop and ask.

- **Understand the user problem before building.** The athlete's problem is being taken
  seriously by people who decide their future.
  *Changes:* features get argued from that problem, not from what is easy to build or
  demo.

- **Use AI-assisted development responsibly.** Agents implement; founders decide.
  *Changes:* consequential architecture, product direction, and security boundaries come
  back to the founders. See `GUARDRAILS.md § Authority`.

- **Filter incoming advice for signal.** Most general startup and AI content is not
  written about Athlesite's situation.
  *Changes:* nothing enters this file without passing the three-question filter above.
