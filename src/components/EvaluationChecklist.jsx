import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// ── Helpers ─────────────────────────────────────────────────────

// Parse a DATE column ('2026-10-16') as a local date (avoid TZ off-by-one).
function parseDate(d) {
  if (!d) return null
  return new Date(`${d}T00:00:00`)
}

function formatDue(d) {
  const date = parseDate(d)
  if (!date) return 'No due date'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Where a task's "real work" lives, depending on who's looking.
// `ownView` = the viewer is the staff member whose cycle this is.
function linkForTask(task, ownView) {
  switch (task.linked_table) {
    case 'self_assessments':     return '/self-reflection'
    case 'goals':                return '/goals'
    case 'meetings':             return ownView ? '/my-meetings' : '/meetings'
    case 'observations':         return ownView ? '/my-observations' : '/observations'
    case 'summative_evaluations':return ownView ? '/my-summative' : '/summatives'
    default:                     return null
  }
}

const OWNER_LABEL = { staff: 'Staff', evaluator: 'Evaluator', both: 'Staff + Evaluator' }

// ── Component ───────────────────────────────────────────────────

export default function EvaluationChecklist({ cycle, tasks, profile, isAdmin, isEvaluator, isHR, onTasksChange }) {
  const [busyId, setBusyId] = useState(null)

  const ownView = profile?.id === cycle?.staff_id

  // Can the current viewer check off this task?
  // Mirrors the cycle_tasks RLS UPDATE policies (server enforces too).
  const canCheck = (task) => {
    if (isAdmin || isHR) return true
    const staffOwned = task.owner_role === 'staff' || task.owner_role === 'both'
    const evalOwned = task.owner_role === 'evaluator' || task.owner_role === 'both'
    if (ownView && staffOwned) return true
    if (evalOwned && (isEvaluator || cycle.evaluator_id === profile?.id)) return true
    return false
  }

  const setStatus = async (task, nextStatus) => {
    setBusyId(task.id)
    const patch = {
      status: nextStatus,
      completed_at: nextStatus === 'complete' ? new Date().toISOString() : null,
      completed_by: nextStatus === 'complete' ? profile.id : null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('cycle_tasks').update(patch).eq('id', task.id)
    if (!error) {
      onTasksChange(tasks.map((t) => (t.id === task.id ? { ...t, ...patch } : t)))
    } else {
      // RLS or network error — surface it without crashing the page.
      alert(`Could not update task: ${error.message}`)
    }
    setBusyId(null)
  }

  const toggle = (task) => {
    if (!canCheck(task) || busyId) return
    setStatus(task, task.status === 'complete' ? 'not_started' : 'complete')
  }

  // ── Derived display state per task ──
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const decorate = (task) => {
    const due = parseDate(task.due_date)
    const isComplete = task.status === 'complete'
    let flag = null
    if (!isComplete && due) {
      const diffDays = Math.round((due - today) / 86400000)
      if (diffDays < 0) flag = { label: `Overdue`, class: 'bg-red-100 text-red-700' }
      else if (diffDays <= 14) flag = { label: `Due soon`, class: 'bg-amber-100 text-amber-700' }
    }
    return { isComplete, flag }
  }

  const completeCount = tasks.filter((t) => t.status === 'complete').length
  const pct = tasks.length ? Math.round((completeCount / tasks.length) * 100) : 0

  const trackLabel = cycle.track
    ? cycle.track.charAt(0).toUpperCase() + cycle.track.slice(1)
    : '—'

  return (
    <div className="bg-white rounded-lg shadow">
      {/* ── Cycle header ── */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2 py-1 rounded bg-[#2c3e7e] text-white">{trackLabel}</span>
              <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">{cycle.school_year}</span>
              {cycle.status && cycle.status !== 'active' && (
                <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600 capitalize">{cycle.status}</span>
              )}
            </div>
            {cycle.staff?.full_name && (
              <p className="text-lg font-semibold text-[#2c3e7e]">{cycle.staff.full_name}</p>
            )}
            {cycle.evaluator?.full_name && (
              <p className="text-sm text-[#666666]">Evaluator: {cycle.evaluator.full_name}</p>
            )}
          </div>

          {/* Progress */}
          <div className="text-right min-w-[140px]">
            <p className="text-sm text-[#666666]">{completeCount} of {tasks.length} complete</p>
            <div className="mt-1 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#f3843e]" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-[#666666] mt-1">{pct}%</p>
          </div>
        </div>
      </div>

      {/* ── Task rows ── */}
      {tasks.length === 0 ? (
        <div className="p-6 text-center text-[#666666]">No tasks on this cycle yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {tasks.map((task) => {
            const { isComplete, flag } = decorate(task)
            const checkable = canCheck(task)
            const link = linkForTask(task, ownView)
            return (
              <li key={task.id} className="flex items-start gap-3 p-4">
                {/* Checkbox */}
                <button
                  onClick={() => toggle(task)}
                  disabled={!checkable || busyId === task.id}
                  title={checkable ? (isComplete ? 'Mark not done' : 'Mark complete') : 'You can’t check off this task'}
                  className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center text-xs transition-colors ${
                    isComplete
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'bg-white border-gray-300 text-transparent'
                  } ${checkable ? 'hover:border-[#2c3e7e] cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                >
                  ✓
                </button>

                {/* Title + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${isComplete ? 'text-gray-400 line-through' : 'text-[#2c3e7e]'}`}>
                      {task.title}
                    </span>
                    {task.is_custom && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Custom</span>
                    )}
                    {flag && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${flag.class}`}>{flag.label}</span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-sm text-[#666666] mt-0.5">{task.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-[#666666]">
                    <span>👤 {OWNER_LABEL[task.owner_role] || task.owner_role}</span>
                    <span>📅 {formatDue(task.due_date)}</span>
                    {task.completed_at && (
                      <span className="text-green-700">
                        ✓ {new Date(task.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Jump to the real work */}
                {link && (
                  <Link
                    to={link}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-[#477fc1] text-white hover:bg-[#3a6ca8] whitespace-nowrap"
                  >
                    Open →
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
