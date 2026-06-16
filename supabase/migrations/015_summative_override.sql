-- ============================================================
-- StaffTrak — 015_summative_override.sql
-- Phase 2b #8: professional-judgment override on the summative.
--
-- The summative's overall_rating is normally derived from the average of the
-- domain scores. Some frameworks let the evaluator set a FINAL rating that
-- differs from the math, with a written justification. We store:
--   overall_rating          → the EFFECTIVE final rating (override if applied,
--                             else the calculated rating) — so existing list /
--                             PDF / staff views keep showing the right rating.
--   overall_score           → unchanged: the calculated average of domain scores
--                             (the calculated rating can always be re-derived).
--   overall_rating_override → the override value when judgment was applied,
--                             else NULL (the flag for "was this overridden").
--   override_justification  → required written rationale when overriding.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

ALTER TABLE summative_evaluations ADD COLUMN IF NOT EXISTS overall_rating_override TEXT;
ALTER TABLE summative_evaluations ADD COLUMN IF NOT EXISTS override_justification  TEXT;

-- ── Verify ──
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'summative_evaluations'
  AND column_name IN ('overall_rating_override', 'override_justification')
ORDER BY column_name;

-- ============================================================
-- END 015_summative_override.sql
-- ============================================================
