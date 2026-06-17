-- ============================================================
-- StaffTrak — 027_self_assessment_evaluator_read.sql
-- Follow-up to 026. The sign-off work let an evaluator UPDATE a staff member's
-- self-reflection (to set evaluator_signed_at), but there was no policy letting
-- an evaluator (or HR/admin) SELECT it. Without read access the evaluator's
-- Self-Reflection panel in the Initial Goals meeting comes back empty, and the
-- sign action (which reads the row back after updating) can't return the row.
--
-- `goals` already has an equivalent "Evaluators can view assigned staff goals"
-- SELECT policy; this adds the matching one for `self_assessments`.
--
-- Scoping mirrors 026: HR/admin, or the evaluator of record for the staff member
-- (via profiles.evaluator_id). Additive to the existing
-- "Staff can manage own self-assessments" policy.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

ALTER TABLE self_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "self_assessments_select_evaluator" ON self_assessments;
CREATE POLICY "self_assessments_select_evaluator" ON self_assessments FOR SELECT
  USING (
    is_admin_hr()
    OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid())
  );

-- ── Verify ──
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename = 'self_assessments'
ORDER BY cmd, policyname;

-- ============================================================
-- END 027_self_assessment_evaluator_read.sql
-- ============================================================
