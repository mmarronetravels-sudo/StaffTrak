-- ============================================================
-- StaffTrak — 023_set_cycle_task_due_date.sql
-- Cycle due-date editing for HR/admin + the cycle's evaluator.
--
-- The cycle_tasks UPDATE policies (008) scope edits by owner_role: an evaluator
-- can only update evaluator/both tasks, staff only staff/both. That's correct
-- for checking tasks off, but it blocks an evaluator from adjusting the DUE
-- DATE of a staff-owned task (goal-setting, self-reflection) — needed for
-- modified cycles and mid-year hires (a hard requirement of the Hybrid model).
--
-- Rather than broaden the row-level UPDATE policies (which would also let
-- evaluators check off staff tasks), this SECURITY DEFINER function permits
-- HR/admin and the cycle's evaluator to change ONLY the due_date of any task on
-- that cycle. Authorization mirrors the evaluator link used elsewhere (the
-- cycle's evaluator_id, or the staff member's assigned evaluator).
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

CREATE OR REPLACE FUNCTION set_cycle_task_due_date(p_task_id UUID, p_due_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  UUID := get_my_tenant_id();
  v_cycle   UUID;
  v_allowed BOOLEAN;
BEGIN
  -- Locate the task within the caller's tenant.
  SELECT cycle_id INTO v_cycle
  FROM cycle_tasks
  WHERE id = p_task_id AND tenant_id = v_tenant;

  IF v_cycle IS NULL THEN
    RAISE EXCEPTION 'Task not found in your tenant';
  END IF;

  -- HR/admin, or the cycle's evaluator (direct or via the staff member's
  -- assigned evaluator) may edit due dates.
  SELECT (
    is_admin_hr()
    OR EXISTS (
      SELECT 1 FROM evaluation_cycles ec
      WHERE ec.id = v_cycle
        AND (
          ec.evaluator_id = auth.uid()
          OR ec.staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid())
        )
    )
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized to edit due dates on this cycle';
  END IF;

  UPDATE cycle_tasks
  SET due_date = p_due_date, updated_at = NOW()
  WHERE id = p_task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_cycle_task_due_date(UUID, DATE) TO authenticated;

-- ── Verify ──
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'set_cycle_task_due_date';

-- ============================================================
-- END 023_set_cycle_task_due_date.sql
-- ============================================================
