import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import EvaluationChecklist from '../components/EvaluationChecklist'
import { reconcileCycleTasks } from '../lib/reconcileCycleTasks'

export default function Checklists() {
  const { profile, isAdmin, isEvaluator, isHR } = useAuth()
  const [cycles, setCycles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('all')

  const [selected, setSelected] = useState(null)
  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)

  useEffect(() => {
    if (profile?.id) loadCycles()
  }, [profile])

  const loadCycles = async () => {
    setLoading(true)
    // RLS scopes this: evaluators get their caseload, HR/admin get the tenant.
    const { data } = await supabase
      .from('evaluation_cycles')
      .select('*, staff:staff_id(id, full_name), evaluator:evaluator_id(id, full_name)')
      .order('school_year', { ascending: false })
      .order('created_at', { ascending: false })
    setCycles(data || [])
    setLoading(false)
  }

  const openCycle = async (cycle) => {
    setSelected(cycle)
    setTasksLoading(true)
    const { data: rows } = await supabase
      .from('cycle_tasks')
      .select('*')
      .eq('cycle_id', cycle.id)
      .order('sort_order', { ascending: true })
    let list = rows || []
    list = await reconcileCycleTasks(cycle, list, profile.id)
    setTasks(list)
    setTasksLoading(false)
  }

  const years = Array.from(new Set(cycles.map((c) => c.school_year))).sort().reverse()

  const filtered = cycles.filter((c) => {
    if (yearFilter !== 'all' && c.school_year !== yearFilter) return false
    if (search) {
      const hay = `${c.staff?.full_name || ''} ${c.evaluator?.full_name || ''}`.toLowerCase()
      if (!hay.includes(search.toLowerCase())) return false
    }
    return true
  })

  const trackBadge = (track) => {
    const map = {
      probationary: 'bg-[#477fc1] text-white',
      permanent: 'bg-[#2c3e7e] text-white',
      modified: 'bg-purple-500 text-white',
    }
    return map[track] || 'bg-gray-200 text-gray-700'
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-[#2c3e7e] mb-1">Evaluation Checklists</h2>
        <p className="text-[#666666] mb-6">
          {isHR || isAdmin ? 'All staff evaluation cycles.' : 'Your caseload’s evaluation cycles.'}
        </p>

        {selected ? (
          <div>
            <button
              onClick={() => setSelected(null)}
              className="mb-4 text-sm text-[#477fc1] hover:underline"
            >
              ← Back to all cycles
            </button>
            {tasksLoading ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-[#666666]">Loading checklist...</p>
              </div>
            ) : (
              <EvaluationChecklist
                cycle={selected}
                tasks={tasks}
                profile={profile}
                isAdmin={isAdmin}
                isEvaluator={isEvaluator}
                isHR={isHR}
                onTasksChange={setTasks}
              />
            )}
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <input
                type="text"
                placeholder="Search by staff or evaluator…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex-1 min-w-[220px] focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              />
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              >
                <option value="all">All school years</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-[#666666]">Loading...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white p-8 rounded-lg shadow text-center text-[#666666]">
                No evaluation cycles found.
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-[#666666]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Staff</th>
                      <th className="px-4 py-3 font-medium">Track</th>
                      <th className="px-4 py-3 font-medium">School Year</th>
                      <th className="px-4 py-3 font-medium">Evaluator</th>
                      <th className="px-4 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-[#2c3e7e]">{c.staff?.full_name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded capitalize ${trackBadge(c.track)}`}>{c.track}</span>
                        </td>
                        <td className="px-4 py-3 text-[#666666]">{c.school_year}</td>
                        <td className="px-4 py-3 text-[#666666]">{c.evaluator?.full_name || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openCycle(c)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[#2c3e7e] text-white hover:bg-[#1e2a5e]"
                          >
                            View checklist
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
