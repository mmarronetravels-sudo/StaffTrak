-- ============================================================
-- StaffTrak — 026_self_reflection_goal_signoff.sql
-- Banked #1: Signatures / sign-off on Self-Reflection + Goals.
--
-- The Summative (summative_evaluations.evaluator_signature_at / staff_signature_at)
-- and the Initial / Mid-Year phases (evaluation_feedback.evaluator_signed_at /
-- staff_acknowledged_at) already carry dual sign-off. This migration closes the
-- two remaining gaps from banked #1 by extending the same signed+dated pattern to:
--
--   self_assessments  — the Self-Reflection. Staff signs their own; the evaluator
--                       signs after reviewing it (in the Initial Goals meeting).
--   goals             — each goal is signed by the staff member (commitment) and
--                       by the evaluator (at approval, in Goal Approvals).
--
-- Two timestamp columns per table:
--   staff_signed_at      — set when the staff member signs.
--   evaluator_signed_at  — set when the evaluator (or HR/admin) signs.
--
-- RLS: staff already update their own rows via existing policies (that path sets
-- staff_signed_at). This migration adds an evaluator UPDATE policy on each table
-- so the cycle's evaluator (and HR/admin) can sign their staff's rows. As with
-- 018_evaluation_feedback, the row is gated to the right parties here and the
-- column-level intent (who writes which field) is enforced in the app.
--
-- Scoping is via the profiles.evaluator_id relationship (staff are tenant-scoped
-- through profiles), matching how the app already queries these tables by
-- staff_id rather than tenant_id.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ── 1. Columns ──
ALTER TABLE self_assessments ADD COLUMN IF NOT EXISTS staff_signed_at     TIMESTAMPTZ;
ALTER TABLE self_assessments ADD COLUMN IF NOT EXISTS evaluator_signed_at TIMESTAMPTZ;

ALTER TABLE goals            ADD COLUMN IF NOT EXISTS staff_signed_at     TIMESTAMPTZ;
ALTER TABLE goals            ADD COLUMN IF NOT EXISTS evaluator_signed_at TIMESTAMPTZ;

-- ── 2. RLS ──
ALTER TABLE self_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals            ENABLE ROW LEVEL SECURITY;

-- Evaluator (or HR/admin) may update a self-reflection belonging to one of their
-- assigned staff — used to set evaluator_signed_at. Staff continue to update
-- their own rows via the existing staff policy (which sets staff_signed_at).
DROP POLICY IF EXISTS "self_assessments_update_evaluator" ON self_assessments;
CREATE POLICY "self_assessments_update_evaluator" ON self_assessments FOR UPDATE
  USING (
    is_admin_hr()
    OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid())
  )
  WITH CHECK (
    is_admin_hr()
    OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid())
  );

-- Same for goals — evaluator signs at approval time in Goal Approvals.
DROP POLICY IF EXISTS "goals_update_evaluator" ON goals;
CREATE POLICY "goals_update_evaluator" ON goals FOR UPDATE
  USING (
    is_admin_hr()
    OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid())
  )
  WITH CHECK (
    is_admin_hr()
    OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid())
  );

-- ── Verify ──
SELECT table_name, column_name FROM information_schema.columns
WHERE table_name IN ('self_assessments', 'goals')
  AND column_name IN ('staff_signed_at', 'evaluator_signed_at')
ORDER BY table_name, column_name;

SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('self_assessments', 'goals') AND cmd = 'UPDATE'
ORDER BY tablename, policyname;

-- ============================================================
-- END 026_self_reflection_goal_signoff.sql
-- ============================================================
