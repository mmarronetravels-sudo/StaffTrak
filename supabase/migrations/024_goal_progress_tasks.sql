-- ============================================================
-- StaffTrak — 024_goal_progress_tasks.sql
-- Phase 4b #6 (deferred piece): staff-owned "Update Goal Progress" checklist
-- task before the Mid-Year and End-of-Year reviews.
--
-- The goal-progress entries (goal_reviews, migration 019) are staff-authored and
-- meant to be filled in BEFORE the conference. This adds a prompted, dated
-- checklist task so staff are reminded to do it in time — the long-noted
-- "teacher-owned update goal progress" split-out. Two tasks per track:
--   • update_goal_progress_midyear — due Jan 26 (a few days before Jan 29 review)
--   • update_goal_progress_final   — due May 25 (a few days before May 28 review)
-- Both staff-owned, linked to the Goals page (where the review panels live).
--
-- New templates only flow to NEW cycles via generate_cycle_tasks(); this also
-- BACK-FILLS them into existing ACTIVE cycles (generate_cycle_tasks is
-- idempotent — it only adds task_keys a cycle doesn't already have).
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ── 1. Templates (pilot tenant; probationary + permanent) ──
INSERT INTO task_templates
  (tenant_id, track, task_key, title, description, owner_role, due_month, due_day, linked_table, sort_order, is_active)
VALUES
  ('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','update_goal_progress_midyear',
   'Update Goal Progress (Mid-Year)',
   'Record mid-year progress on each goal before the Mid-Year Review.',
   'staff', 1, 26, 'goals', 69, TRUE),
  ('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','update_goal_progress_final',
   'Update Goal Progress (End-of-Year)',
   'Record final outcomes on each goal before the End-of-Year Review.',
   'staff', 5, 25, 'goals', 99, TRUE),
  ('09e6e120-bbac-4516-8483-72b8f331bcd7','permanent','update_goal_progress_midyear',
   'Update Goal Progress (Mid-Year)',
   'Record mid-year progress on each goal before the Mid-Year Review.',
   'staff', 1, 26, 'goals', 49, TRUE),
  ('09e6e120-bbac-4516-8483-72b8f331bcd7','permanent','update_goal_progress_final',
   'Update Goal Progress (End-of-Year)',
   'Record final outcomes on each goal before the End-of-Year Review.',
   'staff', 5, 25, 'goals', 79, TRUE)
ON CONFLICT (tenant_id, track, task_key) DO UPDATE SET
  title        = EXCLUDED.title,
  description  = EXCLUDED.description,
  owner_role   = EXCLUDED.owner_role,
  due_month    = EXCLUDED.due_month,
  due_day      = EXCLUDED.due_day,
  linked_table = EXCLUDED.linked_table,
  sort_order   = EXCLUDED.sort_order,
  is_active    = EXCLUDED.is_active;

-- ── 2. Back-fill into existing ACTIVE cycles ──
-- generate_cycle_tasks() skips task_keys a cycle already has, so this only adds
-- the two new tasks (with their per-cycle computed due dates).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM evaluation_cycles WHERE status = 'active' LOOP
    PERFORM generate_cycle_tasks(r.id);
  END LOOP;
END $$;

-- ── Verify ──
SELECT track, task_key, title, owner_role, due_month, due_day, sort_order
FROM task_templates
WHERE task_key IN ('update_goal_progress_midyear','update_goal_progress_final')
ORDER BY track, sort_order;

SELECT task_key, COUNT(*) AS cycle_tasks
FROM cycle_tasks
WHERE task_key IN ('update_goal_progress_midyear','update_goal_progress_final')
GROUP BY task_key;

-- ============================================================
-- END 024_goal_progress_tasks.sql
-- ============================================================
