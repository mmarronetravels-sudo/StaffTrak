import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

// ============================================================
// AnecdotalNotesPanel — Banked #2
// ------------------------------------------------------------
// An evaluator's running log of anecdotal observations about a staff member,
// not tied to a formal/informal observation. PRIVATE: the subject staff member
// cannot read these (enforced by anecdotal_notes RLS, migration 030). Surfaced
// in the Staff roster "View" modal.
//
// Props:
//   staffId          — subject profile id (required)
//   staffName        — for the empty-state copy
//   staffEvaluatorId — the subject's profiles.evaluator_id (for canManage)
//   profile          — current user's profile ({ id, tenant_id, ... })
//   isAdmin, isHR    — role flags; admins/HR can manage any note
// ============================================================

function fmtDate(d) {
  if (!d) return ''
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const today = () => new Date().toISOString().slice(0, 10)

export default function AnecdotalNotesPanel({
  staffId,
  staffName = 'this staff member',
  staffEvaluatorId = null,
  profile,
  isAdmin = false,
  isHR = false,
}) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ note: '', occurred_on: today() })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ note: '', occurred_on: '' })

  const canManage = isAdmin || isHR || staffEvaluatorId === profile?.id

  useEffect(() => {
    if (staffId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId])

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data, error: loadErr } = await supabase
      .from('anecdotal_notes')
      .select('id, note, occurred_on, created_at, created_by, author:created_by(full_name)')
      .eq('staff_id', staffId)
      .order('occurred_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (loadErr) {
      console.error('anecdotal_notes load error', loadErr)
      setError('Could not load notes.')
      setNotes([])
    } else {
      setNotes(data || [])
    }
    setLoading(false)
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.note.trim()) return
    setSaving(true)
    setError(null)
    const { error: insErr } = await supabase.from('anecdotal_notes').insert({
      tenant_id: profile.tenant_id,
      staff_id: staffId,
      created_by: profile.id,
      note: form.note.trim(),
      occurred_on: form.occurred_on || null,
    })
    setSaving(false)
    if (insErr) {
      console.error('anecdotal_notes insert error', insErr)
      setError('Could not save note. You may not be the evaluator for this staff member.')
      return
    }
    setForm({ note: '', occurred_on: today() })
    load()
  }

  const startEdit = (n) => {
    setEditingId(n.id)
    setEditForm({ note: n.note, occurred_on: n.occurred_on || '' })
  }

  const handleSaveEdit = async (id) => {
    if (!editForm.note.trim()) return
    setSaving(true)
    setError(null)
    const { error: updErr } = await supabase
      .from('anecdotal_notes')
      .update({
        note: editForm.note.trim(),
        occurred_on: editForm.occurred_on || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    setSaving(false)
    if (updErr) {
      console.error('anecdotal_notes update error', updErr)
      setError('Could not update note.')
      return
    }
    setEditingId(null)
    load()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this note? This cannot be undone.')) return
    setError(null)
    const { error: delErr } = await supabase.from('anecdotal_notes').delete().eq('id', id)
    if (delErr) {
      console.error('anecdotal_notes delete error', delErr)
      setError('Could not delete note.')
      return
    }
    load()
  }

  return (
    <div className="pt-4 border-t">
      <div className="flex items-center justify-between mb-2">
        <h5 className="font-semibold text-[#2c3e7e]">Anecdotal Notes</h5>
        <span className="text-xs text-[#999999]">Private — not visible to staff</span>
      </div>

      {error && (
        <div className="mb-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      {/* Add form */}
      {canManage && (
        <form onSubmit={handleAdd} className="mb-3 space-y-2">
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder={`Log an observation about ${staffName}…`}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#666666]">Date</label>
            <input
              type="date"
              value={form.occurred_on}
              onChange={(e) => setForm({ ...form, occurred_on: e.target.value })}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            />
            <div className="flex-1" />
            <button
              type="submit"
              disabled={saving || !form.note.trim()}
              className="px-3 py-1.5 bg-[#f3843e] text-white rounded-lg text-sm hover:bg-[#dd6f2c] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add note'}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <p className="text-sm text-[#999999]">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-[#999999]">
          {canManage ? 'No notes yet.' : 'No notes, or you do not have access to this log.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => {
            const mine = n.created_by === profile?.id
            const canEdit = mine || isAdmin || isHR
            return (
              <li key={n.id} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                {editingId === n.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editForm.note}
                      onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                      rows={2}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={editForm.occurred_on}
                        onChange={(e) => setEditForm({ ...editForm, occurred_on: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                      <div className="flex-1" />
                      <button
                        onClick={() => handleSaveEdit(n.id)}
                        disabled={saving}
                        className="px-2.5 py-1 bg-[#2c3e7e] text-white rounded text-xs hover:bg-[#1e2a5e] disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2.5 py-1 border border-gray-300 rounded text-xs text-[#666666] hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-[#333333] whitespace-pre-wrap">{n.note}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-[#999999]">
                        {fmtDate(n.occurred_on) || fmtDate(n.created_at?.slice(0, 10))}
                        {n.author?.full_name ? ` · ${n.author.full_name}` : ''}
                      </span>
                      {canEdit && (
                        <span className="flex gap-2">
                          <button
                            onClick={() => startEdit(n)}
                            className="text-xs text-[#477fc1] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(n.id)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
