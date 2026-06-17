-- ============================================================
-- StaffTrak — 028_staff_submit_goal.sql
-- Fix: staff "Submit for Approval" was silently rejected.
--
-- The existing "Staff can update own draft goals" policy has USING
--   (staff_id = auth.uid() AND status IN ('draft','revision_requested'))
-- and NO explicit WITH CHECK — so Postgres reuses USING as the check. That
-- lets a staff member edit a draft, but blocks the draft -> submitted
-- transition, because the NEW row's status ('submitted') fails the check.
-- The client update returned an RLS error that the UI swallowed, so nothing
-- happened on screen.
--
-- This adds a second, additive UPDATE policy that permits a staff member to
-- move their OWN goal from draft/revision_requested to submitted (and still
-- edit it while draft). UPDATE policies are OR-combined, so the existing edit
-- policy is unchanged; this one just also accepts the 'submitted' end state.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goals_staff_submit" ON goals;
CREATE POLICY "goals_staff_submit" ON goals FOR UPDATE
  USING (
    staff_id = auth.uid()
    AND status IN ('draft', 'revision_requested')
  )
  WITH CHECK (
    staff_id = auth.uid()
    AND status IN ('draft', 'revision_requested', 'submitted')
  );

-- ── Verify ──
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE tablename = 'goals' AND cmd = 'UPDATE'
ORDER BY policyname;

-- ============================================================
-- END 028_staff_submit_goal.sql
-- ============================================================
