-- ============================================================
-- StaffTrak — 039_gcal_event_links_nullable.sql
-- Make the STAFF columns on gcal_event_links nullable so a link row can persist
-- when only the OTHER party's event (observer/evaluator) was created — e.g. the
-- staff member is not on a delegated @summitlc.org mailbox, or their calendar
-- failed while the other party's succeeded.
--
-- Pairs with gcal-sync edge function v4 (S66): both calendars are independent
-- and best-effort; we keep the link if EITHER event succeeds, and only fail the
-- sync when BOTH calendars fail. Idempotent.
-- Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv). Applied to prod
-- Jun 22 2026.
-- ============================================================

ALTER TABLE public.gcal_event_links
  ALTER COLUMN gcal_event_id DROP NOT NULL,
  ALTER COLUMN staff_email   DROP NOT NULL;

-- ============================================================
-- END 039_gcal_event_links_nullable.sql
-- ============================================================
