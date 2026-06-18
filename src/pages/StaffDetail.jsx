import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import AnecdotalNotesPanel from '../components/AnecdotalNotesPanel'
import SignOffBlock from '../components/SignOffBlock'

// ============================================================
// StaffDetail — per-staff hub (/staff/:id)
// ------------------------------------------------------------
// Reached from the dashboard "My Staff" list and the Staff Directory.
// Shows the staff member's profile, quick links to their evaluation work,
// and the evaluator-private Anecdotal Notes log.
// ============================================================

const GOAL_STATUS = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-600' },
  submitted: { label: 'Submitted', cls: 'bg-blue-100 text-blue-700' },
  revision_requested: { label: 'Revision Requested', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  in_progress: { label: 'In Progress', cls: 'bg-indigo-100 text-indigo-700' },
  completed: { label: 'Completed', cls: 'bg-teal-100 text-teal-700' },
}

function goalStatusBadge(status) {
  const s = GOAL_STATUS[status] || { label: status || '—', cls: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>{s.label}</span>
}

function fmtShort(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

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
  const [goals, setGoals] = useState([])
  const [goalsLoading, setGoalsLoading] = useState(true)
  const [expandedGoalId, setExpandedGoalId] = useState(null)
  const [account, setAccount] = useState(null) // {status:'active'|'pending'|'none', last_sign_in_at}
  const [accountLoading, setAccountLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (id) {
      load()
      loadGoals()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Load account status once we know the staff member's email (avoids a race
  // with the profile fetch).
  useEffect(() => {
    if (staff?.email) loadAccount(staff.email)
  }, [staff?.email])

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

  // All of this staff member's goals, every status (evaluator/admin read view, #16).
  const loadGoals = async () => {
    setGoalsLoading(true)
    const { data, error } = await supabase
      .from('goals')
      .select('id, title, goal_type, status, final_score, created_at, approved_at, staff_signed_at, evaluator_signed_at')
      .eq('staff_id', id)
      .order('created_at', { ascending: false })
    if (error) console.error('goals load error', error)
    setGoals(data || [])
    setGoalsLoading(false)
  }

  const canInvite = !!profile && (profile.role === 'district_admin' || isHR)

  // Account-activation status comes from the staff-login-status function
  // (service-role; the client can't read auth.users). We match on email.
  const loadAccount = async (email) => {
    setAccountLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('staff-login-status')
      if (error) throw error
      const mine = (data?.statuses || []).find(
        (x) => (x.email || '').toLowerCase() === (email || '').toLowerCase()
      )
      if (!mine || !mine.exists) setAccount({ status: 'none' })
      else if (mine.last_sign_in_at) setAccount({ status: 'active', last_sign_in_at: mine.last_sign_in_at })
      else setAccount({ status: 'pending' })
    } catch {
      setAccount(null) // unknown (e.g. caller lacks permission)
    }
    setAccountLoading(false)
  }

  const handleInvite = async () => {
    setInviting(true)
    setInviteMsg(null)
    const { data, error } = await supabase.functions.invoke('invite-staff', {
      body: { staffId: id, redirectTo: `${window.location.origin}/set-password` },
    })
    setInviting(false)
    if (error) {
      setInviteMsg({ type: 'err', text: error.message || 'Invite failed.' })
      return
    }
    if (data?.status === 'invited') setInviteMsg({ type: 'ok', text: 'Invite email sent.' })
    else if (data?.status === 'pending') setInviteMsg({ type: 'ok', text: 'Already invited — pending sign-in.' })
    else if (data?.status === 'active') setInviteMsg({ type: 'ok', text: 'This account is already active.' })
    else if (data?.error) setInviteMsg({ type: 'err', text: data.error })
    if (staff?.email) loadAccount(staff.email)
  }

  const handleResend = async () => {
    if (!staff?.email) return
    setInviting(true)
    setInviteMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(staff.email, {
      redirectTo: `${window.location.origin}/set-password`,
    })
    setInviting(false)
    setInviteMsg(
      error ? { type: 'err', text: error.message } : { type: 'ok', text: 'Set-password email re-sent.' }
    )
  }

  // Whoever is viewing may sign the evaluator side if they are this staff
  // member's evaluator, or HR/admin. The sign_goal RPC (029) re-checks this
  // server-side, so this only governs whether the control is shown.
  const canEvaluatorSign =
    !!profile && (isAdmin || isHR || (staff && staff.evaluator_id === profile.id))

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

            {/* Account access (invite / activation status) */}
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <h5 className="font-semibold text-[#2c3e7e] mb-3">Account access</h5>
              {accountLoading ? (
                <p className="text-sm text-[#999999]">Checking…</p>
              ) : account === null ? (
                <p className="text-sm text-[#999999]">Account status unavailable.</p>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm">
                    {account.status === 'active' && (
                      <span className="text-green-700 font-medium">
                        ✓ Active{account.last_sign_in_at ? ` · last sign-in ${fmtShort(account.last_sign_in_at)}` : ''}
                      </span>
                    )}
                    {account.status === 'pending' && (
                      <span className="text-amber-700 font-medium">Invited — awaiting first sign-in</span>
                    )}
                    {account.status === 'none' && (
                      <span className="text-[#999999]">No account yet — staff can use Google sign-in, or send a password invite.</span>
                    )}
                  </div>
                  {canInvite && (
                    <div className="flex gap-2">
                      {account.status === 'none' && (
                        <button
                          onClick={handleInvite}
                          disabled={inviting}
                          className="px-3 py-1.5 bg-[#2c3e7e] text-white rounded-lg text-sm hover:bg-[#1e2d5b] disabled:opacity-50"
                        >
                          {inviting ? 'Sending…' : 'Send invite'}
                        </button>
                      )}
                      {account.status === 'pending' && (
                        <button
                          onClick={handleResend}
                          disabled={inviting}
                          className="px-3 py-1.5 border border-[#2c3e7e] text-[#2c3e7e] rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                        >
                          {inviting ? 'Sending…' : 'Resend invite'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {inviteMsg && (
                <p className={`text-sm mt-3 ${inviteMsg.type === 'err' ? 'text-red-600' : 'text-green-700'}`}>
                  {inviteMsg.text}
                </p>
              )}
            </div>

            {/* Goals — all statuses (read-only) */}
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-semibold text-[#2c3e7e]">Goals</h5>
                <a href="/goal-approvals" className="text-xs text-[#477fc1] hover:underline">Goal Approvals →</a>
              </div>
              {goalsLoading ? (
                <p className="text-sm text-[#999999]">Loading…</p>
              ) : goals.length === 0 ? (
                <p className="text-sm text-[#999999]">No goals yet for this staff member.</p>
              ) : (
                <ul className="space-y-2">
                  {goals.map(g => {
                    const signable = canEvaluatorSign && g.status !== 'draft'
                    const expanded = expandedGoalId === g.id
                    return (
                    <li key={g.id} className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-[#2c3e7e] truncate">{g.title || 'Untitled goal'}</p>
                          <p className="text-xs text-[#999999] capitalize">
                            {g.goal_type?.replace(/_/g, ' ') || 'Goal'}
                            {g.status === 'completed' && g.final_score != null ? ` · Final score ${g.final_score}` : ''}
                            {g.approved_at ? ` · Approved ${fmtShort(g.approved_at)}` : ` · Created ${fmtShort(g.created_at)}`}
                          </p>
                          <p className="text-[11px] mt-1">
                            <span className={g.evaluator_signed_at ? 'text-green-700' : 'text-[#999999]'}>
                              {g.evaluator_signed_at ? `✓ You signed ${fmtShort(g.evaluator_signed_at)}` : 'Evaluator not signed'}
                            </span>
                            <span className="text-[#cccccc]"> · </span>
                            <span className={g.staff_signed_at ? 'text-green-700' : 'text-[#999999]'}>
                              {g.staff_signed_at ? `Staff signed ${fmtShort(g.staff_signed_at)}` : 'Staff not signed'}
                            </span>
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {goalStatusBadge(g.status)}
                          {signable && (
                            <button
                              onClick={() => setExpandedGoalId(expanded ? null : g.id)}
                              className="text-xs text-[#477fc1] hover:underline"
                            >
                              {expanded ? 'Hide sign-off' : (g.evaluator_signed_at ? 'Manage sign-off' : 'Sign-off')}
                            </button>
                          )}
                        </div>
                      </div>
                      {signable && expanded && (
                        <div className="mt-3">
                          <SignOffBlock
                            table="goals"
                            row={g}
                            canStaffSign={false}
                            canEvaluatorSign={true}
                            onChange={(updated) =>
                              setGoals(prev => prev.map(x => (x.id === updated.id ? { ...x, ...updated } : x)))
                            }
                          />
                        </div>
                      )}
                    </li>
                    )
                  })}
                </ul>
              )}
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
