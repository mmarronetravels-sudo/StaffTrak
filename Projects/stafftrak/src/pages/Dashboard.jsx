import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

function Dashboard() {
  const { user, profile, signOut, isAdmin, isEvaluator, isStaff } = useAuth()
  const [tenant, setTenant] = useState(null)
  const [stats, setStats] = useState({
    staffAssigned: 0,
    observationsDue: 0,
    overdueItems: 0,
    pendingGoals: 0,
    upcomingMeetings: 0,
    pendingSignatures: 0
  })
  const [upcomingObservations, setUpcomingObservations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.tenant_id) {
      fetchTenant()
      fetchStats()
    }
  }, [profile])

  const fetchTenant = async () => {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', profile.tenant_id)
      .single()

    if (!error) {
      setTenant(data)
    }
  }

  const fetchStats = async () => {
    setLoading(true)
    
    if (isAdmin || isEvaluator) {
      // Evaluator/Admin stats
      const { data: assignedStaff } = await supabase
        .from('profiles')
        .select('id')
        .eq('evaluator_id', profile.id)
        .eq('is_active', true)

      const { data: observations } = await supabase
        .from('observations')
        .select('*')
        .eq('observer_id', profile.id)
        .in('status', ['scheduled', 'in_progress'])

      const { data: pendingGoals } = await supabase
        .from('goals')
        .select('*, profiles!goals_staff_id_fkey(evaluator_id)')
        .eq('status', 'submitted')

      const pendingForMe = pendingGoals?.filter(g => g.profiles?.evaluator_id === profile.id) || []

      const { data: upcomingObs } = await supabase
        .from('observations')
        .select('*, profiles!observations_staff_id_fkey(full_name)')
        .eq('observer_id', profile.id)
        .eq('status', 'scheduled')
        .order('scheduled_at', { ascending: true })
        .limit(5)

      setUpcomingObservations(upcomingObs || [])

      setStats({
        staffAssigned: assignedStaff?.length || 0,
        observationsDue: observations?.length || 0,
        overdueItems: 0, // Would need to calculate based on deadlines
        pendingGoals: pendingForMe.length,
        upcomingMeetings: 0,
        pendingSignatures: 0
      })
    } else {
      // Staff stats
      const { data: myGoals } = await supabase
        .from('goals')
        .select('*')
        .eq('staff_id', profile.id)

      const { data: myObservations } = await supabase
        .from('observations')
        .select('*')
        .eq('staff_id', profile.id)
        .in('status', ['scheduled', 'in_progress'])

      const { data: myEvaluation } = await supabase
        .from('summative_evaluations')
        .select('*')
        .eq('staff_id', profile.id)
        .eq('status', 'pending_staff_signature')
        .single()

      setStats({
        staffAssigned: 0,
        observationsDue: myObservations?.length || 0,
        overdueItems: 0,
        pendingGoals: myGoals?.filter(g => g.status === 'draft').length || 0,
        upcomingMeetings: 0,
        pendingSignatures: myEvaluation ? 1 : 0
      })
    }
    
    setLoading(false)
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  // Navigation items based on role
  const getNavItems = () => {
    if (isAdmin || isEvaluator) {
      return [
        { href: '/dashboard', label: 'Dashboard', active: true },
        { href: '/staff', label: 'Staff' },
        { href: '/observations', label: 'Observations' },
        { href: '/meetings', label: 'Meetings' },
        { href: '/summatives', label: 'Summatives' },
        { href: '/reports', label: 'Reports' },
        { href: '/goal-approvals', label: 'Goal Approvals' }
      ]
    }
    return [
      { href: '/dashboard', label: 'Dashboard', active: true },
      { href: '/goals', label: 'My Goals' },
      { href: '/self-reflection', label: 'Self-Reflection' },
      { href: '/my-observations', label: 'My Observations' },
      { href: '/my-meetings', label: 'My Meetings' },
      { href: '/my-summative', label: 'My Evaluation' }
    ]
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Navigation */}
      <nav className="bg-[#2c3e7e] shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-white">StaffTrak</h1>
            <div className="flex gap-4">
              {getNavItems().map(item => (
                <a 
                  key={item.href}
                  href={item.href} 
                  className={`text-white hover:text-gray-200 ${item.active ? 'font-semibold' : ''}`}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white">{profile?.full_name || user?.email}</span>
            <button
              onClick={handleLogout}
              className="bg-white text-[#2c3e7e] px-4 py-2 rounded-lg hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[#2c3e7e]">
            Welcome, {profile?.full_name?.split(' ')[0] || 'there'}!
          </h2>
          {tenant && (
            <p className="text-[#666666]">{tenant.name} • School Year 2025-2026</p>
          )}
        </div>
        
        {/* Stats Cards - Different for Admin vs Staff */}
        {(isAdmin || isEvaluator) ? (
          /* Evaluator/Admin Stats */
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-[#2c3e7e]">
              <p className="text-[#666666] text-sm">Staff Assigned</p>
              <p className="text-3xl font-bold text-[#2c3e7e]">{stats.staffAssigned}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-[#477fc1]">
              <p className="text-[#666666] text-sm">Observations Pending</p>
              <p className="text-3xl font-bold text-[#2c3e7e]">{stats.observationsDue}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-[#f3843e]">
              <p className="text-[#666666] text-sm">Goals to Review</p>
              <p className="text-3xl font-bold text-[#f3843e]">{stats.pendingGoals}</p>
            </div>
            <a href="/reports" className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500 hover:shadow-md transition-shadow">
              <p className="text-[#666666] text-sm">View Reports</p>
              <p className="text-lg font-bold text-green-600">📊 Analytics</p>
            </a>
          </div>
        ) : (
          /* Staff Stats */
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-[#2c3e7e]">
              <p className="text-[#666666] text-sm">Draft Goals</p>
              <p className="text-3xl font-bold text-[#2c3e7e]">{stats.pendingGoals}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-[#477fc1]">
              <p className="text-[#666666] text-sm">Upcoming Observations</p>
              <p className="text-3xl font-bold text-[#2c3e7e]">{stats.observationsDue}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-[#f3843e]">
              <p className="text-[#666666] text-sm">Pending Signatures</p>
              <p className="text-3xl font-bold text-[#f3843e]">{stats.pendingSignatures}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
              <p className="text-[#666666] text-sm">Evaluation Status</p>
              <p className="text-lg font-bold text-green-600">
                {stats.pendingSignatures > 0 ? '⏳ Awaiting Signature' : '✓ On Track'}
              </p>
            </div>
          </div>
        )}

        {/* Upcoming Observations - Evaluator View */}
        {(isAdmin || isEvaluator) && upcomingObservations.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <h3 className="text-lg font-semibold text-[#2c3e7e] mb-4">Upcoming Observations</h3>
            <div className="space-y-3">
              {upcomingObservations.map(obs => (
                <div key={obs.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-[#2c3e7e]">{obs.profiles?.full_name}</p>
                    <p className="text-sm text-[#666666]">
                      {new Date(obs.scheduled_at).toLocaleDateString()} at {new Date(obs.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                  </div>
                  <a 
                    href={`/observations/${obs.id}`}
                    className="bg-[#477fc1] text-white px-4 py-2 rounded-lg hover:bg-[#3a6ca8] text-sm"
                  >
                    Start
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <h3 className="text-lg font-semibold text-[#2c3e7e] mb-4">Quick Actions</h3>
        
        {(isAdmin || isEvaluator) ? (
          /* Evaluator Quick Actions */
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <a href="/staff" className="bg-[#2c3e7e] text-white p-4 rounded-lg hover:bg-[#1e2a5e] text-center">
              + Add Staff
            </a>
            <a href="/observations" className="bg-[#477fc1] text-white p-4 rounded-lg hover:bg-[#3a6ca8] text-center">
              + New Observation
            </a>
            <a href="/meetings" className="bg-[#477fc1] text-white p-4 rounded-lg hover:bg-[#3a6ca8] text-center">
              + Schedule Meeting
            </a>
            <a href="/reports" className="bg-[#f3843e] text-white p-4 rounded-lg hover:bg-[#d9702f] text-center">
              📊 View Reports
            </a>
          </div>
        ) : (
          /* Staff Quick Actions */
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <a href="/self-reflection" className="bg-[#2c3e7e] text-white p-4 rounded-lg hover:bg-[#1e2a5e] text-center">
              📝 Self-Reflection
            </a>
            <a href="/goals" className="bg-[#477fc1] text-white p-4 rounded-lg hover:bg-[#3a6ca8] text-center">
              🎯 My Goals
            </a>
            <a href="/my-observations" className="bg-[#477fc1] text-white p-4 rounded-lg hover:bg-[#3a6ca8] text-center">
              👁️ My Observations
            </a>
            <a href="/my-summative" className="bg-[#f3843e] text-white p-4 rounded-lg hover:bg-[#d9702f] text-center">
              📋 My Evaluation
            </a>
          </div>
        )}

        {/* Role Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 p-4 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Your Role:</strong> {profile?.role?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            {profile?.staff_type && (
              <span> • {profile.staff_type.charAt(0).toUpperCase() + profile.staff_type.slice(1)} Staff</span>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}

export default Dashboard
