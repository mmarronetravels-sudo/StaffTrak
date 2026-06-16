import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { loadRubricForStaff } from '../lib/evidenceRubric'
import { obsTypeLabel } from '../lib/observationTypes'

// 1-4 rating labels — same scale as the summative / observation ratings.
const RATING_LABEL = { 1: 'Needs Improvement', 2: 'Developing', 3: 'Effective', 4: 'Highly Effective' }
const ratingColor = (r) =>
  r >= 4 ? 'bg-green-100 text-green-800'
  : r >= 3 ? 'bg-blue-100 text-blue-800'
  : r >= 2 ? 'bg-yellow-100 text-yellow-800'
  : 'bg-red-100 text-red-800'

const fmtDate = (d) =>
  d ? new Date(d.length <= 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

const NOTE_ICON = { strength: '💪', growth_area: '🌱', question: '❓', general: '📝' }

const EMPTY_FORM = { evidence_type: 'note', title: '', description: '', url: '', occurred_on: '', is_formative_only: false }

/**
 * Body of evidence for one staff member, organized by rubric domain → indicator.
 * Aggregates observation ratings + tagged observation notes + standalone
 * evidence items. `canContribute` gates adding/editing standalone items.
 */
export default function EvidenceBinder({ staffId, viewer, canContribute }) {
  const [staff, setStaff] = useState(null)
  const [cycle, setCycle] = useState(null)
  const [domains, setDomains] = useState([])
  const [standards, setStandards] = useState([])
  const [obsById, setObsById] = useState({})
  const [notes, setNotes] = useState([])     // { id, note_text, note_type, observation_id, standardIds:[] }
  const [ratings, setRatings] = useState([]) // { standard_id, rating, observation_id }
  const [items, setItems] = useState([])     // evidence_items w/ standardIds
  const [loading, setLoading] = useState(true)

  const [expanded, setExpanded] = useState({})         // standard_id -> bool
  const [addingFor, setAddingFor] = useState(null)     // standard_id currently adding to
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    const { data: staffRow } = await supabase
      .from('profiles')
      .select('id, full_name, staff_type, position_type, assigned_rubric_id, tenant_id')
      .eq('id', staffId)
      .single()
    setStaff(staffRow)

    // Most recent cycle (for header + to attach new items to a cycle).
    const { data: cycleRow } = await supabase
      .from('evaluation_cycles')
      .select('id, school_year, track')
      .eq('staff_id', staffId)
      .order('school_year', { ascending: false })
      .limit(1)
      .maybeSingle()
    setCycle(cycleRow || null)

    const { domains: doms, standards: stds } = await loadRubricForStaff(staffRow)
    setDomains(doms)
    setStandards(stds)

    // Completed observations for this staff.
    const { data: obs } = await supabase
      .from('observations')
      .select('id, observation_type, is_formative_only, scheduled_at')
      .eq('staff_id', staffId)
      .eq('status', 'completed')
    const obsMap = {}
    ;(obs || []).forEach((o) => { obsMap[o.id] = o })
    setObsById(obsMap)
    const obsIds = (obs || []).map((o) => o.id)

    // Observation notes (with their indicator tags) + per-indicator ratings.
    if (obsIds.length) {
      const [{ data: noteRows }, { data: ratingRows }] = await Promise.all([
        supabase
          .from('observation_notes')
          .select('id, note_text, note_type, observation_id, tags:observation_note_tags(standard_id)')
          .in('observation_id', obsIds),
        supabase
          .from('observation_indicator_ratings')
          .select('standard_id, rating, observation_id')
          .in('observation_id', obsIds),
      ])
      setNotes((noteRows || []).map((n) => ({ ...n, standardIds: (n.tags || []).map((t) => t.standard_id) })))
      setRatings(ratingRows || [])
    } else {
      setNotes([])
      setRatings([])
    }

    // Standalone evidence items.
    const { data: itemRows } = await supabase
      .from('evidence_items')
      .select('*, tags:evidence_indicator_tags(id, standard_id)')
      .eq('staff_id', staffId)
      .order('occurred_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    setItems((itemRows || []).map((it) => ({ ...it, standardIds: (it.tags || []).map((t) => t.standard_id) })))

    setLoading(false)
  }, [staffId])

  useEffect(() => { load() }, [load])

  // ── Per-standard slices ──
  const notesFor = (sid) => notes.filter((n) => n.standardIds.includes(sid))
  const ratingsFor = (sid) => ratings.filter((r) => r.standard_id === sid)
  const itemsFor = (sid) => items.filter((it) => it.standardIds.includes(sid))

  // Average rating from SCORED observations only (formative excluded).
  const scoredAvg = (sid) => {
    const scored = ratingsFor(sid).filter((r) => !obsById[r.observation_id]?.is_formative_only)
    if (!scored.length) return null
    return (scored.reduce((a, r) => a + r.rating, 0) / scored.length).toFixed(1)
  }
  const evidenceCount = (sid) => notesFor(sid).length + ratingsFor(sid).length + itemsFor(sid).length

  const domainStandards = (did) => standards.filter((s) => s.domain_id === did)
  const domainCovered = (did) => {
    const stds = domainStandards(did)
    return { covered: stds.filter((s) => evidenceCount(s.id) > 0).length, total: stds.length }
  }

  // ── Add / edit / delete standalone items ──
  const openAdd = (sid) => {
    setAddingFor(sid)
    setForm({ ...EMPTY_FORM, occurred_on: new Date().toISOString().slice(0, 10) })
  }

  const saveAdd = async (sid) => {
    if (!form.title.trim()) return
    setBusy(true)
    const { data: item, error } = await supabase
      .from('evidence_items')
      .insert({
        tenant_id: staff.tenant_id,
        staff_id: staffId,
        cycle_id: cycle?.id || null,
        created_by: viewer.id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        evidence_type: form.evidence_type,
        url: form.evidence_type === 'link' ? (form.url.trim() || null) : null,
        occurred_on: form.occurred_on || null,
        is_formative_only: form.is_formative_only,
      })
      .select('*')
      .single()
    if (error) { alert(`Could not add evidence: ${error.message}`); setBusy(false); return }

    const { error: tagErr } = await supabase
      .from('evidence_indicator_tags')
      .insert({ evidence_item_id: item.id, standard_id: sid })
    if (tagErr) { alert(`Saved item but could not tag it: ${tagErr.message}`) }

    setItems((prev) => [{ ...item, tags: [{ standard_id: sid }], standardIds: [sid] }, ...prev])
    setAddingFor(null)
    setForm(EMPTY_FORM)
    setBusy(false)
  }

  const startEdit = (it) => {
    setEditingId(it.id)
    setEditForm({
      evidence_type: it.evidence_type || 'note',
      title: it.title || '',
      description: it.description || '',
      url: it.url || '',
      occurred_on: it.occurred_on || '',
      is_formative_only: !!it.is_formative_only,
    })
  }

  const saveEdit = async (it) => {
    if (!editForm.title.trim()) return
    setBusy(true)
    const patch = {
      title: editForm.title.trim(),
      description: editForm.description.trim() || null,
      evidence_type: editForm.evidence_type,
      url: editForm.evidence_type === 'link' ? (editForm.url.trim() || null) : null,
      occurred_on: editForm.occurred_on || null,
      is_formative_only: editForm.is_formative_only,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('evidence_items').update(patch).eq('id', it.id)
    if (error) { alert(`Could not save: ${error.message}`); setBusy(false); return }
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, ...patch } : x)))
    setEditingId(null)
    setBusy(false)
  }

  const deleteItem = async (it) => {
    if (!window.confirm('Delete this evidence item? This cannot be undone.')) return
    setBusy(true)
    const { error } = await supabase.from('evidence_items').delete().eq('id', it.id)
    if (error) { alert(`Could not delete: ${error.message}`); setBusy(false); return }
    setItems((prev) => prev.filter((x) => x.id !== it.id))
    setBusy(false)
  }

  const canManageItem = (it) => canContribute && (it.created_by === viewer.id)

  // ── Render ──
  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#666666]">Loading evidence...</p>
      </div>
    )
  }

  if (!domains.length) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center text-[#666666]">
        No rubric found for {staff?.full_name || 'this staff member'} — can’t assemble a body of evidence yet.
      </div>
    )
  }

  const TypeForm = ({ value, onChange }) => (
    <div className="space-y-2">
      <div className="flex gap-2">
        {[['note', '📝 Note'], ['link', '🔗 Link']].map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange({ ...value, evidence_type: v })}
            className={`px-3 py-1 rounded text-sm ${value.evidence_type === v ? 'bg-[#2c3e7e] text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={value.title}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
        placeholder="Title *"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
      />
      <textarea
        value={value.description}
        onChange={(e) => onChange({ ...value, description: e.target.value })}
        placeholder={value.evidence_type === 'link' ? 'Notes about this link (optional)' : 'Describe the evidence'}
        rows="2"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] resize-none"
      />
      {value.evidence_type === 'link' && (
        <input
          type="url"
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          placeholder="https://…"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-[#666666] flex items-center gap-1">
          Date
          <input
            type="date"
            value={value.occurred_on}
            onChange={(e) => onChange({ ...value, occurred_on: e.target.value })}
            className="px-2 py-1 border border-gray-300 rounded text-xs"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[#666666] cursor-pointer">
          <input
            type="checkbox"
            checked={value.is_formative_only}
            onChange={(e) => onChange({ ...value, is_formative_only: e.target.checked })}
            className="rounded text-[#477fc1]"
          />
          Formative only (not scored)
        </label>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-[#2c3e7e]">{staff?.full_name} — Body of Evidence</h3>
            <p className="text-sm text-[#666666]">
              Observation ratings, tagged notes, and added artifacts, organized by rubric indicator.
            </p>
          </div>
          {cycle && (
            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">{cycle.school_year} · {cycle.track}</span>
          )}
        </div>
        <p className="text-xs text-[#666666] mt-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#477fc1] align-middle mr-1" /> Average shown per indicator uses <strong>scored</strong> observations only — formative evidence is shown but excluded.
        </p>
      </div>

      {/* Domains → indicators */}
      {domains.map((domain) => {
        const { covered, total } = domainCovered(domain.id)
        return (
          <div key={domain.id} className="bg-white rounded-lg shadow">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h4 className="font-semibold text-[#2c3e7e]">{domain.name}</h4>
              <span className={`text-xs px-2 py-0.5 rounded ${covered > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {covered}/{total} indicators with evidence
              </span>
            </div>

            <ul className="divide-y divide-gray-100">
              {domainStandards(domain.id).map((std) => {
                const isOpen = expanded[std.id]
                const avg = scoredAvg(std.id)
                const sNotes = notesFor(std.id)
                const sRatings = ratingsFor(std.id)
                const sItems = itemsFor(std.id)
                const count = sNotes.length + sRatings.length + sItems.length
                return (
                  <li key={std.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        onClick={() => setExpanded((e) => ({ ...e, [std.id]: !e[std.id] }))}
                        className="flex-1 text-left"
                      >
                        <span className="font-medium text-[#2c3e7e]"><span className="font-semibold">{std.code}</span> · {std.name}</span>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[#666666]">
                          {avg && (
                            <span className={`px-1.5 py-0.5 rounded ${ratingColor(parseFloat(avg))}`}>Avg {avg}</span>
                          )}
                          <span>{count} {count === 1 ? 'item' : 'items'} of evidence</span>
                          <span className="text-[#477fc1]">{isOpen ? 'Hide ▲' : 'Show ▼'}</span>
                        </div>
                      </button>
                      {canContribute && (
                        <button
                          onClick={() => { setExpanded((e) => ({ ...e, [std.id]: true })); openAdd(std.id) }}
                          className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-[#477fc1] text-white hover:bg-[#3a6ca8]"
                        >
                          + Add
                        </button>
                      )}
                    </div>

                    {isOpen && (
                      <div className="mt-3 space-y-3">
                        {/* Add form */}
                        {addingFor === std.id && (
                          <div className="border border-[#477fc1]/40 rounded-lg p-3 bg-blue-50/40">
                            <TypeForm value={form} onChange={setForm} />
                            <div className="flex gap-2 mt-2">
                              <button onClick={() => setAddingFor(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-[#666666] hover:bg-gray-50">Cancel</button>
                              <button onClick={() => saveAdd(std.id)} disabled={busy || !form.title.trim()} className="px-3 py-1.5 rounded-lg bg-[#2c3e7e] text-white text-sm hover:bg-[#1e2a5e] disabled:opacity-50">{busy ? 'Saving…' : 'Save evidence'}</button>
                            </div>
                          </div>
                        )}

                        {count === 0 && addingFor !== std.id && (
                          <p className="text-sm text-[#666666] italic">No evidence tagged to this indicator yet.</p>
                        )}

                        {/* Observation ratings */}
                        {sRatings.map((r, i) => {
                          const o = obsById[r.observation_id]
                          return (
                            <div key={`r-${r.observation_id}-${i}`} className="flex items-center gap-2 text-sm">
                              <span className="text-base">⭐</span>
                              <span className={`px-1.5 py-0.5 rounded text-xs ${ratingColor(r.rating)}`}>{r.rating} · {RATING_LABEL[r.rating]}</span>
                              <span className="text-[#666666]">{obsTypeLabel(o?.observation_type)} · {fmtDate(o?.scheduled_at)}</span>
                              {o?.is_formative_only && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">formative</span>}
                            </div>
                          )
                        })}

                        {/* Observation notes */}
                        {sNotes.map((n) => {
                          const o = obsById[n.observation_id]
                          return (
                            <div key={`n-${n.id}`} className="text-sm bg-gray-50 rounded p-2">
                              <div className="flex items-center gap-2 text-xs text-[#666666] mb-0.5">
                                <span>{NOTE_ICON[n.note_type] || '📝'} Observation note</span>
                                <span>· {obsTypeLabel(o?.observation_type)} · {fmtDate(o?.scheduled_at)}</span>
                                {o?.is_formative_only && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">formative</span>}
                              </div>
                              <p className="text-[#333] whitespace-pre-wrap">{n.note_text}</p>
                            </div>
                          )
                        })}

                        {/* Standalone items */}
                        {sItems.map((it) => (
                          <div key={`i-${it.id}`} className="text-sm border border-gray-200 rounded p-2">
                            {editingId === it.id ? (
                              <div>
                                <TypeForm value={editForm} onChange={setEditForm} />
                                <div className="flex gap-2 mt-2">
                                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-[#666666] hover:bg-gray-50">Cancel</button>
                                  <button onClick={() => saveEdit(it)} disabled={busy || !editForm.title.trim()} className="px-3 py-1.5 rounded-lg bg-[#2c3e7e] text-white text-sm hover:bg-[#1e2a5e] disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 text-xs text-[#666666] mb-0.5">
                                    <span>{it.evidence_type === 'link' ? '🔗' : '📄'} Added evidence</span>
                                    {it.occurred_on && <span>· {fmtDate(it.occurred_on)}</span>}
                                    {it.is_formative_only && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">formative</span>}
                                  </div>
                                  {canManageItem(it) && (
                                    <div className="flex gap-2 shrink-0">
                                      <button onClick={() => startEdit(it)} className="text-xs text-[#477fc1] hover:underline">Edit</button>
                                      <button onClick={() => deleteItem(it)} className="text-xs text-red-600 hover:underline">Delete</button>
                                    </div>
                                  )}
                                </div>
                                <p className="font-medium text-[#2c3e7e]">{it.title}</p>
                                {it.description && <p className="text-[#666666] whitespace-pre-wrap">{it.description}</p>}
                                {it.evidence_type === 'link' && it.url && (
                                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-[#477fc1] hover:underline break-all text-xs">{it.url}</a>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
