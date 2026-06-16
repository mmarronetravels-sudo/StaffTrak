-- ============================================================
-- StaffTrak — 012_observation_formative_flag.sql
-- Phase 2b #10: flexible observation types + formative gating.
--
-- Adds observations.is_formative_only. Formative-only observations are
-- evidence for growth but are EXCLUDED from the summative score (peer /
-- learning walks are formative-only per Oregon law). observation_type stays
-- free text; the app now produces: formal, informal, walkthrough,
-- mini_observation, learning_walk.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- Database-only; safe to re-run.
-- ============================================================

-- ── Column ──
ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS is_formative_only BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Backfill: the lightweight types default to formative-only ──
-- (No-op for existing formal/informal rows; only flips the new types if any
-- already exist. New rows get their flag from the app at scheduling time.)
UPDATE observations
SET is_formative_only = TRUE
WHERE observation_type IN ('walkthrough', 'mini_observation', 'learning_walk')
  AND is_formative_only = FALSE;

-- Partial index for the summative roll-up (#8): "scored" observations only.
CREATE INDEX IF NOT EXISTS idx_observations_scored
  ON observations(staff_id)
  WHERE is_formative_only = FALSE;

-- ── Verify ──
SELECT observation_type,
       is_formative_only,
       COUNT(*) AS n
FROM observations
GROUP BY observation_type, is_formative_only
ORDER BY observation_type, is_formative_only;

-- ============================================================
-- END 012_observation_formative_flag.sql
-- ============================================================
