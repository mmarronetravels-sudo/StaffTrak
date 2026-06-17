import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import {
  ACTION_STATUS_ORDER,
  actionStatusLabel,
  actionStatusBadge,
  nextActionStatus,
} from '../lib/actionItems'

// ============================================================
// ActionItemsPanel — Phase 4c #13
// ------------------------------------------------------------
// Growth next-steps for a cycle. Optionally scoped to a single observation
// (observationId) so the evaluator can generate next steps straight from the
// feedback. Each item can link to a goal and a PD reference, carries a status
// (open → in_progress → done) both parties track, plus an optional due date.
//
// Props:
//   cycle         — { id, tenant_id, staff_id, evaluator_id }
//   profile       — current user's profile
//   isAdmin, isHR — role flags
//   observationId — optional; scope the list + new items to one observation
//   onChange      — optional callback() after a successful write
// ============================================================

function fmtDate(d) {
  if (!d) return ''
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function ActionItemsPanel({
  cycle,
  profile,
  isAdmin = false,
  isHR = false,
  observationId = null,
  onChange,
}) {
  const [items, setItems] = useState([])
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ description: '', goal_id: '', pd_reference: '', due_date: '' })

  const canManage =
    isAdmin || isHR || cycle?.evaluator_id === profile?.id || cycle?.staff_id === profile?.id

  useEffect(() => {
    if (cycle?.id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle?.id, observationId])

  const load = async () => {
    setLoading(true)
    let query = supabase
      .from('action_items')
      .select('*')
      .eq('cycle_id', cycle.id)
      .order('created_at', { ascending: true })
    if (observationId) query = query.eq('observation_id', observationId)
    const [{ data: itemRows }, { data: goalRows }] = await Promise.all([
      query,
      supabase.from('goals').select('id, title, goal_type').eq('staff_id', cycle.staff_id),
    ])
    setItems(itemRows || [])
    setGoals(goalRows || [])
    setLoading(false)
  }

  const goalTitle = (id) => goals.find((g) => g.id === id)?.title || 'Goal'

  const addItem = async () => {
    if (!form.description.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('action_items')
      .insert({
        tenant_id: cycle.tenant_id,
        cycle_id: cycle.id,
        observation_id: observationId,
        goal_id: form.goal_id || null,
        pd_reference: form.pd_reference.trim() || null,
        description: form.description.trim(),
        owner_id: cycle.staff_id,
        due_date: form.due_date || null,
        created_by: profile.id,
      })
      .select()
      .single()
    setSaving(false)
    if (error) {
      alert(`Could not add next step: ${error.message}`)
      return
    }
    setItems([...items, data])
    setForm({ description: '', goal_id: '', pd_reference: '', due_date: '' })
    setAdding(false)
    if (onChange) onChange()
  }

  const advanceStatus = async (item) => {
    const next = nextActionStatus(item.status)
    const { data, error } = await supabase
      .from('action_items')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .select()
      .single()
    if (error) {
      alert(`Could not update status: ${error.message}`)
      return
    }
    setItems(items.map((i) => (i.id === item.id ? data : i)))
    if (onChange) onChange()
  }

  const removeItem = async (item) => {
    const { error } = await supabase.from('action_items').delete().eq('id', item.id)
    if (error) {
      alert(`Could not delete: ${error.message}`)
      return
    }
    setItems(items.filter((i) => i.id !== item.id))
    if (onChange) onChange()
  }

  if (loading) {
    return <div className="text-sm text-[#666666]">Loading next steps…</div>
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-[#666666] italic">No next steps yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#2c3e7e]">{item.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#666666]">
                    {item.goal_id && (
                      <span className="px-1.5 py-0.5 rounded bg-[#477fc1] text-white">🎯 {goalTitle(item.goal_id)}</span>
                    )}
                    {item.pd_reference && <span>📚 {item.pd_reference}</span>}
                    {item.due_date && <span>📅 {fmtDate(item.due_date)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => canManage && advanceStatus(item)}
                    disabled={!canManage}
                    title={canManage ? 'Advance status' : actionStatusLabel(item.status)}
                    className={`text-[11px] px-2 py-1 rounded ${actionStatusBadge(item.status)} ${canManage ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                  >
                    {actionStatusLabel(item.status)}
                  </button>
                  {canManage && (
                    <button
                      onClick={() => removeItem(item)}
                      title="Delete"
                      className="text-xs text-gray-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        adding ? (
          <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows="2"
              placeholder="Next step / action…"
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={form.goal_id}
                onChange={(e) => setForm({ ...form, goal_id: e.target.value })}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              >
                <option value="">Link a goal…</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
              <input
                type="text"
                value={form.pd_reference}
                onChange={(e) => setForm({ ...form, pd_reference: e.target.value })}
                placeholder="PD reference…"
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              />
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setAdding(false); setForm({ description: '', goal_id: '', pd_reference: '', due_date: '' }) }}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-[#666666] text-sm hover:bg-white"
              >
                Cancel
              </button>
              <button
                onClick={addItem}
                disabled={saving || !form.description.trim()}
                className="px-3 py-1.5 rounded-lg bg-[#2c3e7e] text-white text-sm hover:bg-[#1e2a5e] disabled:opacity-50"
              >
                Add next step
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-sm text-[#477fc1] hover:underline"
          >
            + Add next step
          </button>
        )
      )}
    </div>
  )
}
