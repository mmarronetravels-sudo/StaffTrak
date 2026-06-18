-- ============================================================
-- StaffTrak — 030_anecdotal_notes.sql
-- Banked #2: evaluator's running anecdotal log.
--
-- A free-text running log of an evaluator's observations about a staff member
-- that are NOT tied to a formal/informal observation. Each note carries the
-- date it happened (occurred_on) separate from when it was logged (created_at).
--
-- VISIBILITY (important): private to the staff member's evaluator (caseload via
-- profiles.evaluator_id OR named on an evaluation_cycle) and to HR/admin. The
-- subject staff member CANNOT read their own anecdotal notes — note the
-- deliberate ABSENCE of a `staff_id = auth.uid()` clause in the SELECT policy
-- (this is the key difference from evidence_items, which staff can read).
--
-- Uses the existing get_my_tenant_id() / is_admin_hr() helpers (migration 006)
-- and the auth.uid() = profiles.id convention. Idempotent. Run in the Supabase
-- SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS anecdotal_notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  staff_id    UUID NOT NULL REFERENCES profiles(id),   -- subject of the note
  created_by  UUID NOT NULL REFERENCES profiles(id),   -- author (evaluator / HR)
  note        TEXT NOT NULL,
  occurred_on DATE,                                     -- when it happened
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anecdotal_notes_staff  ON anecdotal_notes(staff_id);
CREATE INDEX IF NOT EXISTS idx_anecdotal_notes_tenant ON anecdotal_notes(tenant_id);

-- ════════════════════════════════════════════════════════════
-- 2. ROW-LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

ALTER TABLE anecdotal_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: HR/admin (whole tenant) or the staff member's evaluator (caseload).
-- NOTE: `staff_id = auth.uid()` is intentionally OMITTED so the subject cannot
-- read notes written about them.
DROP POLICY IF EXISTS "anecdotal_notes_select" ON anecdotal_notes;
CREATE POLICY "anecdotal_notes_select" ON anecdotal_notes FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid())
      OR staff_id IN (SELECT staff_id FROM evaluation_cycles WHERE evaluator_id = auth.uid())
    )
  );

-- INSERT: author stamps created_by = self; may write for own caseload, or
-- (HR/admin) for anyone in the tenant.
DROP POLICY IF EXISTS "anecdotal_notes_insert" ON anecdotal_notes;
CREATE POLICY "anecdotal_notes_insert" ON anecdotal_notes FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND created_by = auth.uid()
    AND (
      is_admin_hr()
      OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid())
      OR staff_id IN (SELECT staff_id FROM evaluation_cycles WHERE evaluator_id = auth.uid())
    )
  );

-- UPDATE / DELETE: the author (or HR/admin).
DROP POLICY IF EXISTS "anecdotal_notes_update" ON anecdotal_notes;
CREATE POLICY "anecdotal_notes_update" ON anecdotal_notes FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND (created_by = auth.uid() OR is_admin_hr()))
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "anecdotal_notes_delete" ON anecdotal_notes;
CREATE POLICY "anecdotal_notes_delete" ON anecdotal_notes FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND (created_by = auth.uid() OR is_admin_hr()));

-- ════════════════════════════════════════════════════════════
-- 3. VERIFY
-- ════════════════════════════════════════════════════════════
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'anecdotal_notes'
ORDER BY cmd, policyname;

-- ============================================================
-- END 030_anecdotal_notes.sql
-- ============================================================
