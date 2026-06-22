-- ============================================================
-- StaffTrak — 038_gcal_event_links_other_party.sql
-- Extend Google Calendar sync to ALSO mirror each observation/meeting onto the
-- OTHER party's calendar (observer for observations, evaluator for meetings),
-- in addition to the staff member's own calendar.
--
-- One gcal_event_links row now tracks BOTH events:
--   gcal_event_id        -> the staff member's event (existing)
--   other_gcal_event_id  -> the observer/evaluator's event (new)
-- The other event is best-effort: only created when that person resolves to a
-- delegated (@summitlc.org) Google account; new columns are therefore nullable.
--
-- Pairs with gcal-sync edge function v3 (S66). Idempotent.
-- Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

ALTER TABLE public.gcal_event_links
  ADD COLUMN IF NOT EXISTS other_id            uuid,
  ADD COLUMN IF NOT EXISTS other_email         text,
  ADD COLUMN IF NOT EXISTS other_gcal_event_id text;

-- ============================================================
-- END 038_gcal_event_links_other_party.sql
-- ============================================================
