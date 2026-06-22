-- ============================================================
-- StaffTrak — 035_gcal_event_links.sql
-- Google Calendar push: mapping table for synced events.
--
-- The built-in Calendar (src/pages/Calendar.jsx) renders scheduled rows from
-- the `observations` and `meetings` tables. To mirror those onto each staff
-- member's Google Calendar we need to remember which Google event corresponds
-- to which StaffTrak row, so later edits PATCH (not duplicate) and cancellations
-- DELETE the right event.
--
-- We store that mapping in a SEPARATE table rather than adding a column to
-- observations/meetings ON PURPOSE: the `gcal-sync` edge function is invoked by
-- database webhooks on those two tables. If the function wrote the Google event
-- id back into the same row it would re-fire the webhook in an infinite loop.
-- Writing to this side table instead breaks that cycle — the core tables are
-- never modified by the sync.
--
-- Written only by the `gcal-sync` edge function via the service role (which
-- bypasses RLS). RLS is enabled with a single read policy so the app/evaluator
-- could later surface sync status; there are deliberately no client write
-- policies. Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gcal_event_links (
  source_table  TEXT NOT NULL CHECK (source_table IN ('observations', 'meetings')),
  source_id     UUID NOT NULL,            -- observations.id / meetings.id
  tenant_id     UUID REFERENCES tenants(id),
  staff_id      UUID REFERENCES profiles(id),
  staff_email   TEXT NOT NULL,            -- the calendar we wrote to (impersonated)
  gcal_event_id TEXT NOT NULL,            -- Google Calendar event id
  gcal_calendar_id TEXT NOT NULL DEFAULT 'primary',
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  last_status    TEXT,                    -- last sync outcome: created/updated/deleted/error
  PRIMARY KEY (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_gcal_event_links_staff  ON gcal_event_links(staff_id);
CREATE INDEX IF NOT EXISTS idx_gcal_event_links_tenant ON gcal_event_links(tenant_id);

-- ════════════════════════════════════════════════════════════
-- 2. ROW-LEVEL SECURITY
-- ════════════════════════════════════════════════════════════
-- The edge function uses the service role and bypasses RLS entirely. We still
-- enable RLS (deny-by-default) and add a narrow SELECT so HR/admin and the
-- staff member's evaluator can read sync status if we expose it in the UI later.
-- No client INSERT/UPDATE/DELETE policies: writes come only from the function.

ALTER TABLE gcal_event_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gcal_event_links_select" ON gcal_event_links;
CREATE POLICY "gcal_event_links_select" ON gcal_event_links FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR staff_id = auth.uid()
      OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid())
      OR staff_id IN (SELECT staff_id FROM evaluation_cycles WHERE evaluator_id = auth.uid())
    )
  );

-- ════════════════════════════════════════════════════════════
-- 3. VERIFY
-- ════════════════════════════════════════════════════════════
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'gcal_event_links'
ORDER BY cmd, policyname;

-- ============================================================
-- END 035_gcal_event_links.sql
-- ============================================================
