-- ============================================================
-- StaffTrak — 018_evaluation_feedback.sql
-- Phase 4a #5: Initial / Mid-Year / Final feedback boxes.
--
-- Three phase-labeled feedback spaces tied to the evaluation cycle. For each
-- phase the evaluator writes feedback and signs it; the staff member writes a
-- response and acknowledges it. The staff acknowledgment IS the sign-off for
-- the corresponding meeting (Mid-Year / Final) — surfaced inside MeetingSession
-- — so there is a single signature, not two competing ones.
--
--   phase      ∈ initial | mid_year | final   (one row per cycle per phase)
--   meeting_id   optional link to the meeting where this feedback is delivered
--                (Mid-Year / Final conference, or the Initial Goals meeting).
--   evaluator_text       — the evaluator's written feedback for the phase.
--   staff_response       — the staff member's written response/acknowledgment.
--   evaluator_signed_at  — set when the evaluator finalizes their feedback.
--   staff_acknowledged_at— set when the staff member acknowledges (the sign-off).
--
-- RLS: the cycle's evaluator (and HR/admin) create + write the evaluator side;
-- the cycle's staff member responds + acknowledges; both parties + HR/admin read.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ── 1. Enum ──
DO $$ BEGIN
  CREATE TYPE eval_feedback_phase AS ENUM ('initial', 'mid_year', 'final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Table ──
CREATE TABLE IF NOT EXISTS evaluation_feedback (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  cycle_id              UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
  phase                 eval_feedback_phase NOT NULL,
  meeting_id            UUID REFERENCES meetings(id) ON DELETE SET NULL,
  evaluator_text        TEXT,
  staff_response        TEXT,
  evaluator_signed_at   TIMESTAMPTZ,
  staff_acknowledged_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cycle_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_eval_feedback_cycle   ON evaluation_feedback(cycle_id);
CREATE INDEX IF NOT EXISTS idx_eval_feedback_meeting ON evaluation_feedback(meeting_id);

-- ── 3. RLS ──
ALTER TABLE evaluation_feedback ENABLE ROW LEVEL SECURITY;

-- Read: HR/admin, or either party on the cycle (its staff member or evaluator).
DROP POLICY IF EXISTS "eval_feedback_select" ON evaluation_feedback;
CREATE POLICY "eval_feedback_select" ON evaluation_feedback FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR cycle_id IN (
        SELECT id FROM evaluation_cycles
        WHERE staff_id = auth.uid() OR evaluator_id = auth.uid()
      )
    )
  );

-- Insert: the cycle's evaluator (or HR/admin) creates the phase feedback row.
DROP POLICY IF EXISTS "eval_feedback_insert" ON evaluation_feedback;
CREATE POLICY "eval_feedback_insert" ON evaluation_feedback FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR cycle_id IN (SELECT id FROM evaluation_cycles WHERE evaluator_id = auth.uid())
    )
  );

-- Update: evaluator writes/signs their side; staff writes/acknowledges theirs;
-- HR/admin can touch either. Column-level intent (who edits which field) is
-- enforced in the app; the server gates row access to the two parties + HR.
DROP POLICY IF EXISTS "eval_feedback_update" ON evaluation_feedback;
CREATE POLICY "eval_feedback_update" ON evaluation_feedback FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR cycle_id IN (
        SELECT id FROM evaluation_cycles
        WHERE staff_id = auth.uid() OR evaluator_id = auth.uid()
      )
    )
  )
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Delete: the cycle's evaluator or HR/admin only.
DROP POLICY IF EXISTS "eval_feedback_delete" ON evaluation_feedback;
CREATE POLICY "eval_feedback_delete" ON evaluation_feedback FOR DELETE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR cycle_id IN (SELECT id FROM evaluation_cycles WHERE evaluator_id = auth.uid())
    )
  );

-- ── Verify ──
SELECT column_name FROM information_schema.columns
WHERE table_name = 'evaluation_feedback' ORDER BY ordinal_position;
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'evaluation_feedback' ORDER BY cmd, policyname;

-- ============================================================
-- END 018_evaluation_feedback.sql
-- ============================================================
