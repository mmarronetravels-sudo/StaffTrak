// src/services/notificationService.js
// ============================================================
// In-app notifications (#5 notifications wave).
// ------------------------------------------------------------
// Thin wrapper over the existing `notifications` table. Notifications are
// created client-side (tenant-scoped INSERT policy, migration 021) for a
// recipient `userId`; the recipient reads + marks them read under the table's
// existing own-row SELECT/UPDATE policies.
//
// Schema: id, tenant_id, user_id, notification_type, title, message,
//         related_entity_type, related_entity_id, is_read, sent_via_email,
//         created_at.
// ============================================================
import { supabase } from '../supabaseClient'
import { notifyGeneric } from './emailService'

// Create a notification for a recipient. Best-effort: never throw into the
// calling UI flow — a failed notification must not block the underlying action.
//
// Pass `sendEmail: true` to also email the recipient: we look up their address,
// send a generic email reusing this notification's title + message, and stamp
// sent_via_email. The email is fire-and-forget — failures are logged, not
// surfaced.
export async function createNotification({
  userId,
  tenantId,
  type,
  title,
  message = null,
  relatedEntityType = null,
  relatedEntityId = null,
  sendEmail = false,
}) {
  if (!userId || !tenantId || !title) return { ok: false }
  // NOTE: do NOT chain .select() here. The row belongs to the RECIPIENT, but the
  // notifications SELECT policy is user_id = auth.uid(); a sender reading back a
  // recipient's row returns 0 rows and .single() throws — which previously
  // aborted this function before the email ever sent. A plain insert (no
  // RETURNING) succeeds under the tenant-scoped INSERT policy.
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    tenant_id: tenantId,
    notification_type: type || null,
    title,
    message,
    related_entity_type: relatedEntityType,
    related_entity_id: relatedEntityId,
  })
  if (error) {
    console.error('createNotification failed:', error.message)
    return { ok: false, error }
  }
  if (sendEmail) emailRecipient(userId, title, message)
  return { ok: true }
}

// Look up the recipient's email + name and send the generic email. Best-effort.
// (We can't stamp sent_via_email from here — the sender isn't the row owner, so
// the UPDATE policy denies it; the email send itself is what matters.)
async function emailRecipient(userId, title, message) {
  try {
    const { data: recipient } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()
    if (!recipient?.email) return
    await notifyGeneric({
      to: recipient.email,
      subject: title,
      message: message || title,
      recipientName: recipient.full_name,
    })
  } catch (e) {
    console.error('notification email failed:', e?.message)
  }
}

// Recent notifications for a user (newest first).
export async function fetchNotifications(userId, limit = 20) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('fetchNotifications failed:', error.message)
    return []
  }
  return data || []
}

// Count of unread notifications for the badge.
export async function fetchUnreadCount(userId) {
  if (!userId) return 0
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) return 0
  return count || 0
}

export async function markRead(id) {
  if (!id) return
  await supabase.from('notifications').update({ is_read: true }).eq('id', id)
}

export async function markAllRead(userId) {
  if (!userId) return
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
}
