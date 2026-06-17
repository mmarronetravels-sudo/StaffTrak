-- ============================================================
-- StaffTrak — 025_task_due_reminders.sql
-- #5 notifications wave: task due/overdue reminders.
--
-- Sets up a DAILY pg_cron job that calls the `task-due-reminders` Edge
-- Function, which nudges the owner(s) of incomplete checklist tasks on ACTIVE
-- cycles: first 3 days before the due date, then every 3 days while due-soon or
-- overdue, until complete. Cadence tracked per task via last_due_notified_at.
--
-- ⚠️ MANUAL STEPS BEFORE THIS WORKS (same pattern as 022):
--   1) Deploy the Edge Function `task-due-reminders` (dashboard → Edge
--      Functions → Deploy, or `supabase functions deploy task-due-reminders`).
--      It uses the auto-provided SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and
--      calls send-email (RESEND_API_KEY already set on that function).
--   2) REPLACE __SERVICE_ROLE_KEY__ below with the project's service-role key
--      BEFORE running (Settings → API). Prefer the Vault variant at the bottom.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ── 1. Per-task reminder bookkeeping ──
ALTER TABLE cycle_tasks ADD COLUMN IF NOT EXISTS last_due_notified_at TIMESTAMPTZ;

-- ── 2. Scheduling extensions (already enabled in 022; safe to repeat) ──
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 3. (Re)schedule the daily job — 13:30 UTC (staggered from 022's 13:00) ──
DO $$
BEGIN
  PERFORM cron.unschedule('task-due-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'task-due-reminders',
  '30 13 * * *',  -- daily at 13:30 UTC
  $CRON$
    SELECT net.http_post(
      url     := 'https://fgbigyffgzqzvksrkqxv.supabase.co/functions/v1/task-due-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer __SERVICE_ROLE_KEY__'
      ),
      body    := '{}'::jsonb
    );
  $CRON$
);

-- ── Verify ──
SELECT jobid, schedule, jobname FROM cron.job WHERE jobname = 'task-due-reminders';
SELECT column_name FROM information_schema.columns
WHERE table_name = 'cycle_tasks' AND column_name = 'last_due_notified_at';

-- ============================================================
-- OPTIONAL — Vault variant (preferred over an inline key)
--   1) (once) select vault.create_secret('<service_role_key>', 'service_role_key');
--   2) schedule reading it at run time:
--      select cron.schedule('task-due-reminders','30 13 * * *',
--        $CRON$
--          select net.http_post(
--            url := 'https://fgbigyffgzqzvksrkqxv.supabase.co/functions/v1/task-due-reminders',
--            headers := jsonb_build_object(
--              'Content-Type','application/json',
--              'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
--            ),
--            body := '{}'::jsonb
--          );
--        $CRON$
--      );
-- ============================================================
-- END 025_task_due_reminders.sql
-- ============================================================
