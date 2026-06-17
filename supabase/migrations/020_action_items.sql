-- ============================================================
-- StaffTrak — 020_action_items.sql
-- Phase 4c #13: Growth next-steps tied to goals & professional learning.
--
-- Structured, trackable next steps that turn feedback into improvement —
-- closing ODE's fifth required element, Aligned Professional Learning. Each
-- item can be generated from an observation, linked to a goal and/or a PD
-- reference, assigned an owner and due date, and tracked open → in_progress →
-- done by both the teacher and the evaluator.
--
-- This is structured on top of the existing free-text observations.next_steps;
-- that column is left as-is.
--
--   status ∈ open | in_progress | done
--   observation_id / goal_id are optional links (an item can stand alone, or
--   tie a piece of feedback to a goal and a professional-learning reference).
--
-- RLS: the cycle's staff member, its evaluator, the item's owner, and HR/admin
-- can see and track items; the cycle's two parties (or HR) create them.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ── 1. Enum ──
DO $$ BEGIN
  CREATE TYPE action_item_status AS ENUM ('open', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Table ──
CREATE TABLE IF NOT EXISTS action_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  cycle_id       UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  observation_id UUID REFERENCES observations(id) ON DELETE SET NULL,
  goal_id        UUID REFERENCES goals(id) ON DELETE SET NULL,
  pd_reference   TEXT,
  description    TEXT NOT NULL,
  status         action_item_status NOT NULL DEFAULT 'open',
  owner_id       UUID REFERENCES profiles(id),
  due_date       DATE,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_items_cycle       ON action_items(cycle_id);
CREATE INDEX IF NOT EXISTS idx_action_items_observation ON action_items(observation_id);
CREATE INDEX IF NOT EXISTS idx_action_items_goal        ON action_items(goal_id);
CREATE INDEX IF NOT EXISTS idx_action_items_owner       ON action_items(owner_id);

-- ── 3. RLS ──
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

-- Read: HR/admin, the cycle's two parties, or the item's owner.
DROP POLICY IF EXISTS "action_items_select" ON action_items;
CREATE POLICY "action_items_select" ON action_items FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR owner_id = auth.uid()
      OR cycle_id IN (
        SELECT id FROM evaluation_cycles
        WHERE staff_id = auth.uid() OR evaluator_id = auth.uid()
      )
    )
  );

-- Insert: either party on the cycle (or HR/admin) can add next steps.
DROP POLICY IF EXISTS "action_items_insert" ON action_items;
CREATE POLICY "action_items_insert" ON action_items FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR cycle_id IN (
        SELECT id FROM evaluation_cycles
        WHERE staff_id = auth.uid() OR evaluator_id = auth.uid()
      )
    )
  );

-- Update: both parties + the owner track status; HR/admin too.
DROP POLICY IF EXISTS "action_items_update" ON action_items;
CREATE POLICY "action_items_update" ON action_items FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR owner_id = auth.uid()
      OR cycle_id IN (
        SELECT id FROM evaluation_cycles
        WHERE staff_id = auth.uid() OR evaluator_id = auth.uid()
      )
    )
  )
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Delete: HR/admin, the creator, the owner, or the cycle's evaluator.
DROP POLICY IF EXISTS "action_items_delete" ON action_items;
CREATE POLICY "action_items_delete" ON action_items FOR DELETE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR created_by = auth.uid()
      OR owner_id = auth.uid()
      OR cycle_id IN (SELECT id FROM evaluation_cycles WHERE evaluator_id = auth.uid())
    )
  );

-- ── Verify ──
SELECT column_name FROM information_schema.columns
WHERE table_name = 'action_items' ORDER BY ordinal_position;
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'action_items' ORDER BY cmd, policyname;

-- ============================================================
-- END 020_action_items.sql
-- ============================================================
