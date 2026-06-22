-- ============================================================
-- StaffTrak — 036_gcal_sync_triggers.sql
-- Fire the `gcal-sync` edge function whenever a scheduled observation or
-- meeting changes, so it can mirror the event onto the staff member's Google
-- Calendar.
--
-- WHY TRIGGERS INSTEAD OF DASHBOARD WEBHOOKS: the Dashboard "Database Webhooks"
-- UI depends on the internal `supabase_functions` schema, which isn't installed
-- on this project (creating a hook errors with 3F000 "schema supabase_functions
-- does not exist"). We get the identical behavior by calling the function
-- directly from a row trigger via pg_net's net.http_post(). pg_net must be
-- enabled (Database → Extensions → pg_net) — it already is on this project.
--
-- The payload shape matches what a Supabase database webhook would send
-- (type / table / schema / record / old_record), so the edge function needs no
-- changes. Authorization carries the shared GCAL_WEBHOOK_SECRET the function
-- checks.
--
-- SECURITY NOTE: the bearer secret below is committed as a PLACEHOLDER. When you
-- run this in the SQL editor, replace __GCAL_WEBHOOK_SECRET__ with the real
-- value you stored as the GCAL_WEBHOOK_SECRET function secret. Keep the real
-- secret out of version control.
--
-- PREREQUISITE: deploy the function with JWT verification OFF so the trigger's
-- static secret reaches our code:
--     supabase functions deploy gcal-sync --no-verify-jwt
-- (The function does its own secret check, so this is safe.)
--
-- Idempotent. Run in the Supabase SQL editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. TRIGGER FUNCTION
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.gcal_sync_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'type',       TG_OP,
    'table',      TG_TABLE_NAME,
    'schema',     TG_TABLE_SCHEMA,
    'record',     CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END
  );

  PERFORM net.http_post(
    url     := 'https://fgbigyffgzqzvksrkqxv.supabase.co/functions/v1/gcal-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer __GCAL_WEBHOOK_SECRET__'
    ),
    body    := payload
  );

  RETURN NULL; -- AFTER trigger; return value ignored
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 2. TRIGGERS on observations + meetings
-- ════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS gcal_sync_observations ON observations;
CREATE TRIGGER gcal_sync_observations
  AFTER INSERT OR UPDATE OR DELETE ON observations
  FOR EACH ROW EXECUTE FUNCTION public.gcal_sync_notify();

DROP TRIGGER IF EXISTS gcal_sync_meetings ON meetings;
CREATE TRIGGER gcal_sync_meetings
  AFTER INSERT OR UPDATE OR DELETE ON meetings
  FOR EACH ROW EXECUTE FUNCTION public.gcal_sync_notify();

-- ════════════════════════════════════════════════════════════
-- 3. VERIFY
-- ════════════════════════════════════════════════════════════
SELECT event_object_table AS table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_name IN ('gcal_sync_observations', 'gcal_sync_meetings')
ORDER BY event_object_table, event_manipulation;

-- ============================================================
-- END 036_gcal_sync_triggers.sql
-- ============================================================
