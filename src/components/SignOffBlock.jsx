import { useState } from 'react'
import { supabase } from '../supabaseClient'

// ============================================================
// SignOffBlock — Banked #1: Signatures / sign-off
// ------------------------------------------------------------
// A two-party signed + dated block, mirroring the signing pattern used by
// EvaluationFeedbackPanel (evaluator_signed_at / staff_acknowledged_at) and the
// Summative (evaluator_signature_at / staff_signature_at). Used to extend that
// pattern to the Self-Reflection (self_assessments) and Goals (goals).
//
// The row must carry `staff_signed_at` and `evaluator_signed_at` columns (added
// in migration 026). Each party signs their own side; the signature stamps the
// corresponding column with the current time.
//
// Props:
//   table            — 'self_assessments' | 'goals' (which table to update)
//   row              — the record: { id, staff_signed_at, evaluator_signed_at }
//                      May be null/undefined before the record exists (e.g. a
//                      self-reflection the staff member hasn't saved yet).
//   canStaffSign     — current user may sign the employee side
//   canEvaluatorSign — current user may sign the evaluator side (evaluator/HR/admin)
//   staffLabel       — display label for the employee row (default 'Employee')
//   evaluatorLabel   — display label for the evaluator row (default 'Evaluator')
//   notReadyText     — message shown when there is no row to sign yet
//   onChange         — optional callback(updatedRow) after a successful sign/undo
// ============================================================

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// One signer's row: label + status, plus a Sign/Undo control when allowed.
function SignatureRow({ label, signedAt, canSign, party, saving, hasRow, onSign, onUndo }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#666666]">{label}</p>
        {signedAt ? (
          <p className="text-sm text-green-700 font-medium">✓ Signed {fmtDate(signedAt)}</p>
        ) : (
          <p className="text-sm text-[#999999] italic">Awaiting signature</p>
        )}
      </div>
      {canSign &&
        (signedAt ? (
          <button
            onClick={() => onUndo(party)}
            disabled={saving}
            className="text-xs text-[#477fc1] hover:underline disabled:opacity-50 whitespace-nowrap"
          >
            Undo
          </button>
        ) : (
          <button
            onClick={() => onSign(party)}
            disabled={saving || !hasRow}
            className="px-3 py-1.5 rounded-lg bg-[#2c3e7e] text-white text-sm hover:bg-[#1e2a5e] disabled:opacity-50 whitespace-nowrap"
          >
            Sign &amp; date
          </button>
        ))}
    </div>
  )
}

export default function SignOffBlock({
  table,
  row,
  canStaffSign = false,
  canEvaluatorSign = false,
  staffLabel = 'Employee',
  evaluatorLabel = 'Evaluator',
  notReadyText = 'Available to sign once this is saved.',
  onChange,
}) {
  const [saving, setSaving] = useState(false)

  // Controlled by the `row` prop — each call site updates its own state from
  // onChange, so the refreshed row flows back down. No mirrored local state.
  const setSignature = async (party, value) => {
    if (!row?.id) return
    setSaving(true)
    let data, error
    if (table === 'goals') {
      // Goal sign-off goes through a SECURITY DEFINER RPC (migration 029): the
      // staff UPDATE policy is draft-only, but signing happens after a goal is
      // finalized. The function stamps only the signature column, choosing the
      // column by the caller's identity (staff vs evaluator/HR).
      ;({ data, error } = await supabase.rpc('sign_goal', {
        p_goal_id: row.id,
        p_unsign: value === null,
      }))
    } else {
      const col = party === 'staff' ? 'staff_signed_at' : 'evaluator_signed_at'
      ;({ data, error } = await supabase
        .from(table)
        .update({ [col]: value })
        .eq('id', row.id)
        .select()
        .single())
    }
    setSaving(false)
    if (error) {
      alert(`Could not update signature: ${error.message}`)
      return
    }
    if (onChange) onChange(data)
  }

  const sign = (party) => setSignature(party, new Date().toISOString())
  const undo = (party) => setSignature(party, null)

  const staffSigned = !!row?.staff_signed_at
  const evalSigned = !!row?.evaluator_signed_at

  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 rounded-t-lg">
        <h4 className="font-semibold text-[#2c3e7e] text-sm">Signatures</h4>
      </div>
      <div className="px-4 divide-y divide-gray-100">
        {!row?.id && (
          <p className="text-sm text-[#666666] italic py-3">{notReadyText}</p>
        )}
        {row?.id && (
          <>
            <SignatureRow
              label={staffLabel}
              signedAt={row?.staff_signed_at}
              canSign={canStaffSign}
              party="staff"
              saving={saving}
              hasRow={!!row?.id}
              onSign={sign}
              onUndo={undo}
            />
            <SignatureRow
              label={evaluatorLabel}
              signedAt={row?.evaluator_signed_at}
              canSign={canEvaluatorSign}
              party="evaluator"
              saving={saving}
              hasRow={!!row?.id}
              onSign={sign}
              onUndo={undo}
            />
          </>
        )}
      </div>
      {row?.id && staffSigned && evalSigned && (
        <div className="px-4 py-2 text-[11px] text-[#666666] border-t border-gray-100">
          A signature acknowledges the document was reviewed; it does not
          necessarily indicate agreement.
        </div>
      )}
    </div>
  )
}
