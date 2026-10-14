-- Phase 2 live acceptance — the report.
--
-- Prints every recorded assertion with PASS/FAIL, then a summary line the
-- runner greps for. Comparison is exact string equality on `expected` vs
-- `observed`: every recorder above writes both as text precisely so a
-- divergence prints the actual value rather than a bare boolean.
--
-- A NULL `observed` is a FAIL, not a skip. It means the query that was
-- supposed to produce evidence returned nothing — most often because the
-- object under test does not exist on this database — and "the migration was
-- never applied" must never read as a pass.

\pset border 2
\pset format aligned

select
  case when r.observed is not distinct from r.expected then 'PASS' else 'FAIL' end as result,
  r.part,
  r.name,
  r.expected,
  coalesce(r.observed, '(null — no evidence produced)') as observed
from phase2_acceptance.result r
order by r.part, r.id;

select
  pg_catalog.count(*) as assertions,
  pg_catalog.count(*) filter (where observed is not distinct from expected) as passed,
  pg_catalog.count(*) filter (where observed is distinct from expected) as failed,
  case
    when pg_catalog.count(*) = 0 then 'PHASE2-ACCEPTANCE: NO ASSERTIONS RECORDED'
    when pg_catalog.count(*) filter (where observed is distinct from expected) = 0
      then 'PHASE2-ACCEPTANCE: ALL PASS'
    else 'PHASE2-ACCEPTANCE: FAILURES PRESENT'
  end as verdict
from phase2_acceptance.result;
