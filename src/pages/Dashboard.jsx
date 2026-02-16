import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

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
  
  // Staff-specific data
  const [staffData, setStaffData] = useState({
    goals: [],
    observations: [],
    meetings: [],
    evaluation: null,
    selfReflection: null,
    evaluator: null
  })
  const [actionItems, setActionItems] = useState([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (profile?.tenant_id) {
      fetchTenant()
      fetchStats()
      if (isStaff) {
        fetchStaffDashboardData()
      }
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

  const fetchStaffDashboardData = async () => {
    // Fetch all staff-relevant data
    const [goalsRes, obsRes, meetingsRes, evalRes, reflectionRes, evaluatorRes] = await Promise.all([
      // Goals
      supabase
        .from('goals')
        .select('*')
        .eq('staff_id', profile.id)
        .order('created_at', { ascending: false }),
      
      // Observations
      supabase
        .from('observations')
        .select('*, observer:observer_id(full_name)')
        .eq('staff_id', profile.id)
        .order('scheduled_at', { ascending: true }),
      
      // Meetings
      supabase
        .from('meetings')
        .select('*')
        .eq('staff_id', profile.id)
        .order('scheduled_at', { ascending: true }),
      
      // Evaluation
      supabase
        .from('summative_evaluations')
        .select('*')
        .eq('staff_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      
      // Self-reflection
      supabase
        .from('self_assessments')
        .select('*')
        .eq('staff_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      
      // Evaluator info
      profile.evaluator_id ? supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', profile.evaluator_id)
        .single() : Promise.resolve({ data: null })
    ])

    const data = {
      goals: goalsRes.data || [],
      observations: obsRes.data || [],
      meetings: meetingsRes.data || [],
      evaluation: evalRes.data,
      selfReflection: reflectionRes.data,
      evaluator: evaluatorRes.data
    }
    
    setStaffData(data)
    
    // Build action items
    buildActionItems(data)
  }

  const buildActionItems = (data) => {
    const items = []
    
    // Check for draft goals that need to be submitted
    const draftGoals = data.goals.filter(g => g.status === 'draft')
    if (draftGoals.length > 0) {
      items.push({
        type: 'warning',
        icon: '🎯',
        title: `${draftGoals.length} draft goal${draftGoals.length > 1 ? 's' : ''} to submit`,
        description: 'Submit your goals for evaluator approval',
        link: '/goals',
        linkText: 'Go to Goals'
      })
    }
    
    // Check for goals needing revision
    const revisionGoals = data.goals.filter(g => g.status === 'revision_requested')
    if (revisionGoals.length > 0) {
      items.push({
        type: 'urgent',
        icon: '⚠️',
        title: `${revisionGoals.length} goal${revisionGoals.length > 1 ? 's' : ''} need${revisionGoals.length === 1 ? 's' : ''} revision`,
        description: 'Your evaluator requested changes',
        link: '/goals',
        linkText: 'Review Feedback'
      })
    }
    
    // Check for missing self-reflection
    if (!data.selfReflection) {
      items.push({
        type: 'warning',
        icon: '📝',
        title: 'Complete your self-reflection',
        description: 'Required before your initial goals meeting',
        link: '/self-reflection',
        linkText: 'Start Self-Reflection'
      })
    }
    
    // Check for evaluation needing signature
    if (data.evaluation?.status === 'pending_staff_signature') {
      items.push({
        type: 'urgent',
        icon: '✍️',
        title: 'Sign your summative evaluation',
        description: 'Your evaluation is ready for review and signature',
        link: '/my-summative',
        linkText: 'Review & Sign'
      })
    }
    
    // Check for upcoming observations (within 7 days)
    const upcomingObs = data.observations.filter(o => {
      if (o.status !== 'scheduled') return false
      const obsDate = new Date(o.scheduled_at)
      const now = new Date()
      const daysUntil = (obsDate - now) / (1000 * 60 * 60 * 24)
      return daysUntil >= 0 && daysUntil <= 7
    })
    
    if (upcomingObs.length > 0) {
      const nextObs = upcomingObs[0]
      items.push({
        type: 'info',
        icon: '👁️',
        title: `Observation in ${getDaysUntil(nextObs.scheduled_at)}`,
        description: `${nextObs.observation_type === 'formal' ? 'Formal' : 'Informal'} observation with ${nextObs.observer?.full_name || 'your evaluator'}`,
        link: '/my-observations',
        linkText: 'View Details'
      })
    }
    
    // Check for formal observation pre-observation form
    const formalObs = data.observations.filter(o => 
      o.observation_type === 'formal' && 
      o.status === 'scheduled' && 
      !o.pre_observation_completed
    )
    if (formalObs.length > 0) {
      items.push({
        type: 'warning',
        icon: '📋',
        title: 'Pre-observation form needed',
        description: 'Complete before your formal observation',
        link: '/my-observations',
        linkText: 'Complete Form'
      })
    }
    
    setActionItems(items)
  }

  const getDaysUntil = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const days = Math.ceil((date - now) / (1000 * 60 * 60 * 24))
    if (days === 0) return 'today'
    if (days === 1) return 'tomorrow'
    return `${days} days`
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
        overdueItems: 0,
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

  // Get evaluation cycle progress for staff
  const getEvaluationProgress = () => {
    const steps = [
      { 
        name: 'Self-Reflection', 
        completed: !!staffData.selfReflection,
        current: !staffData.selfReflection
      },
      { 
        name: 'Goals Submitted', 
        completed: staffData.goals.filter(g => g.status === 'approved').length >= 2,
        current: staffData.goals.some(g => g.status === 'draft' || g.status === 'submitted')
      },
      { 
        name: 'Goals Meeting', 
        completed: staffData.meetings.some(m => m.meeting_type === 'initial_goals' && m.status === 'completed'),
        current: false
      },
      { 
        name: 'Observations', 
        completed: staffData.observations.filter(o => o.status === 'completed').length >= 1,
        current: staffData.observations.some(o => o.status === 'scheduled' || o.status === 'in_progress')
      },
      { 
        name: 'Mid-Year Review', 
        completed: staffData.meetings.some(m => m.meeting_type === 'mid_year' && m.status === 'completed'),
        current: false
      },
      { 
        name: 'Summative', 
        completed: staffData.evaluation?.status === 'completed',
        current: staffData.evaluation?.status === 'pending_staff_signature'
      }
    ]
    return steps
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  return (
    <div className="min-h-screen bg-gray-100">
     <Navbar />d

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
              <p className="text-[#666666] text-sm">Goals Approved</p>
              <p className="text-3xl font-bold text-[#2c3e7e]">
                {staffData.goals.filter(g => g.status === 'approved').length}
              </p>
              <p className="text-xs text-[#666666] mt-1">of 3 required</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-[#477fc1]">
              <p className="text-[#666666] text-sm">Observations</p>
              <p className="text-3xl font-bold text-[#2c3e7e]">
                {staffData.observations.filter(o => o.status === 'completed').length}
              </p>
              <p className="text-xs text-[#666666] mt-1">completed</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-[#f3843e]">
              <p className="text-[#666666] text-sm">Action Items</p>
              <p className="text-3xl font-bold text-[#f3843e]">{actionItems.length}</p>
              <p className="text-xs text-[#666666] mt-1">need attention</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
              <p className="text-[#666666] text-sm">Evaluation Status</p>
              <p className="text-lg font-bold text-green-600">
                {staffData.evaluation?.status === 'completed' ? '✓ Complete' :
                 staffData.evaluation?.status === 'pending_staff_signature' ? '⏳ Sign Now' :
                 '📋 In Progress'}
              </p>
            </div>
          </div>
        )}

        {/* STAFF VIEW: Action Items & Timeline */}
        {isStaff && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            
            {/* Action Items - Takes 2 columns */}
            <div className="lg:col-span-2 bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">📋 Action Items</h3>
              </div>
              <div className="p-4">
                {actionItems.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-2">✅</div>
                    <p className="text-[#666666]">You're all caught up!</p>
                    <p className="text-sm text-[#666666]">No pending items at this time.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {actionItems.map((item, idx) => (
                      <div 
                        key={idx}
                        className={`p-4 rounded-lg border-l-4 ${
                          item.type === 'urgent' ? 'bg-red-50 border-red-500' :
                          item.type === 'warning' ? 'bg-yellow-50 border-yellow-500' :
                          'bg-blue-50 border-blue-500'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex gap-3">
                            <span className="text-2xl">{item.icon}</span>
                            <div>
                              <p className="font-medium text-[#2c3e7e]">{item.title}</p>
                              <p className="text-sm text-[#666666]">{item.description}</p>
                            </div>
                          </div>
                          <a 
                            href={item.link}
                            className={`px-3 py-1 rounded-lg text-sm text-white ${
                              item.type === 'urgent' ? 'bg-red-500 hover:bg-red-600' :
                              item.type === 'warning' ? 'bg-yellow-500 hover:bg-yellow-600' :
                              'bg-blue-500 hover:bg-blue-600'
                            }`}
                          >
                            {item.linkText}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Evaluation Progress Timeline */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">📅 Evaluation Cycle</h3>
              </div>
              <div className="p-4">
                <div className="space-y-4">
                  {getEvaluationProgress().map((step, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        step.completed ? 'bg-green-500 text-white' :
                        step.current ? 'bg-[#f3843e] text-white' :
                        'bg-gray-200 text-gray-500'
                      }`}>
                        {step.completed ? '✓' : idx + 1}
                      </div>
                      <span className={`text-sm ${
                        step.completed ? 'text-green-600 line-through' :
                        step.current ? 'text-[#f3843e] font-medium' :
                        'text-[#666666]'
                      }`}>
                        {step.name}
                      </span>
                    </div>
                  ))}
                </div>
                
                {/* Evaluator Info */}
                {staffData.evaluator && (
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <p className="text-xs text-[#666666] mb-1">Your Evaluator</p>
                    <p className="font-medium text-[#2c3e7e]">{staffData.evaluator.full_name}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STAFF VIEW: Upcoming Schedule */}
        {isStaff && (staffData.observations.filter(o => o.status === 'scheduled').length > 0 || staffData.meetings.filter(m => m.status === 'scheduled').length > 0) && (
          <div className="bg-white rounded-lg shadow mb-8">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-[#2c3e7e]">📆 Upcoming Schedule</h3>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                {/* Upcoming Observations */}
                {staffData.observations
                  .filter(o => o.status === 'scheduled')
                  .slice(0, 3)
                  .map(obs => (
                    <div key={obs.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">👁️</span>
                        <div>
                          <p className="font-medium text-[#2c3e7e]">
                            {obs.observation_type === 'formal' ? 'Formal' : 'Informal'} Observation
                          </p>
                          <p className="text-sm text-[#666666]">
                            with {obs.observer?.full_name || 'Evaluator'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-[#2c3e7e]">
                          {formatDate(obs.scheduled_at)}
                        </p>
                        {obs.location && (
                          <p className="text-xs text-[#666666]">📍 {obs.location}</p>
                        )}
                      </div>
                    </div>
                  ))}
                
                {/* Upcoming Meetings */}
                {staffData.meetings
                  .filter(m => m.status === 'scheduled')
                  .slice(0, 3)
                  .map(meeting => (
                    <div key={meeting.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🤝</span>
                        <div>
                          <p className="font-medium text-[#2c3e7e] capitalize">
                            {meeting.meeting_type?.replace(/_/g, ' ')} Meeting
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-[#2c3e7e]">
                        {formatDate(meeting.scheduled_at)}
                      </p>
                    </div>
                  ))}
              </div>
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
