import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import EvidenceBinder from '../components/EvidenceBinder'

export default function Evidence() {
  const { profile, isAdmin, isHR } = useAuth()
  const [cycles, setCycles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null) // { staffId, name }

  useEffect(() => {
    if (profile?.id) load()
  }, [profile])

  const load = async () => {
    setLoading(true)
    // RLS scopes this: evaluators get their caseload, HR/admin the tenant.
    const { data } = await supabase
      .from('evaluation_cycles')
      .select('id, school_year, track, staff:staff_id(id, full_name), evaluator:evaluator_id(full_name)')
      .order('school_year', { ascending: false })
      .order('created_at', { ascending: false })
    setCycles(data || [])
    setLoading(false)
  }

  // One row per staff member (latest cycle wins for the label).
  const staffRows = []
  const seen = new Set()
  for (const c of cycles) {
    const sid = c.staff?.id
    if (!sid || seen.has(sid)) continue
    seen.add(sid)
    staffRows.push({ staffId: sid, name: c.staff.full_name, school_year: c.school_year, track: c.track, evaluator: c.evaluator?.full_name })
  }

  const filtered = staffRows.filter((r) =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-[#2c3e7e] mb-1">Body of Evidence</h2>
        <p className="text-[#666666] mb-6">
          {isHR || isAdmin ? 'All staff.' : 'Your caseload.'} Review and add evidence by rubric indicator.
        </p>

        {selected ? (
          <div>
            <button onClick={() => setSelected(null)} className="mb-4 text-sm text-[#477fc1] hover:underline">
              ← Back to all staff
            </button>
            <EvidenceBinder staffId={selected.staffId} viewer={profile} canContribute={true} />
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Search staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full max-w-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
            />
            {loading ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-[#666666]">Loading...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white p-8 rounded-lg shadow text-center text-[#666666]">No staff found.</div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-[#666666]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Staff</th>
                      <th className="px-4 py-3 font-medium">School Year</th>
                      <th className="px-4 py-3 font-medium">Evaluator</th>
                      <th className="px-4 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r) => (
                      <tr key={r.staffId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-[#2c3e7e]">{r.name}</td>
                        <td className="px-4 py-3 text-[#666666]">{r.school_year}</td>
                        <td className="px-4 py-3 text-[#666666]">{r.evaluator || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelected({ staffId: r.staffId, name: r.name })}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[#2c3e7e] text-white hover:bg-[#1e2a5e]"
                          >
                            View evidence
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
