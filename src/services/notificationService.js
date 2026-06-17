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
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      notification_type: type || null,
      title,
      message,
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
    })
    .select('id')
    .single()
  if (error) {
    console.error('createNotification failed:', error.message)
    return { ok: false, error }
  }
  if (sendEmail) emailRecipient(userId, data?.id, title, message)
  return { ok: true, id: data?.id }
}

// Look up the recipient's email + name and send the generic email, then mark
// the notification as emailed. All best-effort.
async function emailRecipient(userId, notificationId, title, message) {
  try {
    const { data: recipient } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()
    if (!recipient?.email) return
    const res = await notifyGeneric({
      to: recipient.email,
      subject: title,
      message: message || title,
      recipientName: recipient.full_name,
    })
    if (res?.success && notificationId) {
      await supabase.from('notifications').update({ sent_via_email: true }).eq('id', notificationId)
    }
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
