import { supabase } from '../supabaseClient'

// ============================================================
// Phase 1 auto-check (#2)
// ------------------------------------------------------------
// When a staff member finishes the underlying work (submits their
// Self-Reflection, submits their goals, or the Summative is finalized),
// the matching checklist task should tick itself.
//
// SCOPE (deliberately conservative for Phase 1):
//   ✓ self_reflection   ← self_assessments.submitted_at
//   ✓ goal_setting      ← >= 3 goals submitted/approved (2 SLG + 1 PGG)
//   ✓ summative         ← summative_evaluations.status = 'completed'
//
// Observation/meeting tasks are NOT auto-checked yet: there are several
// per cycle and the linked record can't be mapped 1:1 until `linked_id`
// is wired (Phase 2, alongside the calendar). They stay manual for now.
//
// SAFETY:
//   - Never un-completes a task; only flips not_started/in_progress -> complete.
//   - Only counts linked records whose timestamp falls inside the cycle's
//     school-year window, so last year's reflection can't complete this
//     year's task (these tables aren't cycle-scoped yet).
//   - All queries are best-effort; any error is swallowed so the page
//     still renders.
// ============================================================

// '2026-2027' -> { start: Date(2026-08-01), end: Date(2027-08-01) }
function schoolYearWindow(schoolYear) {
  const firstYear = parseInt(String(schoolYear).split('-')[0], 10)
  if (Number.isNaN(firstYear)) return null
  return {
    start: new Date(`${firstYear}-08-01T00:00:00`),
    end: new Date(`${firstYear + 1}-08-01T00:00:00`),
  }
}

function within(window, isoTimestamp) {
  if (!window || !isoTimestamp) return false
  const t = new Date(isoTimestamp)
  return t >= window.start && t < window.end
}

async function isSelfReflectionDone(staffId, window) {
  const { data, error } = await supabase
    .from('self_assessments')
    .select('id, submitted_at')
    .eq('staff_id', staffId)
    .not('submitted_at', 'is', null)
  if (error || !data) return false
  return data.some((r) => within(window, r.submitted_at))
}

async function isGoalSettingDone(staffId, window) {
  const { data, error } = await supabase
    .from('goals')
    .select('id, status, created_at')
    .eq('staff_id', staffId)
    .in('status', ['submitted', 'approved'])
  if (error || !data) return false
  const inYear = data.filter((g) => within(window, g.created_at))
  return inYear.length >= 3 // 2 SLG + 1 PGG
}

async function isSummativeDone(staffId, window) {
  const { data, error } = await supabase
    .from('summative_evaluations')
    .select('id, status, created_at')
    .eq('staff_id', staffId)
    .eq('status', 'completed')
  if (error || !data) return false
  return data.some((r) => within(window, r.created_at))
}

const CHECKERS = {
  self_reflection: isSelfReflectionDone,
  goal_setting: isGoalSettingDone,
  summative: isSummativeDone,
}

/**
 * Reconcile a cycle's tasks against the underlying work.
 * @returns the (possibly updated) tasks array. Identity-equal when nothing changed.
 */
export async function reconcileCycleTasks(cycle, tasks, currentUserId) {
  const window = schoolYearWindow(cycle.school_year)
  if (!window) return tasks

  const candidates = tasks.filter(
    (t) => t.status !== 'complete' && CHECKERS[t.task_key]
  )
  if (candidates.length === 0) return tasks

  const toComplete = []
  for (const task of candidates) {
    try {
      if (await CHECKERS[task.task_key](cycle.staff_id, window)) {
        toComplete.push(task.id)
      }
    } catch {
      // ignore — leave the task as-is
    }
  }
  if (toComplete.length === 0) return tasks

  const patch = {
    status: 'complete',
    completed_at: new Date().toISOString(),
    completed_by: currentUserId,
    updated_at: new Date().toISOString(),
  }

  // Best-effort write; RLS may deny (e.g. staff can't complete the
  // evaluator-owned summative) — that's fine, we just won't reflect it.
  const { error } = await supabase
    .from('cycle_tasks')
    .update(patch)
    .in('id', toComplete)

  if (error) return tasks

  const done = new Set(toComplete)
  return tasks.map((t) => (done.has(t.id) ? { ...t, ...patch } : t))
}
