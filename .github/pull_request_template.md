## Summary

<!-- What changed and why. -->

## Validation performed

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run check:columns` — public projection / anonymous-access boundary
      (if `supabase/migrations/` or the public column list in
      `src/lib/profile-repository.ts` changed)

## Database migrations / rollback

<!-- New migration files, and how to undo them if something goes wrong.
     Write "None." if this PR touches no migration. -->

## Supabase RLS / grants / Storage policy impact

<!-- Any change to row-level security, table or column grants, or Storage
     policies — what changed and why it's still safe. Write "None." if there
     is no impact. -->

## Auth / privacy impact

<!-- Anything touching authentication, ownership, or what athlete data is
     readable by whom. Answer in terms of OUTCOMES rather than mechanism, so the
     answer stays meaningful as the implementation changes:

       - anonymous caller: which fields, for which profiles, through which path?
       - can anything be listed or enumerated without knowing a slug?
       - an unrelated SIGNED-IN athlete: can they read another athlete's row, or
         any private column of one?
       - owner: can they still read their own full row, and still preview their
         own unpublished profile?
       - media: is any object readable that a published profile does not
         currently reference?

     Write "None." if there is no impact. -->

## Screenshots

<!-- Before/after, for any visible UI change. Write "Not applicable." otherwise. -->

## Known risks or follow-ups

<!-- What's left unresolved on purpose, or worth watching after merge. -->
