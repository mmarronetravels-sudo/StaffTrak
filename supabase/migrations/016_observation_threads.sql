-- ============================================================
-- StaffTrak — 016_observation_threads.sql
-- Phase 3 #4: comment → required staff-response loop on observations.
--
-- After an observation the evaluator posts feedback comments and can flag any
-- comment as requires_response. The observed staff member must reply before the
-- item is considered closed; threading (parent_id) lets the conversation
-- continue. An OPEN required-response item (requires_response AND resolved_at
-- IS NULL) blocks the staff member's Summative from being finalized (enforced
-- in the app's SummativeEvaluation submit).
--
-- Escalating email reminders for open items are part of the #5 notifications
-- wave (not in this migration).
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ── Table ──
CREATE TABLE IF NOT EXISTS observation_threads (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  observation_id    UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  parent_id         UUID REFERENCES observation_threads(id) ON DELETE CASCADE,  -- NULL = top-level comment
  author_id         UUID NOT NULL REFERENCES profiles(id),
  body              TEXT NOT NULL,
  requires_response BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_threads_observation ON observation_threads(observation_id);
CREATE INDEX IF NOT EXISTS idx_obs_threads_parent      ON observation_threads(parent_id);
-- Fast lookup of OPEN required-response items (the summative blockers).
CREATE INDEX IF NOT EXISTS idx_obs_threads_open_required
  ON observation_threads(observation_id)
  WHERE requires_response = TRUE AND resolved_at IS NULL;

-- ── RLS ──
-- Participants on the observation (its observer or the observed staff member)
-- plus HR/admin can read and post; either participant can resolve (a staff
-- reply resolves; the observer can manually resolve/reopen). Authors (or
-- HR/admin) can delete their own messages.
ALTER TABLE observation_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obs_threads_select" ON observation_threads;
CREATE POLICY "obs_threads_select" ON observation_threads FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR observation_id IN (SELECT id FROM observations WHERE observer_id = auth.uid() OR staff_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "obs_threads_insert" ON observation_threads;
CREATE POLICY "obs_threads_insert" ON observation_threads FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND author_id = auth.uid()
    AND (
      is_admin_hr()
      OR observation_id IN (SELECT id FROM observations WHERE observer_id = auth.uid() OR staff_id = auth.uid())
    )
  );

-- Update (resolve/reopen, or edit) allowed for participants + admin/HR.
DROP POLICY IF EXISTS "obs_threads_update" ON observation_threads;
CREATE POLICY "obs_threads_update" ON observation_threads FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      is_admin_hr()
      OR observation_id IN (SELECT id FROM observations WHERE observer_id = auth.uid() OR staff_id = auth.uid())
    )
  )
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Delete only your own message (or admin/HR).
DROP POLICY IF EXISTS "obs_threads_delete" ON observation_threads;
CREATE POLICY "obs_threads_delete" ON observation_threads FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND (author_id = auth.uid() OR is_admin_hr()));

-- ── Verify ──
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'observation_threads'
ORDER BY cmd, policyname;

-- ============================================================
-- END 016_observation_threads.sql
-- ============================================================
