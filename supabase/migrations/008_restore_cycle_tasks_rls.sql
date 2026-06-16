-- ============================================================
-- StaffTrak — 008_restore_cycle_tasks_rls.sql
-- FIX: Migration 007 ran `DROP TABLE evaluation_cycles CASCADE`, which
-- also dropped the RLS POLICIES on cycle_tasks (they referenced
-- evaluation_cycles in their USING subqueries). 007 recreated the
-- evaluation_cycles policies but NOT the cycle_tasks ones, leaving
-- cycle_tasks with RLS enabled and zero policies → it denied all reads
-- to staff/evaluators (only the RLS-bypassing SQL editor could see rows).
--
-- This migration recreates the four cycle_tasks policies exactly as they
-- were defined in 006. Idempotent: drops-if-exists, then recreates.
--
-- Run in the Supabase SQL Editor for project fgbigyffgzqzvksrkqxv,
-- AFTER 006 and 007. No app redeploy needed (database-only change).
-- ============================================================

ALTER TABLE cycle_tasks ENABLE ROW LEVEL SECURITY;

-- Read: staff (own cycle), evaluator (caseload), HR/admin (all)
DROP POLICY IF EXISTS "cycle_tasks_select" ON cycle_tasks;
CREATE POLICY "cycle_tasks_select" ON cycle_tasks FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR cycle_id IN (SELECT id FROM evaluation_cycles WHERE staff_id = auth.uid())
      OR cycle_id IN (SELECT id FROM evaluation_cycles
                      WHERE evaluator_id = auth.uid()
                         OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid()))
    )
  );

-- Staff may update tasks they own (mark complete) on their own cycle
DROP POLICY IF EXISTS "cycle_tasks_update_staff" ON cycle_tasks;
CREATE POLICY "cycle_tasks_update_staff" ON cycle_tasks FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND owner_role IN ('staff','both')
    AND cycle_id IN (SELECT id FROM evaluation_cycles WHERE staff_id = auth.uid())
  )
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Evaluators may update tasks they own on their caseload's cycles
DROP POLICY IF EXISTS "cycle_tasks_update_evaluator" ON cycle_tasks;
CREATE POLICY "cycle_tasks_update_evaluator" ON cycle_tasks FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND owner_role IN ('evaluator','both')
    AND cycle_id IN (SELECT id FROM evaluation_cycles
                     WHERE evaluator_id = auth.uid()
                        OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid()))
  )
  WITH CHECK (tenant_id = get_my_tenant_id());

-- HR/Admin manage all tasks (add custom, edit dates, remove)
DROP POLICY IF EXISTS "cycle_tasks_manage_admin" ON cycle_tasks;
CREATE POLICY "cycle_tasks_manage_admin" ON cycle_tasks FOR ALL
  USING (tenant_id = get_my_tenant_id() AND is_admin_hr())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- ── Verify the four policies now exist ──────────────────────
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'cycle_tasks'
ORDER BY policyname;

-- ============================================================
-- END 008_restore_cycle_tasks_rls.sql
-- ============================================================
