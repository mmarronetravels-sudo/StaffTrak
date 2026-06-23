import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { notifyObservationScheduled } from '../services/emailService'
import { pacificInputToUTC } from '../lib/timezone'
import Navbar from '../components/Navbar'
import {
  OBSERVATION_TYPES,
  OBSERVATION_TYPE_ORDER,
  obsTypeLabel,
  obsTypeDot,
  formativeOnlyDefault,
} from '../lib/observationTypes'

// ── Colors + labels per event type (observations from the shared module,
//    plus the meeting event) ─────────────────────────────────────
const dotFor = (type) => (type === 'meeting' ? '#f3843e' : obsTypeDot(type))
const labelFor = (type) => (type === 'meeting' ? 'Meeting' : obsTypeLabel(type))

// Legend: the observation types + meeting.
const LEGEND_TYPES = [...OBSERVATION_TYPE_ORDER, 'meeting']

const MEETING_LABELS = {
  initial_goals: 'Initial Goals Meeting',
  mid_year: 'Mid-Year Review',
  end_year: 'End-of-Year Review',
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── Date helpers (local, no TZ surprises) ───────────────────────
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Build a 6-row (42-cell) grid covering the given month.
function monthGrid(viewDate) {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay()) // back up to the Sunday on/before the 1st
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export default function Calendar() {
  const { profile, isAdmin, isEvaluator } = useAuth()
  const canSchedule = isAdmin || isEvaluator

  const [view, setView] = useState(() => new Date())
  const [events, setEvents] = useState([])
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)

  const [showSchedule, setShowSchedule] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    staff_id: '', observation_type: 'informal', is_formative_only: false,
    scheduled_at: '', location: '', subject_topic: '',
  })

  // Changing the type resets the formative flag to that type's default.
  const setType = (observation_type) =>
    setForm((f) => ({ ...f, observation_type, is_formative_only: formativeOnlyDefault(observation_type) }))

  useEffect(() => {
    if (profile?.id) load()
    // eslint-disable-next-line
  }, [profile])

  const load = async () => {
    setLoading(true)

    // Evaluators/admins see what they run; staff see their own.
    const obsQuery = supabase
      .from('observations')
      .select('id, observation_type, is_formative_only, scheduled_at, status, location, subject_topic, staff:staff_id(full_name), observer:observer_id(full_name)')
    const meetQuery = supabase
      .from('meetings')
      .select('id, meeting_type, scheduled_at, status, completed_at, staff:staff_id(full_name), evaluator:evaluator_id(full_name)')

    if (canSchedule) {
      obsQuery.eq('observer_id', profile.id)
      meetQuery.eq('evaluator_id', profile.id)
    } else {
      obsQuery.eq('staff_id', profile.id)
      meetQuery.eq('staff_id', profile.id)
    }

    const [{ data: obs }, { data: meet }] = await Promise.all([obsQuery, meetQuery])

    const normalized = [
      ...(obs || []).filter(o => o.scheduled_at && o.status !== 'cancelled').map(o => ({
        id: `obs-${o.id}`,
        kind: 'observation',
        type: o.observation_type,
        formativeOnly: o.is_formative_only,
        date: new Date(o.scheduled_at),
        person: canSchedule ? o.staff?.full_name : o.observer?.full_name,
        status: o.status,
        detail: o.subject_topic || o.location || '',
      })),
      ...(meet || []).filter(m => m.scheduled_at && m.status !== 'cancelled').map(m => ({
        id: `meet-${m.id}`,
        kind: 'meeting',
        type: 'meeting',
        subtype: m.meeting_type,
        date: new Date(m.scheduled_at),
        person: canSchedule ? m.staff?.full_name : m.evaluator?.full_name,
        status: m.completed_at ? 'completed' : (m.status || 'scheduled'),
        detail: MEETING_LABELS[m.meeting_type] || m.meeting_type,
      })),
    ].sort((a, b) => a.date - b.date)

    setEvents(normalized)

    if (canSchedule) {
      const { data: staff } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('tenant_id', profile.tenant_id)
        .in('role', ['licensed_staff', 'classified_staff'])
        .eq('is_active', true)
        .order('full_name', { ascending: true })
      setStaffList(staff || [])
    }
    setLoading(false)
  }

  const eventsOn = (day) => events.filter(e => sameDay(e.date, day))

  const openSchedule = (day) => {
    if (!canSchedule) return
    setForm({
      staff_id: '', observation_type: 'informal', is_formative_only: formativeOnlyDefault('informal'),
      scheduled_at: `${ymd(day)}T09:00`,
      location: '', subject_topic: '',
    })
    setShowSchedule(true)
  }

  const saveObservation = async (e) => {
    e.preventDefault()
    if (!form.staff_id || !form.scheduled_at) return
    setSaving(true)
    const { data, error } = await supabase
      .from('observations')
      .insert([{
        observer_id: profile.id,
        staff_id: form.staff_id,
        observation_type: form.observation_type,
        is_formative_only: form.is_formative_only,
        scheduled_at: pacificInputToUTC(form.scheduled_at),
        location: form.location,
        subject_topic: form.subject_topic,
        status: 'scheduled',
      }])
      .select('id, observation_type, is_formative_only, scheduled_at, status, location, subject_topic, staff:staff_id(full_name, email), observer:observer_id(full_name)')

    if (!error && data) {
      const o = data[0]
      setEvents(prev => [...prev, {
        id: `obs-${o.id}`, kind: 'observation', type: o.observation_type,
        formativeOnly: o.is_formative_only,
        date: new Date(o.scheduled_at), person: o.staff?.full_name,
        status: o.status, detail: o.subject_topic || o.location || '',
      }].sort((a, b) => a.date - b.date))
      setShowSchedule(false)

      // Best-effort email; don't block on failure.
      if (o.staff?.email) {
        try {
          await notifyObservationScheduled({
            staffEmail: o.staff.email,
            staffName: o.staff.full_name,
            observerName: o.observer?.full_name,
            date: new Date(o.scheduled_at).toLocaleDateString(),
            type: obsTypeLabel(o.observation_type),
          })
        } catch { /* ignore */ }
      }
    } else if (error) {
      alert(`Could not schedule: ${error.message}`)
    }
    setSaving(false)
  }

  const today = new Date()
  const grid = monthGrid(view)
  const upcoming = events.filter(e => e.date >= new Date(today.getFullYear(), today.getMonth(), today.getDate()))

  const goMonth = (delta) => setView(new Date(view.getFullYear(), view.getMonth() + delta, 1))

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#2c3e7e]">Calendar</h2>
            <p className="text-[#666666]">
              {canSchedule ? 'Your observations and meetings. Click a day to schedule an observation.' : 'Your scheduled observations and meetings.'}
            </p>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-xs text-[#666666]">
            {LEGEND_TYPES.map(k => (
              <span key={k} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: dotFor(k) }} />
                {labelFor(k)}
              </span>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#666666]">Loading...</p>
          </div>
        ) : (
          <>
            {/* ── Month grid ── */}
            <div className="bg-white rounded-lg shadow mb-8">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-[#2c3e7e]">{MONTHS[view.getMonth()]} {view.getFullYear()}</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => goMonth(-1)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">‹</button>
                  <button onClick={() => setView(new Date())} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Today</button>
                  <button onClick={() => goMonth(1)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">›</button>
                </div>
              </div>

              <div className="grid grid-cols-7 text-center text-xs font-medium text-[#666666] border-b border-gray-100">
                {WEEKDAYS.map(d => <div key={d} className="py-2">{d}</div>)}
              </div>

              <div className="grid grid-cols-7">
                {grid.map((day, i) => {
                  const inMonth = day.getMonth() === view.getMonth()
                  const dayEvents = eventsOn(day)
                  const isToday = sameDay(day, today)
                  return (
                    <div
                      key={i}
                      onClick={() => openSchedule(day)}
                      className={`min-h-[92px] border-b border-r border-gray-100 p-1.5 text-left align-top ${
                        inMonth ? 'bg-white' : 'bg-gray-50'
                      } ${canSchedule ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                    >
                      <div className={`text-xs mb-1 inline-flex items-center justify-center w-5 h-5 rounded-full ${
                        isToday ? 'bg-[#2c3e7e] text-white' : inMonth ? 'text-gray-700' : 'text-gray-400'
                      }`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map(e => (
                          <div key={e.id} className="flex items-center gap-1 text-[11px] truncate">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotFor(e.type) }} />
                            <span className="truncate text-gray-700">{e.person || labelFor(e.type)}</span>
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-gray-400">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Agenda list ── */}
            <h3 className="text-lg font-semibold text-[#2c3e7e] mb-3">Upcoming</h3>
            {upcoming.length === 0 ? (
              <div className="bg-white p-6 rounded-lg shadow text-center text-[#666666]">Nothing scheduled ahead.</div>
            ) : (
              <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
                {upcoming.map(e => (
                  <div key={e.id} className="flex items-center gap-3 p-4">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: dotFor(e.type) }} />
                    <div className="w-28 shrink-0 text-sm text-[#2c3e7e] font-medium">
                      {e.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      <span className="block text-xs text-[#666666] font-normal">
                        {e.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">
                        <span className="font-medium">{e.kind === 'meeting' ? (MEETING_LABELS[e.subtype] || 'Meeting') : labelFor(e.type)}</span>
                        {e.person && <span className="text-[#666666]"> · {e.person}</span>}
                        {e.kind === 'observation' && e.formativeOnly && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 align-middle">Formative</span>
                        )}
                      </p>
                      {e.detail && <p className="text-xs text-[#666666] truncate">{e.detail}</p>}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded shrink-0 ${
                      e.status === 'completed' ? 'bg-green-100 text-green-800'
                      : e.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800'
                      : e.status === 'cancelled' ? 'bg-red-100 text-red-700'
                      : 'bg-blue-100 text-blue-800'
                    }`}>
                      {e.status === 'in_progress' ? 'In progress' : e.status?.charAt(0).toUpperCase() + e.status?.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Schedule observation modal ── */}
      {showSchedule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <form onSubmit={saveObservation} className="p-6">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-xl font-bold text-[#2c3e7e]">Schedule Observation</h3>
                <button type="button" onClick={() => setShowSchedule(false)} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Staff Member *</label>
                  <select
                    value={form.staff_id}
                    onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    required
                  >
                    <option value="">Select staff…</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Type *</label>
                  <select
                    value={form.observation_type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  >
                    {OBSERVATION_TYPE_ORDER.map(t => (
                      <option key={t} value={t}>{OBSERVATION_TYPES[t].label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-[#666666] mt-1">{OBSERVATION_TYPES[form.observation_type]?.blurb}</p>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_formative_only}
                      onChange={(e) => setForm({ ...form, is_formative_only: e.target.checked })}
                      className="rounded text-[#477fc1]"
                    />
                    <span className="text-sm text-[#666666]">
                      Formative only <span className="text-gray-400">— evidence for growth, not counted in the summative score</span>
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={form.scheduled_at}
                    onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Subject / Topic</label>
                  <input
                    type="text"
                    value={form.subject_topic}
                    onChange={(e) => setForm({ ...form, subject_topic: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    placeholder="e.g. Algebra I — Period 3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Location</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    placeholder="e.g. Room 12 / Zoom"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setShowSchedule(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving || !form.staff_id} className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50">
                  {saving ? 'Scheduling…' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
