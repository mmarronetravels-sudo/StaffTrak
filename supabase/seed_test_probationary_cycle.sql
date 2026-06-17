-- ============================================================
-- StaffTrak — seed_test_probationary_cycle.sql
-- Seeds ONE real (committed) 2026-2027 *PROBATIONARY* evaluation cycle
-- so we can walk the probationary-only flow (Pre-Observation, Formal
-- Observation, Post-Observation Feedback) that the permanent track skips.
--
-- IMPORTANT: use a DIFFERENT staff member than the permanent test teacher
-- (teacher-test@summitlc.org). One person can only have one 2026-2027 cycle.
--
-- Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv), after
-- 006 + 007 + 008 + 009.
--
-- Safe to delete afterward:
--   DELETE FROM evaluation_cycles
--   WHERE staff_id = (SELECT id FROM profiles WHERE email = '<<the email below>>')
--     AND school_year = '2026-2027';
-- ============================================================

DO $$
DECLARE
  -- ▼▼▼  PUT THE PROBATIONARY TEST TEACHER'S LOGIN EMAIL HERE  ▼▼▼
  v_staff_email     TEXT := 'testteacher@summitlc.org';
  -- ▲▲▲
  v_evaluator_email TEXT := 'mmarrone@summitlc.org';   -- admin/evaluator test login
  v_school_year     TEXT := '2026-2027';
  v_track           eval_track := 'probationary';

  v_staff_id     UUID;
  v_evaluator_id UUID;
  v_cycle_id     UUID;
  v_task_count   INT;
BEGIN
  IF v_staff_email = 'PUT_PROBATIONARY_TEACHER_EMAIL_HERE' THEN
    RAISE EXCEPTION 'Edit v_staff_email first — set it to the probationary test teacher''s login email.';
  END IF;

  SELECT id INTO v_staff_id FROM profiles WHERE email = v_staff_email;
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff profile not found for email %', v_staff_email;
  END IF;

  -- This test account is currently inactive; reactivate so it can log in.
  UPDATE profiles SET is_active = TRUE WHERE id = v_staff_id;

  SELECT id INTO v_evaluator_id FROM profiles WHERE email = v_evaluator_email;
  IF v_evaluator_id IS NULL THEN
    RAISE EXCEPTION 'Evaluator profile not found for email %', v_evaluator_email;
  END IF;

  v_cycle_id := start_evaluation_cycle(v_staff_id, v_school_year, v_track, v_evaluator_id);

  SELECT COUNT(*) INTO v_task_count FROM cycle_tasks WHERE cycle_id = v_cycle_id;
  RAISE NOTICE 'Seeded PROBATIONARY cycle % for % with % tasks.', v_cycle_id, v_staff_email, v_task_count;
END $$;

-- ── Verify (expect 11 tasks for the probationary track) ─────
SELECT ct.sort_order, ct.title, ct.owner_role, ct.due_date, ct.status, ct.linked_table
FROM cycle_tasks ct
JOIN evaluation_cycles ec ON ec.id = ct.cycle_id
JOIN profiles sp ON sp.id = ec.staff_id
WHERE sp.email = (
  SELECT email FROM profiles
  WHERE id = (SELECT staff_id FROM evaluation_cycles
              WHERE track = 'probationary' AND school_year = '2026-2027'
              ORDER BY created_at DESC LIMIT 1)
)
  AND ec.school_year = '2026-2027'
  AND ec.track = 'probationary'
ORDER BY ct.sort_order;

-- ============================================================
-- END seed_test_probationary_cycle.sql
-- ============================================================
