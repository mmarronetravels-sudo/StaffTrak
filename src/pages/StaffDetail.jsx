import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import AnecdotalNotesPanel from '../components/AnecdotalNotesPanel'

// ============================================================
// StaffDetail — per-staff hub (/staff/:id)
// ------------------------------------------------------------
// Reached from the dashboard "My Staff" list and the Staff Directory.
// Shows the staff member's profile, quick links to their evaluation work,
// and the evaluator-private Anecdotal Notes log.
// ============================================================

function calcYears(hireDate) {
  if (!hireDate) return null
  const start = new Date(hireDate)
  const now = new Date()
  let years = now.getFullYear() - start.getFullYear()
  const m = now.getMonth() - start.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < start.getDate())) years--
  return Math.max(years, 0)
}

export default function StaffDetail() {
  const { id } = useParams()
  const { profile, isAdmin, isHR } = useAuth()
  const [staff, setStaff] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, position_type, staff_type, hire_date, is_active, evaluator_id, assigned_rubric_id, years_at_school, evaluator:evaluator_id(full_name)')
      .eq('id', id)
      .maybeSingle()
    if (error) console.error('staff load error', error)
    if (!data) setNotFound(true)
    setStaff(data || null)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <a href="/dashboard" className="text-sm text-[#477fc1] hover:underline">← Back to Dashboard</a>

        {loading ? (
          <p className="text-[#666666] mt-6">Loading…</p>
        ) : notFound || !staff ? (
          <div className="mt-6 bg-white rounded-lg shadow p-6">
            <p className="text-[#666666]">Staff member not found, or you don’t have access.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white rounded-lg shadow p-6 mt-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-[#2c3e7e]">{staff.full_name}</h2>
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                      staff.staff_type === 'licensed'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}
                  >
                    {staff.staff_type === 'licensed' ? 'Licensed Staff' : 'Classified Staff'}
                  </span>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    staff.is_active !== false
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {staff.is_active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-xs text-[#999999]">Email</p>
                  <p className="font-medium text-[#2c3e7e]">{staff.email}</p>
                </div>
                <div>
                  <p className="text-xs text-[#999999]">Position</p>
                  <p className="font-medium text-[#2c3e7e] capitalize">
                    {staff.position_type?.replace(/_/g, ' ') || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#999999]">Hire Date</p>
                  <p className="font-medium text-[#2c3e7e]">
                    {staff.hire_date ? new Date(staff.hire_date).toLocaleDateString() : '—'}
                    {staff.hire_date ? ` · ${calcYears(staff.hire_date)} yr${calcYears(staff.hire_date) !== 1 ? 's' : ''}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#999999]">Evaluator</p>
                  <p className="font-medium text-[#2c3e7e]">{staff.evaluator?.full_name || '—'}</p>
                </div>
              </div>

              {/* Quick links */}
              <div className="pt-4 mt-4 border-t">
                <h5 className="font-semibold text-[#2c3e7e] mb-2">Quick Actions</h5>
                <div className="flex flex-wrap gap-2">
                  <a href={`/observations?staff=${staff.id}`} className="px-3 py-1 bg-gray-100 text-[#666666] rounded hover:bg-gray-200 text-sm">View Observations</a>
                  <a href={`/summatives/${staff.id}`} className="px-3 py-1 bg-gray-100 text-[#666666] rounded hover:bg-gray-200 text-sm">View Evaluation</a>
                  <a href={`/meetings?staff=${staff.id}`} className="px-3 py-1 bg-gray-100 text-[#666666] rounded hover:bg-gray-200 text-sm">View Meetings</a>
                </div>
              </div>
            </div>

            {/* Anecdotal Notes (private evaluator log) */}
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <AnecdotalNotesPanel
                staffId={staff.id}
                staffName={staff.full_name}
                staffEvaluatorId={staff.evaluator_id}
                profile={profile}
                isAdmin={isAdmin}
                isHR={isHR}
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
