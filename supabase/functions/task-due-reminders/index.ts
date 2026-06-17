import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ============================================================
// task-due-reminders — #5 notifications wave (task due/overdue nudges)
// ------------------------------------------------------------
// Runs on a daily pg_cron schedule. Finds incomplete checklist tasks on ACTIVE
// cycles and nudges the task owner(s) when a task is due soon or overdue:
//   • first nudge 3 days before the due date,
//   • then every 3 days while still due-soon/overdue, until the task completes.
// Cadence is tracked per task via cycle_tasks.last_due_notified_at.
// Recipients follow owner_role: staff → the cycle's staff member, evaluator →
// the cycle's evaluator, both → both. In-app notification + email each time.
//
// Auth: invoked by pg_cron with the service-role key. Runs with the service
// role (SUPABASE_SERVICE_ROLE_KEY).
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const DAY = 86400000
const DUE_SOON_DAYS = 3
const REPEAT_DAYS = 3

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

async function sendEmail(to: string, subject: string, message: string, recipientName?: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ to, template: 'generic', data: { subject, message, recipientName } }),
    })
  } catch (e) {
    console.error('task-due email failed:', (e as Error).message)
  }
}

serve(async (_req) => {
  try {
    const now = new Date()

    // 1. Incomplete tasks that have a due date.
    const { data: tasks } = await supabase
      .from('cycle_tasks')
      .select('id, cycle_id, tenant_id, title, owner_role, due_date, status, last_due_notified_at')
      .neq('status', 'complete')
      .not('due_date', 'is', null)

    if (!tasks || tasks.length === 0) return json({ sent: 0, reason: 'no incomplete dated tasks' })

    // 2. Restrict to ACTIVE cycles; pull staff/evaluator for recipients.
    const cycleIds = [...new Set(tasks.map((t) => t.cycle_id))]
    const { data: cycles } = await supabase
      .from('evaluation_cycles')
      .select('id, staff_id, evaluator_id, status')
      .in('id', cycleIds)
      .eq('status', 'active')
    const cycleById: Record<string, any> = Object.fromEntries((cycles || []).map((c) => [c.id, c]))

    // 3. Profiles for emails/names.
    const userIds = [
      ...new Set(
        (cycles || []).flatMap((c) => [c.staff_id, c.evaluator_id]).filter(Boolean),
      ),
    ]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds)
    const profById: Record<string, any> = Object.fromEntries((profiles || []).map((p) => [p.id, p]))

    let sent = 0
    for (const t of tasks) {
      const cycle = cycleById[t.cycle_id]
      if (!cycle) continue // not an active cycle

      const dueDate = new Date(`${t.due_date}T00:00:00`)
      const daysToDue = Math.ceil((dueDate.getTime() - now.getTime()) / DAY)
      if (daysToDue > DUE_SOON_DAYS) continue // not yet in the due-soon window

      const sinceLast = t.last_due_notified_at
        ? (now.getTime() - new Date(t.last_due_notified_at).getTime()) / DAY
        : null
      const due = sinceLast == null ? true : sinceLast >= REPEAT_DAYS
      if (!due) continue

      const overdue = daysToDue < 0
      const title = overdue ? 'Task overdue' : 'Task due soon'
      const message = overdue
        ? `"${t.title}" was due ${fmtDate(t.due_date)} and isn't complete yet.`
        : `"${t.title}" is due ${fmtDate(t.due_date)}.`

      // Recipients by owner_role.
      const recipients: string[] = []
      if (t.owner_role === 'staff' || t.owner_role === 'both') recipients.push(cycle.staff_id)
      if (t.owner_role === 'evaluator' || t.owner_role === 'both') recipients.push(cycle.evaluator_id)

      let notifiedAny = false
      for (const uid of [...new Set(recipients.filter(Boolean))]) {
        await supabase.from('notifications').insert({
          user_id: uid,
          tenant_id: t.tenant_id,
          notification_type: 'task_due_reminder',
          title,
          message,
          related_entity_type: 'cycle_task',
          related_entity_id: t.id,
        })
        const p = profById[uid]
        if (p?.email) await sendEmail(p.email, title, message, p.full_name)
        notifiedAny = true
      }

      if (notifiedAny) {
        await supabase
          .from('cycle_tasks')
          .update({ last_due_notified_at: now.toISOString() })
          .eq('id', t.id)
        sent++
      }
    }

    return json({ sent, scanned: tasks.length })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
