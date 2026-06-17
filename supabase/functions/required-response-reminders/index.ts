import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ============================================================
// required-response-reminders — #5 notifications wave (escalating reminders)
// ------------------------------------------------------------
// Runs on a daily pg_cron schedule. Finds OPEN required-response observation
// comments (requires_response = true AND resolved_at IS NULL) — the items that
// block a staff member's summative — and nudges the staff member (CC the
// evaluator) on an escalating cadence:
//   • every 3 days normally,
//   • daily once within 7 days of that staff member's summative deadline,
//   • first reminder only after the item is ≥ 1 day old.
// Cadence is tracked per item via observation_threads.last_reminded_at.
// Sends an in-app notification + a generic email (via the send-email function)
// to the staff member, and the same to the evaluator as a CC.
//
// Auth: invoked by pg_cron with the project's service-role key as a Bearer
// token. Runs with the service role (SUPABASE_SERVICE_ROLE_KEY) so it can read
// across users and write last_reminded_at / notifications.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const DAY = 86400000
const FINAL_WEEK_DAYS = 7
const NORMAL_CADENCE_DAYS = 3
const FIRST_REMINDER_MIN_AGE_DAYS = 1

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

// Summative deadline for a cycle: its end_date, else June 5 of the school
// year's second calendar year (e.g. '2026-2027' -> 2027-06-05).
function deriveDeadline(cycle: any): Date {
  if (cycle?.end_date) return new Date(`${cycle.end_date}T00:00:00`)
  const sy: string | undefined = cycle?.school_year
  let secondYear = new Date().getFullYear()
  if (sy && sy.includes('-')) secondYear = parseInt(sy.split('-')[1], 10) || secondYear
  else if (sy) secondYear = parseInt(sy, 10) || secondYear
  return new Date(`${secondYear}-06-05T00:00:00`)
}

async function sendEmail(to: string, subject: string, message: string, recipientName?: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ to, template: 'generic', data: { subject, message, recipientName } }),
    })
  } catch (e) {
    console.error('reminder email failed:', (e as Error).message)
  }
}

serve(async (_req) => {
  try {
    const now = new Date()

    // 1. Open required-response items.
    const { data: threads } = await supabase
      .from('observation_threads')
      .select('id, observation_id, created_at, last_reminded_at')
      .eq('requires_response', true)
      .is('resolved_at', null)

    if (!threads || threads.length === 0) return json({ sent: 0, reason: 'no open required responses' })

    // 2. Their observations (staff, observer, tenant).
    const obsIds = [...new Set(threads.map((t) => t.observation_id))]
    const { data: observations } = await supabase
      .from('observations')
      .select('id, staff_id, observer_id, tenant_id')
      .in('id', obsIds)
    const obsById: Record<string, any> = Object.fromEntries((observations || []).map((o) => [o.id, o]))

    // 3. Active cycles (deadline) + profiles (email/name).
    const staffIds = [...new Set((observations || []).map((o) => o.staff_id).filter(Boolean))]
    const { data: cycles } = await supabase
      .from('evaluation_cycles')
      .select('staff_id, school_year, end_date, status, evaluator_id')
      .in('staff_id', staffIds)
      .eq('status', 'active')
    const cycleByStaff: Record<string, any> = {}
    for (const c of cycles || []) if (!cycleByStaff[c.staff_id]) cycleByStaff[c.staff_id] = c

    const userIds = [
      ...new Set(
        [
          ...(observations || []).map((o) => o.staff_id),
          ...(observations || []).map((o) => o.observer_id),
        ].filter(Boolean),
      ),
    ]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds)
    const profById: Record<string, any> = Object.fromEntries((profiles || []).map((p) => [p.id, p]))

    let sent = 0
    for (const t of threads) {
      const obs = obsById[t.observation_id]
      if (!obs?.staff_id) continue

      const cycle = cycleByStaff[obs.staff_id]
      const deadline = deriveDeadline(cycle)
      const daysToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / DAY)
      const threshold = daysToDeadline <= FINAL_WEEK_DAYS ? 1 : NORMAL_CADENCE_DAYS

      const ageDays = (now.getTime() - new Date(t.created_at).getTime()) / DAY
      const sinceLast = t.last_reminded_at
        ? (now.getTime() - new Date(t.last_reminded_at).getTime()) / DAY
        : null
      const due = sinceLast == null ? ageDays >= FIRST_REMINDER_MIN_AGE_DAYS : sinceLast >= threshold
      if (!due) continue

      const tenantId = obs.tenant_id
      const staff = profById[obs.staff_id]
      const evaluatorId = obs.observer_id || cycle?.evaluator_id
      const evaluator = evaluatorId ? profById[evaluatorId] : null

      // Staff member — in-app + email.
      const staffTitle = 'Reminder: a feedback comment still needs your response'
      const staffMsg =
        'You have an unanswered required response on an observation. Open items block your summative from being finalized — please reply to close it.'
      await supabase.from('notifications').insert({
        user_id: obs.staff_id,
        tenant_id: tenantId,
        notification_type: 'required_response_reminder',
        title: staffTitle,
        message: staffMsg,
        related_entity_type: 'observation',
        related_entity_id: t.observation_id,
      })
      if (staff?.email) await sendEmail(staff.email, staffTitle, staffMsg, staff.full_name)

      // Evaluator CC — in-app + email.
      if (evaluator?.id) {
        const evTitle = 'Reminder: a required response is still open'
        const evMsg = `${staff?.full_name || 'A staff member'} has an unanswered required response that is blocking their summative.`
        await supabase.from('notifications').insert({
          user_id: evaluator.id,
          tenant_id: tenantId,
          notification_type: 'required_response_reminder',
          title: evTitle,
          message: evMsg,
          related_entity_type: 'observation',
          related_entity_id: t.observation_id,
        })
        if (evaluator.email) await sendEmail(evaluator.email, evTitle, evMsg, evaluator.full_name)
      }

      await supabase
        .from('observation_threads')
        .update({ last_reminded_at: now.toISOString() })
        .eq('id', t.id)
      sent++
    }

    return json({ sent, scanned: threads.length })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
