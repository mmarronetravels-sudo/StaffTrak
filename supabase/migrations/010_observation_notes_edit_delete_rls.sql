-- ============================================================
-- StaffTrak — 010_observation_notes_edit_delete_rls.sql
-- Lets an evaluator EDIT and DELETE their own observation notes (and
-- remove individual indicator tags). Notes were previously add-only.
--
-- Scope: the current user must be the OBSERVER on the parent observation.
-- Idempotent (drop-if-exists then create). Run in the Supabase SQL Editor
-- (project fgbigyffgzqzvksrkqxv). Database-only — no app redeploy needed.
-- ============================================================

ALTER TABLE observation_notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_note_tags  ENABLE ROW LEVEL SECURITY;

-- ── observation_notes: observer can update their notes ──
DROP POLICY IF EXISTS "obs_notes_update_observer" ON observation_notes;
CREATE POLICY "obs_notes_update_observer" ON observation_notes FOR UPDATE
  USING (observation_id IN (SELECT id FROM observations WHERE observer_id = auth.uid()))
  WITH CHECK (observation_id IN (SELECT id FROM observations WHERE observer_id = auth.uid()));

-- ── observation_notes: observer can delete their notes ──
DROP POLICY IF EXISTS "obs_notes_delete_observer" ON observation_notes;
CREATE POLICY "obs_notes_delete_observer" ON observation_notes FOR DELETE
  USING (observation_id IN (SELECT id FROM observations WHERE observer_id = auth.uid()));

-- ── observation_note_tags: observer can delete tags on their own notes ──
DROP POLICY IF EXISTS "obs_note_tags_delete_observer" ON observation_note_tags;
CREATE POLICY "obs_note_tags_delete_observer" ON observation_note_tags FOR DELETE
  USING (
    note_id IN (
      SELECT n.id FROM observation_notes n
      JOIN observations o ON o.id = n.observation_id
      WHERE o.observer_id = auth.uid()
    )
  );

-- ── Verify ──
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('observation_notes', 'observation_note_tags')
ORDER BY tablename, cmd, policyname;

-- ============================================================
-- END 010_observation_notes_edit_delete_rls.sql
-- ============================================================
