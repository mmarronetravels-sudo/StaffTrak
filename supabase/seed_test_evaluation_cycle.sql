-- ============================================================
-- StaffTrak — seed_test_evaluation_cycle.sql
-- Seeds ONE real (committed) 2026-2027 evaluation cycle so the
-- Phase 1 checklist UI has live data to render and test against.
--
-- Run in the Supabase SQL Editor for project fgbigyffgzqzvksrkqxv
-- AFTER 006_evaluation_cycle_phase0.sql and 007_reconcile_evaluation_cycles.sql.
--
-- This is the test teacher's cycle. It is safe to delete afterward:
--   DELETE FROM evaluation_cycles
--   WHERE staff_id = (SELECT id FROM profiles WHERE email = 'teacher-test@summitlc.org')
--     AND school_year = '2026-2027';
--   (cycle_tasks cascade-delete with the cycle.)
-- ============================================================

-- ── Settings ────────────────────────────────────────────────
-- Test teacher (staff). The Session 37 smoke test used this account.
--   staff email : teacher-test@summitlc.org
--   staff_id    : 72c2a5bd-798c-4ef2-aa2a-a4f3688253d3  (resolved by email below)
--
-- OPTIONAL: to also exercise the EVALUATOR view, set an evaluator below.
--   Put the evaluator's login email in v_evaluator_email. If left NULL,
--   the cycle uses the teacher's existing profiles.evaluator_id (if any),
--   and HR/Admin will still see the cycle regardless.

DO $$
DECLARE
  v_staff_email     TEXT := 'teacher-test@summitlc.org';
  v_evaluator_email TEXT := 'mmarrone@summitlc.org';   -- admin/evaluator test login
  v_school_year     TEXT := '2026-2027';
  v_track           eval_track := 'permanent';   -- 'probationary' | 'permanent' | 'modified'

  v_staff_id     UUID;
  v_evaluator_id UUID;
  v_cycle_id     UUID;
  v_task_count   INT;
BEGIN
  SELECT id INTO v_staff_id FROM profiles WHERE email = v_staff_email;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff profile not found for email %', v_staff_email;
  END IF;

  IF v_evaluator_email IS NOT NULL THEN
    SELECT id INTO v_evaluator_id FROM profiles WHERE email = v_evaluator_email;
    IF v_evaluator_id IS NULL THEN
      RAISE EXCEPTION 'Evaluator profile not found for email %', v_evaluator_email;
    END IF;
  END IF;

  -- Creates the cycle (or refreshes it) AND seeds cycle_tasks from the
  -- track's task_templates. evaluator defaults to profiles.evaluator_id
  -- when v_evaluator_id is NULL.
  v_cycle_id := start_evaluation_cycle(v_staff_id, v_school_year, v_track, v_evaluator_id);

  SELECT COUNT(*) INTO v_task_count FROM cycle_tasks WHERE cycle_id = v_cycle_id;

  RAISE NOTICE 'Seeded cycle % for % (% / %) with % tasks.',
    v_cycle_id, v_staff_email, v_track, v_school_year, v_task_count;
END $$;

-- ── Verify (run after the block above) ──────────────────────
SELECT ec.school_year, ec.track, ec.status,
       sp.full_name  AS staff,
       evp.full_name AS evaluator
FROM evaluation_cycles ec
JOIN profiles sp  ON sp.id  = ec.staff_id
LEFT JOIN profiles evp ON evp.id = ec.evaluator_id
WHERE sp.email = 'teacher-test@summitlc.org'
  AND ec.school_year = '2026-2027';

SELECT ct.sort_order, ct.title, ct.owner_role, ct.due_date, ct.status, ct.linked_table
FROM cycle_tasks ct
JOIN evaluation_cycles ec ON ec.id = ct.cycle_id
JOIN profiles sp ON sp.id = ec.staff_id
WHERE sp.email = 'teacher-test@summitlc.org'
  AND ec.school_year = '2026-2027'
ORDER BY ct.sort_order;

-- ============================================================
-- END seed_test_evaluation_cycle.sql
-- ============================================================
