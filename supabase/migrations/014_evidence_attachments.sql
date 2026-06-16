-- ============================================================
-- StaffTrak — 014_evidence_attachments.sql
-- Phase 2b #11: file attachments (Supabase Storage).
--
-- Evidence items already support 'note' and 'link' (013). This adds 'file':
-- uploaded docs/images/PDFs stored in a private Storage bucket, plus the
-- Pre-Observation lesson-plan upload (which reuses the same bucket).
--
-- Object path convention:  {tenant_id}/{staff_id}/{subdir}/{uuid}-{filename}
--   e.g. evidence:  09e6.../72c2.../evidence/ab12-lesson.pdf
--        pre-obs:   09e6.../72c2.../preobs/cd34-plan.docx
-- Storage RLS is TENANT-scoped (first path folder = caller's tenant). Finer
-- per-staff access is already enforced by evidence_items row RLS: a signed URL
-- can only be minted for a file_path the caller can read off a visible row.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- NOTE: creating the bucket + storage.objects policies requires running this
-- as the project owner (the SQL Editor does).
-- ============================================================

-- ── 1. evidence_items file metadata columns ──
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS file_type TEXT;   -- MIME
ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS file_size INTEGER;

-- ── 2. Private 'evidence' bucket ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Storage RLS (tenant-scoped) on the 'evidence' bucket ──
-- get_my_tenant_id() (from migration 006) resolves the caller's tenant.
DROP POLICY IF EXISTS "evidence_obj_select" ON storage.objects;
CREATE POLICY "evidence_obj_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'evidence' AND (storage.foldername(name))[1] = get_my_tenant_id()::text);

DROP POLICY IF EXISTS "evidence_obj_insert" ON storage.objects;
CREATE POLICY "evidence_obj_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidence' AND (storage.foldername(name))[1] = get_my_tenant_id()::text);

DROP POLICY IF EXISTS "evidence_obj_update" ON storage.objects;
CREATE POLICY "evidence_obj_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'evidence' AND (storage.foldername(name))[1] = get_my_tenant_id()::text)
  WITH CHECK (bucket_id = 'evidence' AND (storage.foldername(name))[1] = get_my_tenant_id()::text);

DROP POLICY IF EXISTS "evidence_obj_delete" ON storage.objects;
CREATE POLICY "evidence_obj_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'evidence' AND (storage.foldername(name))[1] = get_my_tenant_id()::text);

-- ── 4. Verify ──
SELECT id, name, public FROM storage.buckets WHERE id = 'evidence';
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'evidence_obj_%'
ORDER BY cmd, policyname;

-- ============================================================
-- END 014_evidence_attachments.sql
-- ============================================================
