-- ============================================================
-- StaffTrak — 007_reconcile_evaluation_cycles.sql
-- Replaces the old (EMPTY, unused) evaluation_cycles table with the
-- Phase 0 schema PLUS the richer summative/signature columns from the
-- earlier design (kept for later phases #8).
--
-- SAFE: the old evaluation_cycles table has 0 rows and is not referenced
-- by the app. task_templates (20) and cycle_tasks are unaffected.
--
-- Run AFTER 006_evaluation_cycle_phase0.sql, in the Supabase SQL Editor.
-- ============================================================

-- 1. Drop the old empty table.
--    CASCADE removes the Phase-0 foreign key from cycle_tasks and the
--    policies that were attached to the old table; both are recreated below.
DROP TABLE IF EXISTS evaluation_cycles CASCADE;

-- 2. Recreate with the Phase 0 columns + preserved richer columns.
CREATE TABLE evaluation_cycles (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id),
  staff_id               UUID NOT NULL REFERENCES profiles(id),
  evaluator_id           UUID REFERENCES profiles(id),
  school_year            TEXT NOT NULL,
  track                  eval_track NOT NULL,
  status                 eval_cycle_status NOT NULL DEFAULT 'active',
  start_date             DATE,
  end_date               DATE,
  -- preserved from the earlier design, used by later phases (#8):
  rubric_id              UUID,
  summative_score        NUMERIC,
  summative_rating       TEXT,
  staff_signature_at     TIMESTAMPTZ,
  evaluator_signature_at TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  completed_at           TIMESTAMPTZ,
  UNIQUE (tenant_id, staff_id, school_year)
);

CREATE INDEX idx_eval_cycles_tenant    ON evaluation_cycles(tenant_id, school_year);
CREATE INDEX idx_eval_cycles_staff     ON evaluation_cycles(staff_id);
CREATE INDEX idx_eval_cycles_evaluator ON evaluation_cycles(evaluator_id);

-- 3. Re-attach cycle_tasks to the new table.
ALTER TABLE cycle_tasks
  ADD CONSTRAINT cycle_tasks_cycle_id_fkey
  FOREIGN KEY (cycle_id) REFERENCES evaluation_cycles(id) ON DELETE CASCADE;

-- 4. Re-enable RLS and recreate the access policies.
ALTER TABLE evaluation_cycles ENABLE ROW LEVEL SECURITY;

-- Staff see their own cycle
CREATE POLICY "eval_cycles_select_own" ON evaluation_cycles FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND staff_id = auth.uid());

-- Evaluators see cycles for their caseload
CREATE POLICY "eval_cycles_select_evaluator" ON evaluation_cycles FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (evaluator_id = auth.uid()
         OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid()))
  );

-- HR/Admin see all in tenant
CREATE POLICY "eval_cycles_select_admin" ON evaluation_cycles FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND is_admin_hr());

-- HR/Admin manage cycles
CREATE POLICY "eval_cycles_manage_admin" ON evaluation_cycles FOR ALL
  USING (tenant_id = get_my_tenant_id() AND is_admin_hr())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- The Phase 0 functions (start_evaluation_cycle, generate_cycle_tasks) already
-- reference the column names recreated above, so they work unchanged.

-- ============================================================
-- END 007_reconcile_evaluation_cycles.sql
-- ============================================================
