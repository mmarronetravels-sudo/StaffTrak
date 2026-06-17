import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import {
  REVIEW_PHASES,
  REVIEW_STATUS_ORDER,
  reviewPhaseLabel,
  reviewStatusLabel,
  reviewStatusBadge,
} from '../lib/goalReviews'

// ============================================================
// GoalReviewPanel — Phase 4b #6
// ------------------------------------------------------------
// One goal × one phase (mid_year | final) of staff-authored progress. The goal
// owner drafts a progress note + status and submits it ahead of the meeting;
// once submitted it locks (the owner can reopen to edit). Evaluators and the
// meeting view render it read-only.
//
// Props:
//   goal     — { id, ... }   (the goal being reviewed)
//   cycle    — { id, tenant_id, staff_id, evaluator_id }
//   phase    — 'mid_year' | 'final'
//   profile  — current user's profile
//   isAdmin, isHR — role flags
//   readOnly — force read-only (e.g. the evaluator's meeting view)
//   onChange — optional callback(row) after a successful write
// ============================================================

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function GoalReviewPanel({
  goal,
  cycle,
  phase,
  profile,
  isAdmin = false,
  isHR = false,
  readOnly = false,
  onChange,
}) {
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('')

  const meta = REVIEW_PHASES[phase] || {}
  const ownView = profile?.id === cycle?.staff_id
  const canEdit = !readOnly && (ownView || isAdmin || isHR)

  useEffect(() => {
    if (goal?.id && cycle?.id && phase) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.id, cycle?.id, phase])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('goal_reviews')
      .select('*')
      .eq('goal_id', goal.id)
      .eq('phase', phase)
      .maybeSingle()
    setRow(data || null)
    setNote(data?.progress_note || '')
    setStatus(data?.status || '')
    setLoading(false)
  }

  const persist = async (patch) => {
    setSaving(true)
    let result
    if (row?.id) {
      result = await supabase
        .from('goal_reviews')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('goal_reviews')
        .insert({
          tenant_id: cycle.tenant_id,
          goal_id: goal.id,
          cycle_id: cycle.id,
          phase,
          ...patch,
        })
        .select()
        .single()
    }
    setSaving(false)
    if (result.error) {
      alert(`Could not save progress: ${result.error.message}`)
      return null
    }
    setRow(result.data)
    if (onChange) onChange(result.data)
    return result.data
  }

  const saveDraft = () =>
    persist({ progress_note: note, status: status || null, entry_state: 'draft' })

  const submit = () =>
    persist({
      progress_note: note,
      status: status || null,
      entry_state: 'submitted',
      submitted_at: new Date().toISOString(),
    })

  const reopen = () => persist({ entry_state: 'draft', submitted_at: null })

  const submitted = row?.entry_state === 'submitted'

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-3 text-xs text-[#666666]">
        Loading {reviewPhaseLabel(phase)} progress…
      </div>
    )
  }

  // ── Read-only rendering (evaluator / meeting view, or no edit rights) ──
  if (!canEdit || submitted) {
    return (
      <div className="border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
          <span className="text-xs font-semibold text-[#2c3e7e]">{meta.label || reviewPhaseLabel(phase)} progress</span>
          <div className="flex items-center gap-2">
            {row?.status && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${reviewStatusBadge(row.status)}`}>
                {reviewStatusLabel(row.status)}
              </span>
            )}
            {submitted ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                ✓ Submitted {fmtDate(row.submitted_at)}
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">Draft</span>
            )}
          </div>
        </div>
        <div className="p-3">
          {row?.progress_note ? (
            <p className="text-sm text-[#444444] whitespace-pre-wrap">{row.progress_note}</p>
          ) : (
            <p className="text-sm text-[#666666] italic">No progress recorded yet.</p>
          )}
          {canEdit && submitted && (
            <button onClick={reopen} disabled={saving} className="mt-2 text-xs text-[#477fc1] hover:underline disabled:opacity-50">
              Reopen to edit
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Editable (staff owner, draft) ──
  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
        <span className="text-xs font-semibold text-[#2c3e7e]">{meta.label || reviewPhaseLabel(phase)} progress</span>
        {meta.blurb && <span className="text-[10px] text-[#666666]">{meta.blurb}</span>}
      </div>
      <div className="p-3 space-y-2">
        <div>
          <label className="block text-[11px] font-medium text-[#666666] mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
          >
            <option value="">Select…</option>
            {REVIEW_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{reviewStatusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-[#666666] mb-1">Progress note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows="3"
            placeholder="How is this goal progressing? Evidence, adjustments, results…"
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={saveDraft}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-[#666666] text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-[#2c3e7e] text-white text-sm hover:bg-[#1e2a5e] disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}
