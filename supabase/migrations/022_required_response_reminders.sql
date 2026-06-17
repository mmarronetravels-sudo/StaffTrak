-- ============================================================
-- StaffTrak — 022_required_response_reminders.sql
-- #5 notifications wave: escalating reminders for unanswered required responses.
--
-- An OPEN required-response observation comment blocks the staff member's
-- summative. This sets up a DAILY pg_cron job that calls the
-- `required-response-reminders` Edge Function, which nudges staff (CC the
-- evaluator) on an escalating cadence (every 3 days; daily within 7 days of the
-- summative deadline). Cadence is tracked per item via last_reminded_at.
--
-- ⚠️ MANUAL STEPS BEFORE THIS WORKS:
--   1) Deploy the Edge Function `required-response-reminders` (dashboard →
--      Edge Functions → Deploy, or `supabase functions deploy
--      required-response-reminders`). It uses the auto-provided SUPABASE_URL
--      and SUPABASE_SERVICE_ROLE_KEY envs; ensure RESEND_API_KEY is set (same
--      as send-email) since it calls send-email.
--   2) REPLACE the __SERVICE_ROLE_KEY__ placeholder below with the project's
--      service-role key BEFORE running this migration (Settings → API →
--      service_role key). Prefer storing it in Supabase Vault and reading it
--      via vault.decrypted_secrets instead of pasting it inline (see the
--      commented Vault variant at the bottom).
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ── 1. Per-item reminder bookkeeping ──
ALTER TABLE observation_threads ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;

-- ── 2. Scheduling extensions ──
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 3. (Re)schedule the daily job ──
-- Unschedule any prior version of this job, then (re)create it. 13:00 UTC.
DO $$
BEGIN
  PERFORM cron.unschedule('required-response-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule(
  'required-response-reminders',
  '0 13 * * *',  -- daily at 13:00 UTC
  $CRON$
    SELECT net.http_post(
      url     := 'https://fgbigyffgzqzvksrkqxv.supabase.co/functions/v1/required-response-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer __SERVICE_ROLE_KEY__'
      ),
      body    := '{}'::jsonb
    );
  $CRON$
);

-- ── Verify ──
SELECT jobid, schedule, jobname FROM cron.job WHERE jobname = 'required-response-reminders';
SELECT column_name FROM information_schema.columns
WHERE table_name = 'observation_threads' AND column_name = 'last_reminded_at';

-- ============================================================
-- OPTIONAL — Vault variant (preferred over an inline key)
-- ------------------------------------------------------------
-- 1) Store the key once:
--      select vault.create_secret('<service_role_key>', 'service_role_key');
-- 2) Schedule reading it at run time:
--      select cron.schedule(
--        'required-response-reminders', '0 13 * * *',
--        $CRON$
--          select net.http_post(
--            url := 'https://fgbigyffgzqzvksrkqxv.supabase.co/functions/v1/required-response-reminders',
--            headers := jsonb_build_object(
--              'Content-Type','application/json',
--              'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
--            ),
--            body := '{}'::jsonb
--          );
--        $CRON$
--      );
-- ============================================================
-- END 022_required_response_reminders.sql
-- ============================================================
