-- ============================================================
-- StaffTrak — 017_fast_feedback.sql
-- Phase 3 #12: fast-feedback workflow (24-hour turnaround + snippets).
--
--   observations.feedback_delivered_at — when the evaluator first delivered
--     feedback to the staff member (set at completion when feedback is written,
--     or on the evaluator's first feedback comment). Turnaround is measured
--     from the observation's end (ended_at / started_at / scheduled_at) to this
--     stamp; the UI flags ≤ 24h vs. over.
--   feedback_snippets — each evaluator's reusable one-tap feedback phrases.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ── 1. Feedback turnaround timestamp ──
ALTER TABLE observations ADD COLUMN IF NOT EXISTS feedback_delivered_at TIMESTAMPTZ;

-- ── 2. Reusable feedback snippets (per evaluator) ──
CREATE TABLE IF NOT EXISTS feedback_snippets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  owner_id    UUID NOT NULL REFERENCES profiles(id),
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_snippets_owner ON feedback_snippets(owner_id);

ALTER TABLE feedback_snippets ENABLE ROW LEVEL SECURITY;

-- Each user owns and manages their own snippet library.
DROP POLICY IF EXISTS "feedback_snippets_select" ON feedback_snippets;
CREATE POLICY "feedback_snippets_select" ON feedback_snippets FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND owner_id = auth.uid());

DROP POLICY IF EXISTS "feedback_snippets_insert" ON feedback_snippets;
CREATE POLICY "feedback_snippets_insert" ON feedback_snippets FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND owner_id = auth.uid());

DROP POLICY IF EXISTS "feedback_snippets_update" ON feedback_snippets;
CREATE POLICY "feedback_snippets_update" ON feedback_snippets FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND owner_id = auth.uid())
  WITH CHECK (tenant_id = get_my_tenant_id() AND owner_id = auth.uid());

DROP POLICY IF EXISTS "feedback_snippets_delete" ON feedback_snippets;
CREATE POLICY "feedback_snippets_delete" ON feedback_snippets FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND owner_id = auth.uid());

-- ── Verify ──
SELECT column_name FROM information_schema.columns
WHERE table_name = 'observations' AND column_name = 'feedback_delivered_at';
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'feedback_snippets' ORDER BY cmd, policyname;

-- ============================================================
-- END 017_fast_feedback.sql
-- ============================================================
