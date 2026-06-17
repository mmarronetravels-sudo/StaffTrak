-- ============================================================
-- StaffTrak — 019_goal_reviews.sql
-- Phase 4b #6: Goals carry forward into Mid-Year Review and Summative.
--
-- The 2 SLG + 1 PGG a staff member sets at the start of the year carry into
-- two checkpoints — the Mid-Year Review and the End-of-Year (Summative)
-- conference — with a STAFF-AUTHORED progress entry per goal per phase. The
-- staff member drafts and submits these ahead of the meeting; the evaluator
-- sees them (drafts read-only) walking into the conference. One source of
-- truth for the goal; goal_reviews holds the evolving per-phase status.
--
--   phase       ∈ mid_year | final
--   status      ∈ on_track | met | not_met | revised
--   entry_state ∈ draft | submitted   (draft until the staff member submits)
--
-- Supersedes the older, unused goals.mid_year_progress / end_year_progress
-- columns (no write path existed). Those columns are left in place (no
-- destructive change); the app now reads/writes goal_reviews instead.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ── 1. Enums ──
DO $$ BEGIN
  CREATE TYPE goal_review_phase AS ENUM ('mid_year', 'final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE goal_review_status AS ENUM ('on_track', 'met', 'not_met', 'revised');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE goal_review_entry_state AS ENUM ('draft', 'submitted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Table ──
CREATE TABLE IF NOT EXISTS goal_reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  goal_id       UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  cycle_id      UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  phase         goal_review_phase NOT NULL,
  progress_note TEXT,
  status        goal_review_status,
  entry_state   goal_review_entry_state NOT NULL DEFAULT 'draft',
  submitted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (goal_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_goal_reviews_goal  ON goal_reviews(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_reviews_cycle ON goal_reviews(cycle_id);

-- ── 3. RLS ──
-- Staff-authored: the goal's owner creates and edits their own reviews; the
-- cycle's evaluator (and HR/admin) read them. Read access lets the evaluator
-- see drafts (the app renders them read-only before submission).
ALTER TABLE goal_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goal_reviews_select" ON goal_reviews;
CREATE POLICY "goal_reviews_select" ON goal_reviews FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR goal_id IN (SELECT id FROM goals WHERE staff_id = auth.uid())
      OR cycle_id IN (SELECT id FROM evaluation_cycles WHERE evaluator_id = auth.uid())
    )
  );

-- Insert / update / delete: the goal's owner (staff member) or HR/admin only.
DROP POLICY IF EXISTS "goal_reviews_insert" ON goal_reviews;
CREATE POLICY "goal_reviews_insert" ON goal_reviews FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR goal_id IN (SELECT id FROM goals WHERE staff_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "goal_reviews_update" ON goal_reviews;
CREATE POLICY "goal_reviews_update" ON goal_reviews FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR goal_id IN (SELECT id FROM goals WHERE staff_id = auth.uid())
    )
  )
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "goal_reviews_delete" ON goal_reviews;
CREATE POLICY "goal_reviews_delete" ON goal_reviews FOR DELETE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR goal_id IN (SELECT id FROM goals WHERE staff_id = auth.uid())
    )
  );

-- ── Verify ──
SELECT column_name FROM information_schema.columns
WHERE table_name = 'goal_reviews' ORDER BY ordinal_position;
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'goal_reviews' ORDER BY cmd, policyname;

-- ============================================================
-- END 019_goal_reviews.sql
-- ============================================================
