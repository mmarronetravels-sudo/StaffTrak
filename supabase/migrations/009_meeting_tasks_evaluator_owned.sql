-- ============================================================
-- StaffTrak — 009_meeting_tasks_evaluator_owned.sql
-- Ownership decision (Session 38): the three goal-review MEETINGS are
-- run by the evaluator, so the evaluator owns their check-off. The teacher
-- continues to own Self-Reflection + Goal Setting (+ Pre-Observation on the
-- probationary track). Post-Observation Feedback stays 'both' (it has a
-- teacher-response side we'll formalize in Phase 3), and observations/
-- summative remain evaluator-owned.
--
-- Net change: initial_goals_meeting, mid_year_goal_review,
-- end_of_year_goal_review  ->  owner_role 'both'  becomes  'evaluator'.
--
-- Updates BOTH the templates (so all future cycles inherit it) AND any
-- already-generated cycle_tasks (so the existing test cycle reflects it).
--
-- Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv), after 008.
-- Database-only change — no app redeploy needed; the checklist reads
-- owner_role at load time.
-- ============================================================

-- 1. Templates (drive all future cycles)
UPDATE task_templates
SET owner_role = 'evaluator'
WHERE tenant_id = '09e6e120-bbac-4516-8483-72b8f331bcd7'
  AND task_key IN ('initial_goals_meeting', 'mid_year_goal_review', 'end_of_year_goal_review');

-- 2. Existing generated tasks (e.g. the seeded test cycle)
UPDATE cycle_tasks
SET owner_role = 'evaluator', updated_at = NOW()
WHERE tenant_id = '09e6e120-bbac-4516-8483-72b8f331bcd7'
  AND task_key IN ('initial_goals_meeting', 'mid_year_goal_review', 'end_of_year_goal_review');

-- ── Verify (templates + live tasks) ─────────────────────────
SELECT 'template' AS scope, track::text AS track, task_key, owner_role::text
FROM task_templates
WHERE tenant_id = '09e6e120-bbac-4516-8483-72b8f331bcd7'
  AND task_key IN ('initial_goals_meeting','mid_year_goal_review','end_of_year_goal_review','post_observation_feedback')
UNION ALL
SELECT 'cycle_task' AS scope, ec.school_year, ct.task_key, ct.owner_role::text
FROM cycle_tasks ct
JOIN evaluation_cycles ec ON ec.id = ct.cycle_id
WHERE ct.tenant_id = '09e6e120-bbac-4516-8483-72b8f331bcd7'
  AND ct.task_key IN ('initial_goals_meeting','mid_year_goal_review','end_of_year_goal_review','post_observation_feedback')
ORDER BY scope, track, task_key;

-- ============================================================
-- END 009_meeting_tasks_evaluator_owned.sql
-- ============================================================
