-- ============================================================
-- StaffTrak — 011_observation_indicator_ratings.sql
-- Per-indicator ratings captured DURING an observation.
--
-- During an observation an evaluator already tags notes to rubric
-- indicators (observation_note_tags) and sees live coverage. This adds an
-- optional 1-4 rating per indicator for that observation, on the same scale
-- as the summative (4 Highly Effective / 3 Effective / 2 Developing /
-- 1 Needs Improvement). One rating per (observation, indicator).
--
-- Scope: the OBSERVER on the parent observation manages the ratings; the
-- observed staff member and HR/admin can read them.
-- Idempotent (drop-if-exists then create). Run in the Supabase SQL Editor
-- (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ── Table ──
CREATE TABLE IF NOT EXISTS observation_indicator_ratings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  observation_id  UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  standard_id     UUID NOT NULL REFERENCES rubric_standards(id) ON DELETE CASCADE,
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 4),
  rated_by        UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (observation_id, standard_id)   -- one rating per indicator per observation (enables upsert)
);

CREATE INDEX IF NOT EXISTS idx_obs_ind_ratings_obs ON observation_indicator_ratings(observation_id);

-- ── RLS ──
ALTER TABLE observation_indicator_ratings ENABLE ROW LEVEL SECURITY;

-- Read: observer, the observed staff member, or HR/admin in the tenant.
DROP POLICY IF EXISTS "obs_ind_ratings_select" ON observation_indicator_ratings;
CREATE POLICY "obs_ind_ratings_select" ON observation_indicator_ratings FOR SELECT
  USING (
    observation_id IN (
      SELECT id FROM observations
      WHERE observer_id = auth.uid() OR staff_id = auth.uid()
    )
    OR is_admin_hr()
  );

-- Insert: observer only, and they must stamp themselves as rated_by.
DROP POLICY IF EXISTS "obs_ind_ratings_insert_observer" ON observation_indicator_ratings;
CREATE POLICY "obs_ind_ratings_insert_observer" ON observation_indicator_ratings FOR INSERT
  WITH CHECK (
    rated_by = auth.uid()
    AND observation_id IN (SELECT id FROM observations WHERE observer_id = auth.uid())
  );

-- Update: observer only.
DROP POLICY IF EXISTS "obs_ind_ratings_update_observer" ON observation_indicator_ratings;
CREATE POLICY "obs_ind_ratings_update_observer" ON observation_indicator_ratings FOR UPDATE
  USING (observation_id IN (SELECT id FROM observations WHERE observer_id = auth.uid()))
  WITH CHECK (observation_id IN (SELECT id FROM observations WHERE observer_id = auth.uid()));

-- Delete: observer only.
DROP POLICY IF EXISTS "obs_ind_ratings_delete_observer" ON observation_indicator_ratings;
CREATE POLICY "obs_ind_ratings_delete_observer" ON observation_indicator_ratings FOR DELETE
  USING (observation_id IN (SELECT id FROM observations WHERE observer_id = auth.uid()));

-- ── Verify ──
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'observation_indicator_ratings'
ORDER BY cmd, policyname;

-- ============================================================
-- END 011_observation_indicator_ratings.sql
-- ============================================================
