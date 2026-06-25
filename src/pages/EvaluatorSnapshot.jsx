import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { effectiveEmploymentStatus } from '../lib/employmentStatus'

// ───────────────────────────────────────────────────────────────
// Evaluator Snapshot
// A cohort heatmap that shows an evaluator, at a glance, where each
// of their assigned staff stands against the year's milestones.
// Status is weighted per probationary/permanent track and computed
// live from each staff member's work records. The school year and
// every deadline derive from today's date and roll over each July
// (same rule as Reports.jsx getSchoolYear), so there is no annual
// maintenance.
// ───────────────────────────────────────────────────────────────

const ROLLOVER_MONTH = 6 // 0-indexed: July

// Derive the active school year + milestone due dates from today.
// Dates mirror the seeded task_templates (the cycle system's source
// of truth): Self-Reflection & Goals Oct 16, Initial Meeting Oct 30,
// final Observation May 3, Mid-Year Jan 29, End-of-Year May 28,
// Summative Jun 11.
function getSchoolYear(today = new Date()) {
  const y = today.getFullYear()
  const startYear = today.getMonth() >= ROLLOVER_MONTH ? y : y - 1
  const endYear = startYear + 1
  return {
    startYear,
    endYear,
    label: `${startYear}-${endYear}`,
    winStart: new Date(startYear, 6, 1), // Jul 1 startYear
    winEnd: new Date(endYear, 6, 1),     // Jul 1 endYear
  }
}

// The six milestone phases (track-uniform spine). Observations target
// 3 completed for both tracks; probationary additionally needs a
// formal observation, surfaced in the row detail.
const PHASES = [
  { key: 'self_goals', label: 'Self-Reflection & Goals', short: 'Self-Refl. & Goals', dueM: 10, dueD: 16, yr: 'start', units: 2 },
  { key: 'initial', label: 'Initial Goals Meeting', short: 'Initial Meeting', dueM: 10, dueD: 30, yr: 'start', units: 1 },
  { key: 'obs', label: 'Observations', short: 'Observations', dueM: 5, dueD: 3, yr: 'end', units: 3, isObs: true },
  { key: 'midyear', label: 'Mid-Year Review', short: 'Mid-Year', dueM: 1, dueD: 29, yr: 'end', units: 1 },
  { key: 'endyear', label: 'End-of-Year Review', short: 'End-of-Year', dueM: 5, dueD: 28, yr: 'end', units: 1 },
  { key: 'summative', label: 'Summative', short: 'Summative', dueM: 6, dueD: 11, yr: 'end', units: 1 },
]

function dueDate(p, sy) {
  return new Date(p.yr === 'start' ? sy.startYear : sy.endYear, p.dueM - 1, p.dueD)
}

const DAY = 86400000

// Status of a single phase for a staff member's counts.
function phaseState(p, counts, sy, today) {
  let done = 0
  if (p.key === 'self_goals') done = (counts.self_reflection_done ? 1 : 0) + (counts.goals_approved >= 3 ? 1 : 0)
  else if (p.key === 'initial') done = counts.initial_meeting ? 1 : 0
  else if (p.key === 'obs') done = Math.min(counts.obs_completed, 3)
  else if (p.key === 'midyear') done = counts.midyear_meeting ? 1 : 0
  else if (p.key === 'endyear') done = counts.endyear_meeting ? 1 : 0
  else if (p.key === 'summative') done = counts.summative_done ? 1 : 0

  const total = p.units
  const due = dueDate(p, sy)
  const late = today > due

  let status
  if (done >= total) status = 'done'
  else if (done > 0) status = late ? 'progress-late' : 'progress'
  else if (late) status = 'overdue'
  else status = (due - today) <= 21 * DAY ? 'due-soon' : 'upcoming'

  return { done, total, status, due }
}

// On-track % = completed units ÷ units due so far (today). Ignores
// not-yet-due units so nobody looks "behind" early in the year.
function onTrack(counts, sy, today) {
  let dueU = 0, doneU = 0
  for (const p of PHASES) {
    const st = phaseState(p, counts, sy, today)
    if (today >= st.due) { dueU += st.total; doneU += Math.min(st.done, st.total) }
  }
  return dueU ? Math.round((doneU / dueU) * 100) : null
}

// Tailwind classes per cell status.
const CELL = {
  'done': 'bg-green-100 text-green-700',
  'progress': 'bg-amber-100 text-amber-800',
  'progress-late': 'bg-amber-100 text-amber-800 ring-1 ring-red-400',
  'overdue': 'bg-red-100 text-red-700',
  'due-soon': 'bg-white text-amber-700 ring-1 ring-amber-400',
  'upcoming': 'bg-gray-100 text-gray-400',
}
const DOT = {
  'done': 'bg-green-500',
  'progress': 'bg-amber-500',
  'progress-late': 'bg-amber-500',
  'overdue': 'bg-red-500',
  'due-soon': 'bg-amber-400',
  'upcoming': 'bg-gray-300',
}
const STATUS_LABEL = {
  'done': 'Complete',
  'progress': 'In progress',
  'progress-late': 'In progress (late)',
  'overdue': 'Overdue',
  'due-soon': 'Due soon',
  'upcoming': 'Not yet due',
}

function EvaluatorSnapshot() {
  const { profile, isAdmin, isHR } = useAuth()
  const [loading, setLoading] = useState(true)
  const [selectedEvaluator, setSelectedEvaluator] = useState(null)
  const [trackFilter, setTrackFilter] = useState('all')
  const [expanded, setExpanded] = useState({})
  const [raw, setRaw] = useState({
    staff: [], evaluators: [], observations: [], goals: [],
    selfAssessments: [], meetings: [], summatives: [],
  })

  const canPickEvaluator = isAdmin || isHR
  const sy = useMemo(() => getSchoolYear(), [])
  const today = useMemo(() => new Date(), [])

  useEffect(() => {
    if (profile) fetchData()
  }, [profile])

  const fetchData = async () => {
    setLoading(true)

    // Active staff in the tenant (RLS limits an evaluator to their own caseload).
    const { data: staffData } = await supabase
      .from('profiles')
      .select('id, full_name, evaluator_id, employment_status, hire_date, staff_type, position_type')
      .eq('tenant_id', profile.tenant_id)
      .in('role', ['licensed_staff', 'classified_staff'])
      .eq('is_active', true)
      .order('full_name')

    const staff = staffData || []
    const staffIds = staff.map(s => s.id)

    // Resolve evaluator names from the distinct evaluator_ids on the caseload.
    const evaluatorIds = [...new Set(staff.map(s => s.evaluator_id).filter(Boolean))]
    let evaluators = []
    if (evaluatorIds.length) {
      const { data: evalProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', evaluatorIds)
      const counts = {}
      staff.forEach(s => { if (s.evaluator_id) counts[s.evaluator_id] = (counts[s.evaluator_id] || 0) + 1 })
      evaluators = (evalProfiles || [])
        .map(e => ({ id: e.id, name: e.full_name, count: counts[e.id] || 0 }))
        .sort((a, b) => b.count - a.count)
    }

    const safeIn = staffIds.length ? staffIds : ['00000000-0000-0000-0000-000000000000']

    const [obs, goals, self, meetings, summ] = await Promise.all([
      supabase.from('observations')
        .select('staff_id, status, observation_type, ended_at, scheduled_at, created_at')
        .in('staff_id', safeIn),
      supabase.from('goals')
        .select('staff_id, status, created_at')
        .in('staff_id', safeIn),
      supabase.from('self_assessments')
        .select('staff_id, assessment_type, submitted_at')
        .in('staff_id', safeIn),
      supabase.from('meetings')
        .select('staff_id, meeting_type, status, completed_at, scheduled_at, created_at')
        .in('staff_id', safeIn),
      supabase.from('summative_evaluations')
        .select('staff_id, status, completed_at, created_at')
        .in('staff_id', safeIn),
    ])

    setRaw({
      staff,
      evaluators,
      observations: obs.data || [],
      goals: goals.data || [],
      selfAssessments: self.data || [],
      meetings: meetings.data || [],
      summatives: summ.data || [],
    })

    // Default the selection: the signed-in user if they have a caseload,
    // otherwise the evaluator with the most staff.
    const defaultId = evaluators.find(e => e.id === profile.id)?.id || evaluators[0]?.id || null
    setSelectedEvaluator(prev => prev || defaultId)
    setLoading(false)
  }

  const inWin = (d) => {
    if (!d) return false
    const t = new Date(d).getTime()
    return t >= sy.winStart.getTime() && t < sy.winEnd.getTime()
  }

  // Build per-staff counts for the selected cohort.
  const cohort = useMemo(() => {
    if (!selectedEvaluator) return []
    const mine = raw.staff.filter(s => s.evaluator_id === selectedEvaluator)
    return mine.map(s => {
      const counts = {
        self_reflection_done: raw.selfAssessments.some(x => x.staff_id === s.id && x.assessment_type === 'self_reflection' && inWin(x.submitted_at)),
        goals_approved: raw.goals.filter(x => x.staff_id === s.id && x.status === 'approved' && inWin(x.created_at)).length,
        initial_meeting: raw.meetings.some(x => x.staff_id === s.id && x.meeting_type === 'initial_goals' && x.status === 'completed' && inWin(x.completed_at || x.scheduled_at || x.created_at)),
        midyear_meeting: raw.meetings.some(x => x.staff_id === s.id && x.meeting_type === 'mid_year_review' && x.status === 'completed' && inWin(x.completed_at || x.scheduled_at || x.created_at)),
        endyear_meeting: raw.meetings.some(x => x.staff_id === s.id && x.meeting_type === 'end_of_year_review' && x.status === 'completed' && inWin(x.completed_at || x.scheduled_at || x.created_at)),
        obs_completed: raw.observations.filter(x => x.staff_id === s.id && x.status === 'completed' && inWin(x.ended_at || x.scheduled_at || x.created_at)).length,
        obs_formal: raw.observations.filter(x => x.staff_id === s.id && x.status === 'completed' && x.observation_type === 'formal' && inWin(x.ended_at || x.scheduled_at || x.created_at)).length,
        summative_done: raw.summatives.some(x => x.staff_id === s.id && x.status === 'completed' && inWin(x.completed_at || x.created_at)),
      }
      const track = effectiveEmploymentStatus(s) // 'probationary' | 'permanent' | null
      return { id: s.id, name: s.full_name, position: s.position_type, track, counts }
    })
  }, [selectedEvaluator, raw, sy])

  const visible = cohort.filter(r => trackFilter === 'all' || r.track === trackFilter)

  // Current phase = first milestone whose due date is today or later.
  const curIdx = (() => {
    for (let i = 0; i < PHASES.length; i++) if (dueDate(PHASES[i], sy) >= today) return i
    return PHASES.length - 1
  })()

  // Summary metrics.
  const summary = useMemo(() => {
    let perm = 0, prob = 0, sumPct = 0, n = 0, attn = 0
    visible.forEach(r => {
      if (r.track === 'probationary') prob++; else if (r.track === 'permanent') perm++
      const pct = onTrack(r.counts, sy, today)
      if (pct !== null) { sumPct += pct; n++; if (pct < 60) attn++ }
    })
    return { count: visible.length, perm, prob, avg: n ? Math.round(sumPct / n) : null, attn }
  }, [visible, sy, today])

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const otClass = (pct) => pct === null ? 'text-gray-400'
    : pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600'

  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  // Timeline positions across the school-year window.
  const yStart = sy.winStart.getTime()
  const span = sy.winEnd.getTime() - yStart
  const pos = (t) => 4 + ((t - yStart) / span) * 92
  const todayPos = pos(today.getTime())
  const todayInRange = today.getTime() >= yStart && today.getTime() <= sy.winEnd.getTime()

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3 mb-2">
          <div>
            <h2 className="text-2xl font-bold text-[#2c3e7e]">Evaluator Snapshot</h2>
            <p className="text-[#666666] text-sm">Where each staff member stands this year</p>
          </div>
          <div className="flex items-end gap-3">
            {canPickEvaluator && raw.evaluators.length > 0 && (
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#666666] mb-1">Evaluator</label>
                <select
                  value={selectedEvaluator || ''}
                  onChange={e => setSelectedEvaluator(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[180px]"
                >
                  {raw.evaluators.map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.count})</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#666666] mb-1">Track</label>
              <select
                value={trackFilter}
                onChange={e => setTrackFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="all">All</option>
                <option value="permanent">Permanent</option>
                <option value="probationary">Probationary</option>
              </select>
            </div>
          </div>
        </div>
        <p className="text-[#666666] text-sm mb-5">
          School Year {sy.label} · as of {today.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>

        {/* Timeline */}
        <div className="relative h-14 mb-6 bg-white rounded-lg border border-gray-200">
          <div className="absolute left-[4%] right-[4%] top-[34px] h-[3px] bg-gray-200 rounded" />
          {PHASES.map(p => {
            const x = pos(dueDate(p, sy).getTime())
            return (
              <div key={p.key}>
                <div className="absolute w-2.5 h-2.5 rounded-full bg-[#2c3e7e] border-2 border-white"
                  style={{ left: `${x}%`, top: '29px', transform: 'translateX(-50%)' }} title={p.label} />
                <div className="absolute text-[9px] text-gray-400"
                  style={{ left: `${x}%`, top: '6px', transform: 'translateX(-50%)' }}>
                  {dueDate(p, sy).toLocaleDateString(undefined, { month: 'short' })}
                </div>
              </div>
            )
          })}
          {todayInRange && (
            <div className="absolute w-[2px] bg-red-500" style={{ left: `${todayPos}%`, top: '16px', bottom: '6px', transform: 'translateX(-50%)' }}>
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-500 whitespace-nowrap">TODAY</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-[#666666]">Loading snapshot…</p>
          </div>
        ) : !selectedEvaluator || visible.length === 0 ? (
          <div className="bg-white p-10 rounded-lg shadow text-center text-[#666666]">
            No staff assigned for this view.
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <Card n={summary.count} l="Staff in view" />
              <Card n={`${summary.perm} / ${summary.prob}`} l="Permanent / Probationary" />
              <Card n={summary.avg === null ? '—' : `${summary.avg}%`} l="Avg on-track" />
              <Card n={summary.attn} l="Need attention (<60%)" accent={summary.attn > 0} />
            </div>

            {/* Heatmap */}
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="bg-[#2c3e7e] text-white">
                    <th className="text-left px-4 py-3 font-semibold text-xs sticky left-0 bg-[#2c3e7e]">Staff</th>
                    {PHASES.map((p, i) => (
                      <th key={p.key} className={`px-2 py-3 font-semibold text-[11px] leading-tight ${i === curIdx ? 'bg-[#1e2a5e]' : ''}`}>
                        {p.short}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-semibold text-[11px]">On-track</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map(r => {
                    const pct = onTrack(r.counts, sy, today)
                    return (
                      <FragmentRow
                        key={r.id}
                        r={r} pct={pct} curIdx={curIdx} sy={sy} today={today}
                        expanded={!!expanded[r.id]} onToggle={() => toggle(r.id)}
                        otClass={otClass} fmt={fmt}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 items-center mt-4 text-xs text-[#666666]">
              <Legend cls="bg-green-100" label="Complete" />
              <Legend cls="bg-amber-100" label="In progress" />
              <Legend cls="bg-white ring-1 ring-amber-400" label="Due soon" />
              <Legend cls="bg-red-100" label="Overdue" />
              <Legend cls="bg-gray-100" label="Not yet due" />
              <span className="ml-auto"><b className="text-[#2c3e7e]">On-track%</b> = done ÷ steps due so far</span>
            </div>

            <div className="mt-4 text-xs text-[#666666] bg-[#EEF2FF] border-l-4 border-[#2c3e7e] rounded p-3">
              Status is computed live from each staff member's work records (observations, goals, self-reflections, meetings, summatives)
              against their probationary/permanent track. The school year and all deadlines roll forward automatically each July;
              steps that aren't due yet show grey, not as overdue.
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function FragmentRow({ r, pct, curIdx, sy, today, expanded, onToggle, otClass, fmt }) {
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2.5 font-medium text-[#2c3e7e] whitespace-nowrap sticky left-0 bg-white">
          {r.name}
          <span className={`ml-2 align-middle text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
            r.track === 'probationary' ? 'bg-amber-100 text-amber-800'
              : r.track === 'permanent' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {r.track === 'probationary' ? 'PROB' : r.track === 'permanent' ? 'PERM' : '—'}
          </span>
        </td>
        {PHASES.map((p, i) => {
          const st = phaseState(p, r.counts, sy, today)
          const txt = p.isObs ? `${st.done}/${st.total}`
            : st.status === 'done' ? '✓' : st.done > 0 ? `${st.done}/${st.total}` : ''
          return (
            <td key={p.key} className={`px-2 py-2.5 text-center ${i === curIdx ? 'bg-[#f7f9ff]' : ''}`}>
              <span className={`inline-flex items-center justify-center min-w-[34px] h-6 px-2 rounded-md font-bold text-xs ${CELL[st.status]}`}>
                {txt}
              </span>
            </td>
          )
        })}
        <td className="px-3 py-2.5 text-center">
          <span className={`font-extrabold ${otClass(pct)}`}>{pct === null ? '—' : `${pct}%`}</span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-[#fafbfd]">
          <td colSpan={PHASES.length + 2} className="px-4 py-3">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PHASES.map(p => {
                const st = phaseState(p, r.counts, sy, today)
                let d
                if (p.key === 'self_goals') d = `${r.counts.self_reflection_done ? 'Self-reflection submitted' : 'Self-reflection not submitted'} · ${r.counts.goals_approved >= 3 ? '3+ goals approved' : `${r.counts.goals_approved}/3 goals approved`}`
                else if (p.key === 'obs') d = `${r.counts.obs_completed} of 3 completed${r.track === 'probationary' ? (r.counts.obs_formal > 0 ? ' · formal ✓' : ' · formal observation pending') : ''}`
                else if (p.key === 'initial') d = r.counts.initial_meeting ? 'Meeting completed' : 'Not held'
                else if (p.key === 'midyear') d = r.counts.midyear_meeting ? 'Review completed' : 'Not held'
                else if (p.key === 'endyear') d = r.counts.endyear_meeting ? 'Review completed' : 'Not held'
                else d = r.counts.summative_done ? 'Summative completed' : 'Not completed'
                return (
                  <div key={p.key} className="flex gap-2.5 items-start">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${DOT[st.status]}`} />
                    <div>
                      <div className="text-xs font-bold text-gray-800">{p.label} — {STATUS_LABEL[st.status]}</div>
                      <div className="text-[11px] text-gray-500">{d} · due {fmt(st.due)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Card({ n, l, accent }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 border-l-4 border-[#2c3e7e]">
      <div className={`text-2xl font-extrabold ${accent ? 'text-[#f3843e]' : 'text-[#2c3e7e]'}`}>{n}</div>
      <div className="text-[11px] text-[#666666] uppercase tracking-wide mt-1">{l}</div>
    </div>
  )
}

function Legend({ cls, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-3.5 h-3.5 rounded ${cls}`} />{label}
    </span>
  )
}

export default EvaluatorSnapshot
