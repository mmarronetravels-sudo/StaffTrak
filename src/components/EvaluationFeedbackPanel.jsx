import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { FEEDBACK_PHASES, phaseLabel } from '../lib/evaluationFeedback'

// ============================================================
// EvaluationFeedbackPanel — Phase 4a #5
// ------------------------------------------------------------
// One phase of cycle feedback (initial | mid_year | final). The evaluator
// writes and signs feedback; the staff member reads it (once signed), writes a
// response, and acknowledges. The staff acknowledgment is the single sign-off —
// when this panel is embedded in MeetingSession it replaces the meeting's own
// signature block.
//
// Props:
//   cycle      — { id, tenant_id, staff_id, evaluator_id }
//   phase      — 'initial' | 'mid_year' | 'final'
//   profile    — current user's profile ({ id, ... })
//   isAdmin, isHR — role flags (HR/admin can act on either side)
//   meetingId  — optional; stamped onto the row on first evaluator save
//   onChange   — optional callback(row) after any successful write
// ============================================================

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EvaluationFeedbackPanel({
  cycle,
  phase,
  profile,
  isAdmin = false,
  isHR = false,
  meetingId = null,
  onChange,
}) {
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [evalText, setEvalText] = useState('')
  const [staffText, setStaffText] = useState('')
  const [editingEval, setEditingEval] = useState(false)

  const meta = FEEDBACK_PHASES[phase] || {}
  const ownView = profile?.id === cycle?.staff_id
  const canEvaluate = isAdmin || isHR || cycle?.evaluator_id === profile?.id
  const canRespond = ownView || isAdmin || isHR

  useEffect(() => {
    if (cycle?.id && phase) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle?.id, phase])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('evaluation_feedback')
      .select('*')
      .eq('cycle_id', cycle.id)
      .eq('phase', phase)
      .maybeSingle()
    setRow(data || null)
    setEvalText(data?.evaluator_text || '')
    setStaffText(data?.staff_response || '')
    setEditingEval(!data?.evaluator_signed_at)
    setLoading(false)
  }

  // Insert the row if it doesn't exist yet, otherwise update it.
  const persist = async (patch) => {
    setSaving(true)
    let result
    if (row?.id) {
      result = await supabase
        .from('evaluation_feedback')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('evaluation_feedback')
        .insert({
          tenant_id: cycle.tenant_id,
          cycle_id: cycle.id,
          phase,
          meeting_id: meetingId,
          ...patch,
        })
        .select()
        .single()
    }
    setSaving(false)
    if (result.error) {
      alert(`Could not save feedback: ${result.error.message}`)
      return null
    }
    setRow(result.data)
    if (onChange) onChange(result.data)
    return result.data
  }

  const saveEvaluator = async (sign) => {
    const patch = { evaluator_text: evalText }
    if (meetingId && !row?.meeting_id) patch.meeting_id = meetingId
    if (sign) patch.evaluator_signed_at = new Date().toISOString()
    const saved = await persist(patch)
    if (saved && sign) setEditingEval(false)
  }

  const unsignEvaluator = async () => {
    const saved = await persist({ evaluator_signed_at: null })
    if (saved) setEditingEval(true)
  }

  const saveStaff = async (ack) => {
    const patch = { staff_response: staffText }
    if (ack) patch.staff_acknowledged_at = new Date().toISOString()
    await persist(patch)
  }

  const delivered = !!row?.evaluator_signed_at
  const acknowledged = !!row?.staff_acknowledged_at

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 text-sm text-[#666666]">
        Loading {phaseLabel(phase)} feedback…
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 rounded-t-lg">
        <div>
          <h4 className="font-semibold text-[#2c3e7e]">{meta.label || phaseLabel(phase)} Feedback</h4>
          {meta.blurb && <p className="text-xs text-[#666666] mt-0.5">{meta.blurb}</p>}
        </div>
        <div className="flex items-center gap-2">
          {delivered ? (
            <span className="text-[11px] px-2 py-1 rounded bg-green-100 text-green-800 whitespace-nowrap">
              ✓ Delivered {fmtDate(row.evaluator_signed_at)}
            </span>
          ) : (
            <span className="text-[11px] px-2 py-1 rounded bg-gray-200 text-gray-600 whitespace-nowrap">
              Not yet delivered
            </span>
          )}
          {acknowledged && (
            <span className="text-[11px] px-2 py-1 rounded bg-green-100 text-green-800 whitespace-nowrap">
              ✓ Acknowledged {fmtDate(row.staff_acknowledged_at)}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Evaluator side ── */}
        <div>
          <p className="text-xs font-medium text-[#666666] mb-1">Evaluator feedback</p>
          {canEvaluate && editingEval ? (
            <>
              <textarea
                value={evalText}
                onChange={(e) => setEvalText(e.target.value)}
                rows="5"
                placeholder="Write feedback for this phase…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] text-sm"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => saveEvaluator(false)}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-[#666666] text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Save draft
                </button>
                <button
                  onClick={() => saveEvaluator(true)}
                  disabled={saving || !evalText.trim()}
                  className="px-3 py-1.5 rounded-lg bg-[#2c3e7e] text-white text-sm hover:bg-[#1e2a5e] disabled:opacity-50"
                >
                  Sign &amp; deliver
                </button>
              </div>
            </>
          ) : row?.evaluator_text ? (
            <div className="text-sm text-[#444444] whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
              {row.evaluator_text}
              {canEvaluate && (
                <div className="mt-2 flex gap-3">
                  <button onClick={() => setEditingEval(true)} className="text-xs text-[#477fc1] hover:underline">
                    Edit
                  </button>
                  {delivered && (
                    <button onClick={unsignEvaluator} className="text-xs text-[#477fc1] hover:underline">
                      Retract signature
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#666666] italic">No feedback written yet.</p>
          )}
        </div>

        {/* ── Staff side ── */}
        <div>
          <p className="text-xs font-medium text-[#666666] mb-1">Staff response</p>
          {!delivered ? (
            <p className="text-sm text-[#666666] italic">
              {ownView
                ? 'You can respond once your evaluator delivers this feedback.'
                : 'Awaiting delivery before the staff member can respond.'}
            </p>
          ) : canRespond && !acknowledged ? (
            <>
              <textarea
                value={staffText}
                onChange={(e) => setStaffText(e.target.value)}
                rows="4"
                placeholder="Your response (optional)…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] text-sm"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => saveStaff(false)}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-[#666666] text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Save draft
                </button>
                <button
                  onClick={() => saveStaff(true)}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  Acknowledge &amp; sign off
                </button>
              </div>
            </>
          ) : row?.staff_response ? (
            <div className="text-sm text-[#444444] whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
              {row.staff_response}
            </div>
          ) : (
            <p className="text-sm text-[#666666] italic">
              {acknowledged ? 'Acknowledged with no written response.' : 'No response yet.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
