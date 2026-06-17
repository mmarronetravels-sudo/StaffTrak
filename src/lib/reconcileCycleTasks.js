import { supabase } from '../supabaseClient'

// ============================================================
// Phase 1 auto-check (#2)
// ------------------------------------------------------------
// When a staff member finishes the underlying work (submits their
// Self-Reflection, submits their goals, or the Summative is finalized),
// the matching checklist task should tick itself.
//
// SCOPE:
//   ✓ self_reflection   ← self_assessments.submitted_at
//   ✓ goal_setting      ← >= 3 goals submitted/approved (2 SLG + 1 PGG)
//   ✓ summative         ← summative_evaluations.status = 'completed'
//   ✓ observation tasks ← a completed observations row, matched 1:1 and
//                         remembered via cycle_tasks.linked_id
//   ✓ meeting tasks     ← a meetings row with completed_at, matched 1:1
//                         and remembered via cycle_tasks.linked_id
//
// LINKED-ID MATCHING (Phase 2):
//   Observation/meeting tasks point at a `linked_table` but there are
//   several per cycle, so we can't blindly tick them. Instead we match a
//   task to one concrete record and persist that record's id in
//   `cycle_tasks.linked_id`. Matching is type-aware:
//     - meetings:   by meeting_type   (initial_goals / mid_year / end_year)
//     - formal obs: by observation_type = 'formal'
//     - informal obs: assigned in completion order to informal_observation_N
//   A record already linked to one task on this cycle is never reused for
//   another. Once a task has a linked_id we trust it and only re-check that
//   specific record's completion. pre_observation and post_observation_feedback
//   stay manual (they're the staff pre-form / Phase-3 response loop, not a
//   1:1 "the observation happened" signal).
//
// SAFETY:
//   - Never un-completes a task; only flips not_started/in_progress -> complete.
//   - Only counts linked records whose timestamp falls inside the cycle's
//     school-year window, so last year's reflection can't complete this
//     year's task (these tables aren't cycle-scoped yet).
//   - All queries are best-effort; any error is swallowed so the page
//     still renders. Writes are RLS-gated (e.g. staff can't tick the
//     evaluator-owned observation/summative tasks) — denied writes are ignored.
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

// Goal-progress task (#6) is done when EVERY in-year goal has a SUBMITTED
// goal_review for that phase (mid_year / final). Cycle-scoped (goal_reviews
// carry cycle_id), so this checker needs the cycle, not just the staff id.
async function isGoalProgressDone(cycle, phase, window) {
  const { data: goals } = await supabase
    .from('goals')
    .select('id, created_at')
    .eq('staff_id', cycle.staff_id)
  const goalIds = (goals || []).filter((g) => within(window, g.created_at)).map((g) => g.id)
  if (goalIds.length === 0) return false

  const { data: reviews } = await supabase
    .from('goal_reviews')
    .select('goal_id')
    .eq('cycle_id', cycle.id)
    .eq('phase', phase)
    .eq('entry_state', 'submitted')
  const reviewed = new Set((reviews || []).map((r) => r.goal_id))
  return goalIds.every((id) => reviewed.has(id))
}

// Each checker receives (cycle, window) and returns whether the task is done.
const CHECKERS = {
  self_reflection: (cycle, w) => isSelfReflectionDone(cycle.staff_id, w),
  goal_setting: (cycle, w) => isGoalSettingDone(cycle.staff_id, w),
  summative: (cycle, w) => isSummativeDone(cycle.staff_id, w),
  update_goal_progress_midyear: (cycle, w) => isGoalProgressDone(cycle, 'mid_year', w),
  update_goal_progress_final: (cycle, w) => isGoalProgressDone(cycle, 'final', w),
}

// ── Observation / meeting record fetchers (for linked_id matching) ──

// '2026-10-30' or ISO timestamp -> the value we window-test an event by.
// Prefer the scheduled date (the event's school-year home); fall back to
// the completion stamp, then created_at.
function eventStamp(rec) {
  return rec.scheduled_at || rec.ended_at || rec.completed_at || rec.created_at
}

async function fetchCompletedObservations(staffId, window) {
  const { data, error } = await supabase
    .from('observations')
    .select('id, observation_type, status, scheduled_at, ended_at, created_at')
    .eq('staff_id', staffId)
    .eq('status', 'completed')
  if (error || !data) return []
  return data
    .filter((o) => within(window, eventStamp(o)))
    .sort((a, b) => new Date(eventStamp(a)) - new Date(eventStamp(b)))
}

async function fetchCompletedMeetings(staffId, window) {
  const { data, error } = await supabase
    .from('meetings')
    .select('id, meeting_type, completed_at, scheduled_at, created_at')
    .eq('staff_id', staffId)
    .not('completed_at', 'is', null)
  if (error || !data) return []
  return data
    .filter((m) => within(window, eventStamp(m)))
    .sort((a, b) => new Date(eventStamp(a)) - new Date(eventStamp(b)))
}

// task_key -> meetings.meeting_type
const MEETING_TASK_TO_TYPE = {
  initial_goals_meeting: 'initial_goals',
  mid_year_goal_review: 'mid_year',
  end_of_year_goal_review: 'end_year',
}

const isInformalObsKey = (k) => typeof k === 'string' && k.startsWith('informal_observation')
const isFormalObsKey = (k) => k === 'formal_observation'

/**
 * Match still-open observation/meeting tasks to a concrete completed record,
 * 1:1, never reusing a record already linked to another task on this cycle.
 * Returns [{ taskId, linkedId, linkedTable }] for the tasks that should be
 * completed-and-linked. Pure (no writes).
 */
function matchLinkedTasks(tasks, completedObs, completedMeetings) {
  const result = []
  // Records already claimed by an existing linked_id on this cycle.
  const claimed = new Set(tasks.filter((t) => t.linked_id).map((t) => t.linked_id))

  const claim = (rec) => {
    claimed.add(rec.id)
    return rec.id
  }
  const firstUnclaimed = (records, pred) =>
    records.find((r) => !claimed.has(r.id) && pred(r))

  // Only tasks that are open AND not yet linked are eligible for a new match.
  const open = (t) => t.status !== 'complete' && !t.linked_id

  // ── Meetings: exact by type ──
  for (const task of tasks) {
    if (!open(task)) continue
    const type = MEETING_TASK_TO_TYPE[task.task_key]
    if (!type) continue
    const rec = firstUnclaimed(completedMeetings, (m) => m.meeting_type === type)
    if (rec) result.push({ taskId: task.id, linkedId: claim(rec), linkedTable: 'meetings' })
  }

  // ── Formal observation: exact by type ──
  for (const task of tasks) {
    if (!open(task) || !isFormalObsKey(task.task_key)) continue
    const rec = firstUnclaimed(completedObs, (o) => o.observation_type === 'formal')
    if (rec) result.push({ taskId: task.id, linkedId: claim(rec), linkedTable: 'observations' })
  }

  // ── Informal observations: assign in order (earliest task -> earliest obs) ──
  const informalTasks = tasks
    .filter((t) => open(t) && isInformalObsKey(t.task_key))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  for (const task of informalTasks) {
    const rec = firstUnclaimed(completedObs, (o) => o.observation_type !== 'formal')
    if (rec) result.push({ taskId: task.id, linkedId: claim(rec), linkedTable: 'observations' })
  }

  return result
}

// Confirm a task already carrying a linked_id should still be complete
// (its specific record is completed). Lets a previously-matched task tick
// once its observation/meeting is finished, without re-matching.
function linkedRecordComplete(task, completedObs, completedMeetings) {
  if (!task.linked_id) return false
  if (task.linked_table === 'observations' || isFormalObsKey(task.task_key) || isInformalObsKey(task.task_key)) {
    if (completedObs.some((o) => o.id === task.linked_id)) return true
  }
  if (task.linked_table === 'meetings' || MEETING_TASK_TO_TYPE[task.task_key]) {
    if (completedMeetings.some((m) => m.id === task.linked_id)) return true
  }
  return false
}

/**
 * Reconcile a cycle's tasks against the underlying work.
 * @returns the (possibly updated) tasks array. Identity-equal when nothing changed.
 */
export async function reconcileCycleTasks(cycle, tasks, currentUserId) {
  const window = schoolYearWindow(cycle.school_year)
  if (!window) return tasks

  const nowIso = new Date().toISOString()

  // Each entry: { id, patch }. patch always completes; observation/meeting
  // matches also stamp linked_id / linked_table.
  const updates = []

  // ── 1. Simple checkers (self-reflection / goals / summative) ──
  const simpleCandidates = tasks.filter(
    (t) => t.status !== 'complete' && CHECKERS[t.task_key]
  )
  for (const task of simpleCandidates) {
    try {
      if (await CHECKERS[task.task_key](cycle, window)) {
        updates.push({ id: task.id, patch: {} })
      }
    } catch {
      // ignore — leave the task as-is
    }
  }

  // ── 2. Observation / meeting linked-id matching ──
  const needsObsMeetingPass =
    tasks.some((t) =>
      isFormalObsKey(t.task_key) || isInformalObsKey(t.task_key) || MEETING_TASK_TO_TYPE[t.task_key]
    )
  if (needsObsMeetingPass) {
    let completedObs = []
    let completedMeetings = []
    try {
      ;[completedObs, completedMeetings] = await Promise.all([
        fetchCompletedObservations(cycle.staff_id, window),
        fetchCompletedMeetings(cycle.staff_id, window),
      ])
    } catch {
      // ignore — skip the obs/meeting pass entirely
    }

    // (a) tasks already linked but not yet ticked -> tick if their record is done
    for (const task of tasks) {
      if (task.status === 'complete' || !task.linked_id) continue
      if (linkedRecordComplete(task, completedObs, completedMeetings)) {
        updates.push({ id: task.id, patch: {} })
      }
    }

    // (b) open, unlinked tasks -> find a record, link + complete
    for (const m of matchLinkedTasks(tasks, completedObs, completedMeetings)) {
      updates.push({
        id: m.taskId,
        patch: { linked_id: m.linkedId, linked_table: m.linkedTable },
      })
    }
  }

  if (updates.length === 0) return tasks

  const basePatch = {
    status: 'complete',
    completed_at: nowIso,
    completed_by: currentUserId,
    updated_at: nowIso,
  }

  // Write. Tasks with no extra fields can go in one bulk update; linked ones
  // each carry a distinct linked_id so they go individually. All best-effort:
  // RLS may deny (e.g. staff can't complete the evaluator-owned observation/
  // summative) — denied rows simply won't reflect.
  const applied = new Map() // taskId -> full patch that succeeded

  const plain = updates.filter((u) => Object.keys(u.patch).length === 0)
  if (plain.length > 0) {
    const ids = plain.map((u) => u.id)
    const { error } = await supabase.from('cycle_tasks').update(basePatch).in('id', ids)
    if (!error) ids.forEach((id) => applied.set(id, basePatch))
  }

  for (const u of updates.filter((x) => Object.keys(x.patch).length > 0)) {
    const full = { ...basePatch, ...u.patch }
    const { error } = await supabase.from('cycle_tasks').update(full).eq('id', u.id)
    if (!error) applied.set(u.id, full)
  }

  if (applied.size === 0) return tasks
  return tasks.map((t) => (applied.has(t.id) ? { ...t, ...applied.get(t.id) } : t))
}
