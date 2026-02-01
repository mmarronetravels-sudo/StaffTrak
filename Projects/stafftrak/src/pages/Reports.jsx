import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

function Reports() {
  const { profile, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('not-on-track')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    staff: [],
    allProfiles: [],
    observations: [],
    evaluations: [],
    goals: [],
    selfAssessments: [],
    meetings: []
  })

  useEffect(() => {
    if (profile) {
      fetchAllData()
    }
  }, [profile])

  const fetchAllData = async () => {
    setLoading(true)
    
    // Fetch all staff (for reports)
    const { data: staffData } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['licensed_staff', 'classified_staff'])
      .eq('is_active', true)
      .order('full_name')

    // Fetch all profiles including admins/evaluators (for name lookups)
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)

    // Fetch all observations
    const { data: obsData } = await supabase
      .from('observations')
      .select('*')
      .order('created_at', { ascending: false })

    // Fetch all evaluations
    const { data: evalData } = await supabase
      .from('summative_evaluations')
      .select('*')

    // Fetch all goals
    const { data: goalsData } = await supabase
      .from('goals')
      .select('*')

    // Fetch self assessments
    const { data: selfData } = await supabase
      .from('self_assessments')
      .select('*')

    // Fetch meetings
    const { data: meetingsData } = await supabase
      .from('meetings')
      .select('*')

    setData({
      staff: staffData || [],
      allProfiles: allProfiles || [],
      observations: obsData || [],
      evaluations: evalData || [],
      goals: goalsData || [],
      selfAssessments: selfData || [],
      meetings: meetingsData || []
    })
    
    setLoading(false)
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  // Calculate workflow status for each staff member
  const getStaffWorkflowStatus = (staffMember) => {
    const staffGoals = data.goals.filter(g => g.staff_id === staffMember.id)
    const staffObs = data.observations.filter(o => o.staff_id === staffMember.id)
    const staffSelf = data.selfAssessments.find(s => s.staff_id === staffMember.id)
    const staffEval = data.evaluations.find(e => e.staff_id === staffMember.id)
    const staffMeetings = data.meetings.filter(m => m.staff_id === staffMember.id)

    // Define workflow steps with deadlines (using school year 2025-2026)
    const today = new Date()
    const steps = []

    // Step 1: Self-Reflection (Due Oct 15)
    const selfReflectionDue = new Date('2025-10-15')
    steps.push({
      name: 'Self-Reflection',
      due: selfReflectionDue,
      status: staffSelf?.submitted_at ? 'complete' : (today > selfReflectionDue ? 'overdue' : 'pending'),
      completed: !!staffSelf?.submitted_at
    })

    // Step 2: Goals Submitted (Due Oct 15)
    const goalsDue = new Date('2025-10-15')
    const approvedGoals = staffGoals.filter(g => g.status === 'approved')
    const requiredGoals = staffMember.staff_type === 'licensed' ? 3 : 3 // 2 SLGs + 1 PGG or 1 PPG + 2 Improvement
    steps.push({
      name: 'Goals Approved',
      due: goalsDue,
      status: approvedGoals.length >= requiredGoals ? 'complete' : (today > goalsDue ? 'overdue' : 'pending'),
      completed: approvedGoals.length >= requiredGoals,
      detail: `${approvedGoals.length}/${requiredGoals} approved`
    })

    // Step 3: Initial Goals Meeting (Due Oct 31)
    const initialMeetingDue = new Date('2025-10-31')
    const initialMeeting = staffMeetings.find(m => m.meeting_type === 'initial_goals' && m.status === 'completed')
    steps.push({
      name: 'Initial Goals Meeting',
      due: initialMeetingDue,
      status: initialMeeting ? 'complete' : (today > initialMeetingDue ? 'overdue' : 'pending'),
      completed: !!initialMeeting
    })

    // Step 4: Mid-Year Review (Due Jan 30)
    const midYearDue = new Date('2026-01-30')
    const midYearMeeting = staffMeetings.find(m => m.meeting_type === 'mid_year_review' && m.status === 'completed')
    steps.push({
      name: 'Mid-Year Review',
      due: midYearDue,
      status: midYearMeeting ? 'complete' : (today > midYearDue ? 'overdue' : 'pending'),
      completed: !!midYearMeeting
    })

    // Step 5: Observations (varies by staff type)
    const completedObs = staffObs.filter(o => o.status === 'completed')
    const requiredObs = staffMember.staff_type === 'licensed' ? 
      (staffMember.years_at_school <= 3 ? 3 : 3) : 0 // Probationary vs Permanent
    if (requiredObs > 0) {
      const obsDue = new Date('2026-05-01')
      steps.push({
        name: 'Observations',
        due: obsDue,
        status: completedObs.length >= requiredObs ? 'complete' : (today > obsDue ? 'overdue' : 'pending'),
        completed: completedObs.length >= requiredObs,
        detail: `${completedObs.length}/${requiredObs} complete`
      })
    }

    // Step 6: End of Year Review (Due May 30)
    const endYearDue = new Date('2026-05-30')
    const endYearMeeting = staffMeetings.find(m => m.meeting_type === 'end_of_year_review' && m.status === 'completed')
    steps.push({
      name: 'End-of-Year Review',
      due: endYearDue,
      status: endYearMeeting ? 'complete' : (today > endYearDue ? 'overdue' : 'pending'),
      completed: !!endYearMeeting
    })

    // Step 7: Summative Evaluation (Due June 5)
    const summativeDue = new Date('2026-06-05')
    steps.push({
      name: 'Summative Evaluation',
      due: summativeDue,
      status: staffEval?.status === 'completed' ? 'complete' : (today > summativeDue ? 'overdue' : 'pending'),
      completed: staffEval?.status === 'completed'
    })

    return steps
  }

  // Get staff who are behind
  const getStaffNotOnTrack = () => {
    return data.staff.map(staff => {
      const steps = getStaffWorkflowStatus(staff)
      const overdueSteps = steps.filter(s => s.status === 'overdue')
      const nextPending = steps.find(s => s.status === 'pending')
      
      return {
        ...staff,
        steps,
        overdueSteps,
        nextStep: nextPending,
        isOnTrack: overdueSteps.length === 0
      }
    }).filter(s => !s.isOnTrack)
  }

  // Get observation stats by evaluator
  const getObservationStats = () => {
    // Group by observer
    const statsByEvaluator = {}
    
    data.observations.forEach(obs => {
      if (!statsByEvaluator[obs.observer_id]) {
        statsByEvaluator[obs.observer_id] = {
          total: 0,
          completed: 0,
          scheduled: 0,
          inProgress: 0
        }
      }
      statsByEvaluator[obs.observer_id].total++
      if (obs.status === 'completed') statsByEvaluator[obs.observer_id].completed++
      else if (obs.status === 'scheduled') statsByEvaluator[obs.observer_id].scheduled++
      else if (obs.status === 'in_progress') statsByEvaluator[obs.observer_id].inProgress++
    })

    // Get evaluator names from allProfiles (includes admins)
    return Object.entries(statsByEvaluator).map(([evaluatorId, stats]) => {
      const evaluator = data.allProfiles.find(p => p.id === evaluatorId) || 
                       { full_name: 'Unknown Evaluator' }
      const assignedStaff = data.staff.filter(s => s.evaluator_id === evaluatorId)
      
      return {
        evaluatorId,
        evaluatorName: evaluator.full_name,
        assignedStaff: assignedStaff.length,
        ...stats,
        completionRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
      }
    })
  }

  // Get evaluation status summary
  const getEvaluationStatus = () => {
    const licensedStaff = data.staff.filter(s => s.staff_type === 'licensed')
    const classifiedStaff = data.staff.filter(s => s.staff_type === 'classified')

    const getStatusCounts = (staffList) => {
      return {
        total: staffList.length,
        notStarted: staffList.filter(s => !data.evaluations.find(e => e.staff_id === s.id)).length,
        inProgress: staffList.filter(s => {
          const eval_ = data.evaluations.find(e => e.staff_id === s.id)
          return eval_ && eval_.status === 'draft'
        }).length,
        pending: staffList.filter(s => {
          const eval_ = data.evaluations.find(e => e.staff_id === s.id)
          return eval_ && eval_.status === 'pending_staff_signature'
        }).length,
        completed: staffList.filter(s => {
          const eval_ = data.evaluations.find(e => e.staff_id === s.id)
          return eval_ && eval_.status === 'completed'
        }).length
      }
    }

    return {
      licensed: getStatusCounts(licensedStaff),
      classified: getStatusCounts(classifiedStaff),
      all: getStatusCounts(data.staff)
    }
  }

  // Generate ODE Export data
  const generateODEExport = () => {
    const completedEvals = data.evaluations.filter(e => e.status === 'completed')
    
    return completedEvals.map(eval_ => {
      const staff = data.staff.find(s => s.id === eval_.staff_id)
      const evaluator = data.allProfiles.find(p => p.id === eval_.evaluator_id)
      
      return {
        staff_id: staff?.id || '',
        staff_name: staff?.full_name || '',
        email: staff?.email || '',
        position: staff?.position_type || '',
        staff_type: staff?.staff_type || '',
        years_of_service: staff?.years_at_school || '',
        summative_score: eval_.overall_score || '',
        summative_rating: eval_.overall_rating || '',
        evaluator_name: evaluator?.full_name || '',
        evaluation_date: eval_.completed_at ? new Date(eval_.completed_at).toLocaleDateString() : ''
      }
    })
  }

  const downloadCSV = () => {
    const exportData = generateODEExport()
    
    if (exportData.length === 0) {
      alert('No completed evaluations to export.')
      return
    }

    const headers = [
      'Staff ID', 'Staff Name', 'Email', 'Position', 'Staff Type',
      'Years of Service', 'Summative Score', 'Summative Rating',
      'Evaluator Name', 'Evaluation Date'
    ]
    
    const csvContent = [
      headers.join(','),
      ...exportData.map(row => [
        row.staff_id,
        `"${row.staff_name}"`,
        row.email,
        row.position,
        row.staff_type,
        row.years_of_service,
        row.summative_score,
        `"${row.summative_rating}"`,
        `"${row.evaluator_name}"`,
        row.evaluation_date
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `StaffTrak_ODE_Export_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const staffNotOnTrack = getStaffNotOnTrack()
  const observationStats = getObservationStats()
  const evaluationStatus = getEvaluationStatus()

  const tabs = [
    { id: 'not-on-track', label: 'Staff Not On Track', icon: '⚠️', count: staffNotOnTrack.length },
    { id: 'observations', label: 'Observation Rates', icon: '👁️' },
    { id: 'evaluations', label: 'Evaluation Status', icon: '📊' },
    { id: 'ode-export', label: 'ODE Export', icon: '📤' }
  ]

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Navigation */}
      <nav className="bg-[#2c3e7e] shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-white">StaffTrak</h1>
            <div className="flex gap-4">
              <a href="/dashboard" className="text-white hover:text-gray-200">Dashboard</a>
              <a href="/staff" className="text-white hover:text-gray-200">Staff</a>
              <a href="/observations" className="text-white hover:text-gray-200">Observations</a>
              <a href="/meetings" className="text-white hover:text-gray-200">Meetings</a>
              <a href="/summatives" className="text-white hover:text-gray-200">Summatives</a>
              <a href="/reports" className="text-white hover:text-gray-200 font-semibold">Reports</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white">{profile?.full_name}</span>
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
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-[#2c3e7e]">Reports & Analytics</h2>
          <p className="text-[#666666]">School Year 2025-2026</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-[#2c3e7e] text-white'
                  : 'bg-white text-[#666666] hover:bg-gray-50 shadow'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id 
                    ? 'bg-white/20 text-white' 
                    : tab.count > 0 ? 'bg-[#f3843e] text-white' : 'bg-gray-200'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-[#666666]">Loading report data...</p>
          </div>
        ) : (
          <>
            {/* Staff Not On Track */}
            {activeTab === 'not-on-track' && (
              <div className="space-y-4">
                {/* Summary Card */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[#2c3e7e]">Staff Behind on Deadlines</h3>
                      <p className="text-[#666666] text-sm mt-1">
                        Staff who have missed one or more workflow deadlines
                      </p>
                    </div>
                    <div className={`text-4xl font-bold ${staffNotOnTrack.length > 0 ? 'text-[#f3843e]' : 'text-green-600'}`}>
                      {staffNotOnTrack.length}
                    </div>
                  </div>
                </div>

                {staffNotOnTrack.length === 0 ? (
                  <div className="bg-green-50 border border-green-200 p-8 rounded-lg text-center">
                    <span className="text-4xl mb-4 block">🎉</span>
                    <p className="text-green-800 font-medium">All staff are on track!</p>
                    <p className="text-green-600 text-sm mt-1">No overdue workflow items found.</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {staffNotOnTrack.map(staff => (
                      <div key={staff.id} className="bg-white p-6 rounded-lg shadow">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h4 className="font-semibold text-[#2c3e7e] text-lg">{staff.full_name}</h4>
                            <p className="text-sm text-[#666666] capitalize">
                              {staff.position_type} • {staff.staff_type} Staff
                            </p>
                          </div>
                          <span className="bg-[#f3843e] text-white text-xs px-3 py-1 rounded-full">
                            {staff.overdueSteps.length} overdue
                          </span>
                        </div>
                        
                        {/* Overdue Items */}
                        <div className="space-y-2">
                          {staff.overdueSteps.map((step, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-red-50 p-3 rounded-lg">
                              <div className="flex items-center gap-3">
                                <span className="text-red-500">✗</span>
                                <span className="font-medium text-red-800">{step.name}</span>
                                {step.detail && (
                                  <span className="text-red-600 text-sm">({step.detail})</span>
                                )}
                              </div>
                              <span className="text-red-600 text-sm">
                                Due: {step.due.toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Next Step */}
                        {staff.nextStep && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-sm text-[#666666]">
                              <span className="font-medium">Next up:</span> {staff.nextStep.name} 
                              <span className="text-[#477fc1]"> (due {staff.nextStep.due.toLocaleDateString()})</span>
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Observation Rates */}
            {activeTab === 'observations' && (
              <div className="space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#2c3e7e]">
                    <p className="text-[#666666] text-sm">Total Observations</p>
                    <p className="text-2xl font-bold text-[#2c3e7e]">{data.observations.length}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
                    <p className="text-[#666666] text-sm">Completed</p>
                    <p className="text-2xl font-bold text-green-600">
                      {data.observations.filter(o => o.status === 'completed').length}
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
                    <p className="text-[#666666] text-sm">Scheduled</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {data.observations.filter(o => o.status === 'scheduled').length}
                    </p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                    <p className="text-[#666666] text-sm">In Progress</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {data.observations.filter(o => o.status === 'in_progress').length}
                    </p>
                  </div>
                </div>

                {/* By Evaluator Table */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-[#2c3e7e]">Completion by Evaluator</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">
                            Evaluator
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-[#666666] uppercase tracking-wider">
                            Assigned Staff
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-[#666666] uppercase tracking-wider">
                            Total Obs
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-[#666666] uppercase tracking-wider">
                            Completed
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-[#666666] uppercase tracking-wider">
                            Scheduled
                          </th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-[#666666] uppercase tracking-wider">
                            Completion Rate
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {observationStats.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="px-6 py-8 text-center text-[#666666]">
                              No observation data available yet.
                            </td>
                          </tr>
                        ) : (
                          observationStats.map((stat, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap font-medium text-[#2c3e7e]">
                                {stat.evaluatorName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-[#666666]">
                                {stat.assignedStaff}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-[#666666]">
                                {stat.total}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-green-600 font-medium">
                                {stat.completed}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-yellow-600">
                                {stat.scheduled}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <div className="w-24 bg-gray-200 rounded-full h-2">
                                    <div 
                                      className={`h-2 rounded-full ${
                                        stat.completionRate >= 75 ? 'bg-green-500' :
                                        stat.completionRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${stat.completionRate}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-sm font-medium text-[#666666]">
                                    {stat.completionRate}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Evaluation Status */}
            {activeTab === 'evaluations' && (
              <div className="space-y-6">
                {/* Overall Summary */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h3 className="text-lg font-semibold text-[#2c3e7e] mb-4">Overall Evaluation Progress</h3>
                  <div className="grid grid-cols-5 gap-4 text-center">
                    <div>
                      <p className="text-3xl font-bold text-[#2c3e7e]">{evaluationStatus.all.total}</p>
                      <p className="text-sm text-[#666666]">Total Staff</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-gray-500">{evaluationStatus.all.notStarted}</p>
                      <p className="text-sm text-[#666666]">Not Started</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-yellow-600">{evaluationStatus.all.inProgress}</p>
                      <p className="text-sm text-[#666666]">In Progress</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-blue-600">{evaluationStatus.all.pending}</p>
                      <p className="text-sm text-[#666666]">Awaiting Signature</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-green-600">{evaluationStatus.all.completed}</p>
                      <p className="text-sm text-[#666666]">Completed</p>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="mt-6">
                    <div className="flex justify-between text-sm text-[#666666] mb-2">
                      <span>Completion Progress</span>
                      <span>
                        {evaluationStatus.all.total > 0 
                          ? Math.round((evaluationStatus.all.completed / evaluationStatus.all.total) * 100)
                          : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                      <div className="h-4 flex">
                        <div 
                          className="bg-green-500"
                          style={{ width: `${evaluationStatus.all.total > 0 ? (evaluationStatus.all.completed / evaluationStatus.all.total) * 100 : 0}%` }}
                        ></div>
                        <div 
                          className="bg-blue-500"
                          style={{ width: `${evaluationStatus.all.total > 0 ? (evaluationStatus.all.pending / evaluationStatus.all.total) * 100 : 0}%` }}
                        ></div>
                        <div 
                          className="bg-yellow-500"
                          style={{ width: `${evaluationStatus.all.total > 0 ? (evaluationStatus.all.inProgress / evaluationStatus.all.total) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded"></span> Completed</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded"></span> Awaiting Signature</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded"></span> In Progress</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-300 rounded"></span> Not Started</span>
                    </div>
                  </div>
                </div>

                {/* By Staff Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Licensed Staff */}
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h4 className="font-semibold text-[#2c3e7e] mb-4 flex items-center gap-2">
                      <span className="bg-[#477fc1] text-white text-xs px-2 py-1 rounded">Licensed</span>
                      Staff Evaluations
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[#666666]">Not Started</span>
                        <span className="font-medium">{evaluationStatus.licensed.notStarted}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#666666]">In Progress</span>
                        <span className="font-medium text-yellow-600">{evaluationStatus.licensed.inProgress}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#666666]">Awaiting Signature</span>
                        <span className="font-medium text-blue-600">{evaluationStatus.licensed.pending}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-[#666666] font-medium">Completed</span>
                        <span className="font-bold text-green-600">{evaluationStatus.licensed.completed} / {evaluationStatus.licensed.total}</span>
                      </div>
                    </div>
                  </div>

                  {/* Classified Staff */}
                  <div className="bg-white p-6 rounded-lg shadow">
                    <h4 className="font-semibold text-[#2c3e7e] mb-4 flex items-center gap-2">
                      <span className="bg-[#f3843e] text-white text-xs px-2 py-1 rounded">Classified</span>
                      Staff Evaluations
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[#666666]">Not Started</span>
                        <span className="font-medium">{evaluationStatus.classified.notStarted}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#666666]">In Progress</span>
                        <span className="font-medium text-yellow-600">{evaluationStatus.classified.inProgress}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#666666]">Awaiting Signature</span>
                        <span className="font-medium text-blue-600">{evaluationStatus.classified.pending}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-[#666666] font-medium">Completed</span>
                        <span className="font-bold text-green-600">{evaluationStatus.classified.completed} / {evaluationStatus.classified.total}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ODE Export */}
            {activeTab === 'ode-export' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">📤</div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-[#2c3e7e]">Oregon Department of Education Export</h3>
                      <p className="text-[#666666] mt-1">
                        Export completed summative evaluations in the format required by ODE for annual reporting.
                      </p>
                      
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium text-[#2c3e7e] mb-2">Export includes:</h4>
                        <ul className="text-sm text-[#666666] space-y-1">
                          <li>• Staff ID and Name</li>
                          <li>• Email and Position</li>
                          <li>• Staff Type (Licensed/Classified)</li>
                          <li>• Years of Service</li>
                          <li>• Summative Score (1.00-4.00)</li>
                          <li>• Summative Rating</li>
                          <li>• Evaluator Name</li>
                          <li>• Evaluation Completion Date</li>
                        </ul>
                      </div>

                      <div className="mt-4 flex items-center gap-4">
                        <button
                          onClick={downloadCSV}
                          className="bg-[#2c3e7e] text-white px-6 py-3 rounded-lg hover:bg-[#1e2a5e] flex items-center gap-2"
                        >
                          <span>📥</span>
                          Download CSV
                        </button>
                        <span className="text-sm text-[#666666]">
                          {evaluationStatus.all.completed} completed evaluation{evaluationStatus.all.completed !== 1 ? 's' : ''} ready for export
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview Table */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-[#2c3e7e]">Export Preview</h3>
                    <p className="text-sm text-[#666666]">Completed evaluations that will be included in the export</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Position</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Type</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-[#666666] uppercase">Score</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Rating</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-[#666666] uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {generateODEExport().length === 0 ? (
                          <tr>
                            <td colSpan="6" className="px-4 py-8 text-center text-[#666666]">
                              No completed evaluations available for export.
                            </td>
                          </tr>
                        ) : (
                          generateODEExport().map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-[#2c3e7e]">{row.staff_name}</td>
                              <td className="px-4 py-3 text-[#666666] capitalize">{row.position}</td>
                              <td className="px-4 py-3">
                                <span className={`text-xs px-2 py-1 rounded ${
                                  row.staff_type === 'licensed' 
                                    ? 'bg-[#477fc1] text-white' 
                                    : 'bg-[#f3843e] text-white'
                                }`}>
                                  {row.staff_type}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-[#2c3e7e]">{row.summative_score}</td>
                              <td className="px-4 py-3 text-[#666666]">{row.summative_rating}</td>
                              <td className="px-4 py-3 text-[#666666]">{row.evaluation_date}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default Reports