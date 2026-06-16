-- ============================================================
-- StaffTrak — 006_evaluation_cycle_phase0.sql
-- Phase 0: Evaluation Cycle foundation
--   Tables:   evaluation_cycles, task_templates, cycle_tasks
--   Functions: generate_cycle_tasks(), start_evaluation_cycle()
--   Seed:     2026-27 task templates (Probationary + Permanent tracks)
--   RLS:      staff / evaluator / HR-admin access model
--
-- Run in the Supabase SQL Editor for project fgbigyffgzqzvksrkqxv
-- (the shared StaffTrak + LeaveTrak database).
--
-- Pilot tenant_id: 09e6e120-bbac-4516-8483-72b8f331bcd7 (Summit Learning Charter)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 0. PRE-FLIGHT — run these SELECTs FIRST and confirm before proceeding
-- ════════════════════════════════════════════════════════════
-- This migration assumes the existing RLS helper functions and column names.
-- Verify them once before running the rest:
--
--   -- (a) helper functions exist?
--   SELECT proname FROM pg_proc WHERE proname IN ('get_my_tenant_id','get_my_role');
--
--   -- (b) the role values actually in use (policies below reference these)
--   SELECT DISTINCT role FROM profiles ORDER BY role;
--       -- expected to include: district_admin, school_admin, hr, evaluator,
--       --                      licensed_staff, classified
--
--   -- (c) the staff->evaluator link column exists
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name IN ('evaluator_id','is_evaluator');
--
-- If get_my_role() returns a value NOT in the HR/admin list used below,
-- adjust the is_admin_hr() helper in section 4 accordingly.


-- ════════════════════════════════════════════════════════════
-- 1. ENUMS
-- ════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE eval_track AS ENUM ('probationary', 'permanent', 'modified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE eval_cycle_status AS ENUM ('active', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE eval_task_owner AS ENUM ('staff', 'evaluator', 'both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE eval_task_status AS ENUM ('not_started', 'in_progress', 'complete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ════════════════════════════════════════════════════════════
-- 2. TABLES
-- ════════════════════════════════════════════════════════════

-- ─── EVALUATION CYCLES ───────────────────────────────────────
-- One row per staff member per school year. The backbone everything hangs off.
CREATE TABLE IF NOT EXISTS evaluation_cycles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  staff_id      UUID NOT NULL REFERENCES profiles(id),
  evaluator_id  UUID REFERENCES profiles(id),
  school_year   TEXT NOT NULL,                 -- '2026-2027'
  track         eval_track NOT NULL,
  status        eval_cycle_status NOT NULL DEFAULT 'active',
  start_date    DATE,
  end_date      DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, staff_id, school_year)
);

CREATE INDEX IF NOT EXISTS idx_eval_cycles_tenant     ON evaluation_cycles(tenant_id, school_year);
CREATE INDEX IF NOT EXISTS idx_eval_cycles_staff      ON evaluation_cycles(staff_id);
CREATE INDEX IF NOT EXISTS idx_eval_cycles_evaluator  ON evaluation_cycles(evaluator_id);


-- ─── TASK TEMPLATES ──────────────────────────────────────────
-- The standard checklist per track. Drives Hybrid auto-generation.
-- Due dates are stored as month/day; the concrete year is computed per cycle
-- (Aug–Dec => first year of the school_year, Jan–Jul => second year).
CREATE TABLE IF NOT EXISTS task_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  track         eval_track NOT NULL,
  task_key      TEXT NOT NULL,                 -- 'self_reflection', 'formal_observation', ...
  title         TEXT NOT NULL,
  description   TEXT,
  owner_role    eval_task_owner NOT NULL,
  due_month     SMALLINT NOT NULL CHECK (due_month BETWEEN 1 AND 12),
  due_day       SMALLINT NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  linked_table  TEXT,                          -- 'self_assessments','goals','observations','meetings','summative_evaluations'
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, track, task_key)
);

CREATE INDEX IF NOT EXISTS idx_task_templates_lookup ON task_templates(tenant_id, track, is_active);


-- ─── CYCLE TASKS ─────────────────────────────────────────────
-- The actual checklist items for a given cycle (generated from templates,
-- then editable per the Hybrid model). Each can link to the real work record.
CREATE TABLE IF NOT EXISTS cycle_tasks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  cycle_id      UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  task_key      TEXT,                          -- nullable for fully custom tasks
  title         TEXT NOT NULL,
  description   TEXT,
  owner_role    eval_task_owner NOT NULL,
  due_date      DATE,
  status        eval_task_status NOT NULL DEFAULT 'not_started',
  completed_at  TIMESTAMPTZ,
  completed_by  UUID REFERENCES profiles(id),
  linked_table  TEXT,                          -- which entity this task points to
  linked_id     UUID,                          -- the specific record (set when work is created)
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_custom     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cycle_tasks_cycle  ON cycle_tasks(cycle_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cycle_tasks_tenant ON cycle_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cycle_tasks_due    ON cycle_tasks(due_date) WHERE status <> 'complete';


-- ════════════════════════════════════════════════════════════
-- 3. FUNCTIONS — Hybrid cycle generation
-- ════════════════════════════════════════════════════════════

-- Compute a concrete due date for a school year + month/day.
-- school_year is the FIRST calendar year ('2026-2027' => 2026).
-- Months Aug(8)..Dec(12) fall in the first year; Jan(1)..Jul(7) in the second.
CREATE OR REPLACE FUNCTION eval_due_date(p_school_year TEXT, p_month SMALLINT, p_day SMALLINT)
RETURNS DATE
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  first_year INT := split_part(p_school_year, '-', 1)::INT;
  yr INT;
BEGIN
  yr := CASE WHEN p_month >= 8 THEN first_year ELSE first_year + 1 END;
  RETURN make_date(yr, p_month, p_day);
END;
$$;


-- Generate cycle_tasks for a cycle from its track's active templates.
-- Idempotent: skips templates whose task_key already exists on the cycle.
CREATE OR REPLACE FUNCTION generate_cycle_tasks(p_cycle_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  c RECORD;
  inserted INT := 0;
BEGIN
  SELECT * INTO c FROM evaluation_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cycle % not found', p_cycle_id;
  END IF;

  INSERT INTO cycle_tasks
    (tenant_id, cycle_id, task_key, title, description, owner_role,
     due_date, linked_table, sort_order, is_custom)
  SELECT
    c.tenant_id, c.id, t.task_key, t.title, t.description, t.owner_role,
    eval_due_date(c.school_year, t.due_month, t.due_day),
    t.linked_table, t.sort_order, FALSE
  FROM task_templates t
  WHERE t.tenant_id = c.tenant_id
    AND t.track     = c.track
    AND t.is_active = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM cycle_tasks ct
      WHERE ct.cycle_id = c.id AND ct.task_key = t.task_key
    );

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;


-- Create (or fetch) a cycle for a staff member and seed its tasks in one call.
-- evaluator defaults to the staff member's profiles.evaluator_id if not given.
CREATE OR REPLACE FUNCTION start_evaluation_cycle(
  p_staff_id    UUID,
  p_school_year TEXT,
  p_track       eval_track,
  p_evaluator   UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant    UUID;
  v_evaluator UUID;
  v_cycle_id  UUID;
BEGIN
  SELECT tenant_id, COALESCE(p_evaluator, evaluator_id)
    INTO v_tenant, v_evaluator
  FROM profiles WHERE id = p_staff_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Staff profile % not found', p_staff_id;
  END IF;

  INSERT INTO evaluation_cycles (tenant_id, staff_id, evaluator_id, school_year, track)
  VALUES (v_tenant, p_staff_id, v_evaluator, p_school_year, p_track)
  ON CONFLICT (tenant_id, staff_id, school_year)
  DO UPDATE SET track = EXCLUDED.track, evaluator_id = EXCLUDED.evaluator_id, updated_at = NOW()
  RETURNING id INTO v_cycle_id;

  PERFORM generate_cycle_tasks(v_cycle_id);
  RETURN v_cycle_id;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- 4. SEED — 2026-27 task templates for the pilot tenant
-- ════════════════════════════════════════════════════════════
-- Re-runnable: ON CONFLICT (tenant_id, track, task_key) refreshes the row.

INSERT INTO task_templates
  (tenant_id, track, task_key, title, description, owner_role, due_month, due_day, linked_table, sort_order)
VALUES
-- ─── PROBATIONARY (Years 1-3) ────────────────────────────────
('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','self_reflection','Self-Reflection','Complete the self-assessment rubric for your role.','staff',10,16,'self_assessments',10),
('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','goal_setting','Goal Setting (2 SLG + 1 PGG)','Submit two Student Learning & Growth Goals and one Professional Growth Goal.','staff',10,16,'goals',20),
('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','initial_goals_meeting','Initial Goals Meeting','Meet with supervisor to review and approve goals.','both',10,30,'meetings',30),
('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','pre_observation','Pre-Observation','Complete pre-observation form ahead of the formal observation.','staff',11,13,'observations',40),
('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','formal_observation','Formal Observation','Supervisor conducts the formal observation.','evaluator',12,4,'observations',50),
('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','post_observation_feedback','Post-Observation Form & Feedback','Review observation feedback and respond to any required comments.','both',12,17,'observations',60),
('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','mid_year_goal_review','Mid-Year Goal Review','Update goal progress and meet with supervisor for mid-year review.','both',1,29,'meetings',70),
('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','informal_observation_1','Informal Observation','Supervisor conducts an informal observation.','evaluator',3,1,'observations',80),
('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','informal_observation_2','Informal Observation','Supervisor conducts an informal observation.','evaluator',5,3,'observations',90),
('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','end_of_year_goal_review','End-of-Year Goal Review','Update final goal outcomes and meet with supervisor.','both',5,28,'meetings',100),
('09e6e120-bbac-4516-8483-72b8f331bcd7','probationary','summative','Summative','Supervisor completes the summative evaluation.','evaluator',6,11,'summative_evaluations',110),

-- ─── PERMANENT (Year 4+) ─────────────────────────────────────
('09e6e120-bbac-4516-8483-72b8f331bcd7','permanent','self_reflection','Self-Reflection','Complete the self-assessment rubric for your role.','staff',10,16,'self_assessments',10),
('09e6e120-bbac-4516-8483-72b8f331bcd7','permanent','goal_setting','Goal Setting (2 SLG + 1 PGG)','Submit two Student Learning & Growth Goals and one Professional Growth Goal.','staff',10,16,'goals',20),
('09e6e120-bbac-4516-8483-72b8f331bcd7','permanent','initial_goals_meeting','Initial Goals Meeting','Meet with supervisor to review and approve goals.','both',10,30,'meetings',30),
('09e6e120-bbac-4516-8483-72b8f331bcd7','permanent','informal_observation_1','Informal Observation','Supervisor conducts an informal observation.','evaluator',11,13,'observations',40),
('09e6e120-bbac-4516-8483-72b8f331bcd7','permanent','mid_year_goal_review','Mid-Year Goal Review','Update goal progress and meet with supervisor for mid-year review.','both',1,29,'meetings',50),
('09e6e120-bbac-4516-8483-72b8f331bcd7','permanent','informal_observation_2','Informal Observation','Supervisor conducts an informal observation.','evaluator',3,1,'observations',60),
('09e6e120-bbac-4516-8483-72b8f331bcd7','permanent','informal_observation_3','Informal Observation','Supervisor conducts an informal observation.','evaluator',5,3,'observations',70),
('09e6e120-bbac-4516-8483-72b8f331bcd7','permanent','end_of_year_goal_review','End-of-Year Goal Review','Update final goal outcomes and meet with supervisor.','both',5,28,'meetings',80),
('09e6e120-bbac-4516-8483-72b8f331bcd7','permanent','summative','Summative','Supervisor completes the summative evaluation.','evaluator',6,11,'summative_evaluations',90)
ON CONFLICT (tenant_id, track, task_key) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, owner_role = EXCLUDED.owner_role,
  due_month = EXCLUDED.due_month, due_day = EXCLUDED.due_day,
  linked_table = EXCLUDED.linked_table, sort_order = EXCLUDED.sort_order, is_active = TRUE;


-- ════════════════════════════════════════════════════════════
-- 5. ROW-LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

ALTER TABLE evaluation_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_tasks       ENABLE ROW LEVEL SECURITY;

-- Convenience: is the current user HR or an admin?
-- (Adjust this list if the pre-flight in section 0 shows different role values.)
CREATE OR REPLACE FUNCTION is_admin_hr()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$ SELECT get_my_role() IN ('hr','district_admin','school_admin'); $$;

-- ─── evaluation_cycles ───────────────────────────────────────
-- Staff see their own cycle
CREATE POLICY "eval_cycles_select_own" ON evaluation_cycles FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND staff_id = auth.uid());

-- Evaluators see cycles for staff assigned to them (directly named, or via evaluator_id link)
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

-- ─── task_templates ──────────────────────────────────────────
-- Everyone in tenant can read templates
CREATE POLICY "task_templates_select" ON task_templates FOR SELECT
  USING (tenant_id = get_my_tenant_id());

-- HR/Admin manage templates
CREATE POLICY "task_templates_manage_admin" ON task_templates FOR ALL
  USING (tenant_id = get_my_tenant_id() AND is_admin_hr())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- ─── cycle_tasks ─────────────────────────────────────────────
-- Helper: cycles the current user may see (own, caseload, or all if admin/HR)
-- Read: staff (own cycle), evaluator (caseload), HR/admin (all)
CREATE POLICY "cycle_tasks_select" ON cycle_tasks FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR cycle_id IN (SELECT id FROM evaluation_cycles WHERE staff_id = auth.uid())
      OR cycle_id IN (SELECT id FROM evaluation_cycles
                      WHERE evaluator_id = auth.uid()
                         OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid()))
    )
  );

-- Staff may update tasks they own (mark complete) on their own cycle
CREATE POLICY "cycle_tasks_update_staff" ON cycle_tasks FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND owner_role IN ('staff','both')
    AND cycle_id IN (SELECT id FROM evaluation_cycles WHERE staff_id = auth.uid())
  )
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Evaluators may update tasks they own on their caseload's cycles
CREATE POLICY "cycle_tasks_update_evaluator" ON cycle_tasks FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND owner_role IN ('evaluator','both')
    AND cycle_id IN (SELECT id FROM evaluation_cycles
                     WHERE evaluator_id = auth.uid()
                        OR staff_id IN (SELECT id FROM profiles WHERE evaluator_id = auth.uid()))
  )
  WITH CHECK (tenant_id = get_my_tenant_id());

-- HR/Admin manage all tasks (add custom, edit dates, remove)
CREATE POLICY "cycle_tasks_manage_admin" ON cycle_tasks FOR ALL
  USING (tenant_id = get_my_tenant_id() AND is_admin_hr())
  WITH CHECK (tenant_id = get_my_tenant_id());


-- ════════════════════════════════════════════════════════════
-- 6. SMOKE TEST (optional — run, inspect, then rollback)
-- ════════════════════════════════════════════════════════════
-- BEGIN;
--   -- start a 2026-2027 permanent cycle for the test teacher
--   SELECT start_evaluation_cycle(
--     '72c2a5bd-798c-4ef2-aa2a-a4f3688253d3', '2026-2027', 'permanent'
--   ) AS cycle_id;
--
--   -- inspect the generated checklist with computed due dates
--   SELECT ct.sort_order, ct.title, ct.owner_role, ct.due_date, ct.status, ct.linked_table
--   FROM cycle_tasks ct
--   JOIN evaluation_cycles ec ON ec.id = ct.cycle_id
--   WHERE ec.staff_id = '72c2a5bd-798c-4ef2-aa2a-a4f3688253d3'
--     AND ec.school_year = '2026-2027'
--   ORDER BY ct.sort_order;
-- ROLLBACK;

-- ============================================================
-- END 006_evaluation_cycle_phase0.sql
-- ============================================================
