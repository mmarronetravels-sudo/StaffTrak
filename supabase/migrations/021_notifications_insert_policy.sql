-- ============================================================
-- StaffTrak — 021_notifications_insert_policy.sql
-- Phase 5 (#5 notifications wave) — in-app notifications: enable creation.
--
-- The `notifications` table already exists (id, tenant_id, user_id,
-- notification_type, title, message, related_entity_type, related_entity_id,
-- is_read, sent_via_email, created_at) with RLS ON and two policies:
--   • SELECT "Users can view own notifications"
--   • UPDATE "Users can update own notifications"   (mark-as-read)
-- There is no INSERT policy, so clients can't create notifications — including
-- the cross-user case (e.g. an evaluator notifying the staff member). This
-- migration adds a tenant-scoped INSERT policy so any authenticated user can
-- create a notification for a recipient in their own tenant. The recipient is
-- always set explicitly via user_id; reads stay restricted to the recipient by
-- the existing SELECT policy. A covering index speeds the bell's unread lookup.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

-- ── Index for the unread badge / recent list ──
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- ── Tenant-scoped INSERT policy ──
-- Mirrors the write model used elsewhere in StaffTrak (tenant_id =
-- get_my_tenant_id()). tenant_id must be set on every insert or the check
-- fails closed.
DROP POLICY IF EXISTS "notifications_insert_tenant" ON notifications;
CREATE POLICY "notifications_insert_tenant" ON notifications FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

-- ── Verify ──
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'notifications' ORDER BY cmd, policyname;

-- ============================================================
-- END 021_notifications_insert_policy.sql
-- ============================================================
