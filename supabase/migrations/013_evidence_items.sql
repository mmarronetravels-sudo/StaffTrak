-- ============================================================
-- StaffTrak — 013_evidence_items.sql
-- Phase 2b #9: continuous evidence / body of evidence.
--
-- A per-standard body of evidence is assembled from THREE sources:
--   1. observation notes tagged to indicators   (observation_note_tags)
--   2. per-indicator observation ratings         (observation_indicator_ratings, 011)
--   3. standalone evidence items (this migration) — artifacts / links / notes
--      that staff OR evaluators attach to indicators any time, independent of
--      an observation.
--
-- Standalone items carry their own is_formative_only flag (default FALSE):
-- formative items are shown but excluded from the summative score, consistent
-- with observations.is_formative_only (012).
--
-- file_path is reserved for #11 (Supabase Storage attachments); #9 ships
-- evidence_type 'note' and 'link' only. Idempotent. Run in the Supabase SQL
-- Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. TABLES
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS evidence_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  staff_id          UUID NOT NULL REFERENCES profiles(id),          -- whose body of evidence
  cycle_id          UUID REFERENCES evaluation_cycles(id) ON DELETE SET NULL,
  created_by        UUID NOT NULL REFERENCES profiles(id),
  title             TEXT NOT NULL,
  description       TEXT,
  evidence_type     TEXT NOT NULL DEFAULT 'note',                   -- 'note' | 'link' | 'file'
  url               TEXT,                                           -- for 'link'
  file_path         TEXT,                                           -- for 'file' (#11 Storage object path)
  occurred_on       DATE,                                           -- when the evidence happened
  is_formative_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_items_staff  ON evidence_items(staff_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_cycle  ON evidence_items(cycle_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_tenant ON evidence_items(tenant_id);

CREATE TABLE IF NOT EXISTS evidence_indicator_tags (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  evidence_item_id  UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  standard_id       UUID NOT NULL REFERENCES rubric_standards(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (evidence_item_id, standard_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_tags_standard ON evidence_indicator_tags(standard_id);
CREATE INDEX IF NOT EXISTS idx_evidence_tags_item     ON evidence_indicator_tags(evidence_item_id);

-- ════════════════════════════════════════════════════════════
-- 2. ROW-LEVEL SECURITY
-- ════════════════════════════════════════════════════════════
-- Visibility mirrors the cycle_tasks model: the staff member (own), the
-- evaluator (caseload: named on a cycle OR via profiles.evaluator_id), and
-- HR/admin (whole tenant). Uses the existing is_admin_hr() / get_my_tenant_id()
-- helpers from migration 006.

ALTER TABLE evidence_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_indicator_tags ENABLE ROW LEVEL SECURITY;

-- ─── evidence_items ──────────────────────────────────────────
DROP POLICY IF EXISTS "evidence_items_select" ON evidence_items;
CREATE POLICY "evidence_items_select" ON evidence_items FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR staff_id = auth.uid()
      OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid())
      OR staff_id IN (SELECT staff_id FROM evaluation_cycles WHERE evaluator_id = auth.uid())
    )
  );

-- Create: staff for themselves, evaluator for caseload, HR/admin for anyone.
-- Must stamp created_by = self.
DROP POLICY IF EXISTS "evidence_items_insert" ON evidence_items;
CREATE POLICY "evidence_items_insert" ON evidence_items FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND created_by = auth.uid()
    AND (
      is_admin_hr()
      OR staff_id = auth.uid()
      OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid())
      OR staff_id IN (SELECT staff_id FROM evaluation_cycles WHERE evaluator_id = auth.uid())
    )
  );

-- Edit / delete: the author (or HR/admin).
DROP POLICY IF EXISTS "evidence_items_update" ON evidence_items;
CREATE POLICY "evidence_items_update" ON evidence_items FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND (created_by = auth.uid() OR is_admin_hr()))
  WITH CHECK (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS "evidence_items_delete" ON evidence_items;
CREATE POLICY "evidence_items_delete" ON evidence_items FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND (created_by = auth.uid() OR is_admin_hr()));

-- ─── evidence_indicator_tags ─────────────────────────────────
-- Read any tag whose parent item is visible (evidence_items RLS scopes the
-- subquery). Manage tags only on items you authored (or HR/admin).
DROP POLICY IF EXISTS "evidence_tags_select" ON evidence_indicator_tags;
CREATE POLICY "evidence_tags_select" ON evidence_indicator_tags FOR SELECT
  USING (evidence_item_id IN (SELECT id FROM evidence_items));

DROP POLICY IF EXISTS "evidence_tags_insert" ON evidence_indicator_tags;
CREATE POLICY "evidence_tags_insert" ON evidence_indicator_tags FOR INSERT
  WITH CHECK (
    evidence_item_id IN (SELECT id FROM evidence_items WHERE created_by = auth.uid() OR is_admin_hr())
  );

DROP POLICY IF EXISTS "evidence_tags_delete" ON evidence_indicator_tags;
CREATE POLICY "evidence_tags_delete" ON evidence_indicator_tags FOR DELETE
  USING (
    evidence_item_id IN (SELECT id FROM evidence_items WHERE created_by = auth.uid() OR is_admin_hr())
  );

-- ════════════════════════════════════════════════════════════
-- 3. VERIFY
-- ════════════════════════════════════════════════════════════
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('evidence_items', 'evidence_indicator_tags')
ORDER BY tablename, cmd, policyname;

-- ============================================================
-- END 013_evidence_items.sql
-- ============================================================
