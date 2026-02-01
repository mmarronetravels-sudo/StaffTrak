import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

function MeetingSession() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, signOut, isEvaluator } = useAuth()
  
  const [meeting, setMeeting] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Context data
  const [selfReflection, setSelfReflection] = useState(null)
  const [goals, setGoals] = useState([])
  const [observations, setObservations] = useState([])
  const [rubricData, setRubricData] = useState({ domains: [], standards: [] })
  
  // Meeting form state
  const [notes, setNotes] = useState('')
  const [actionItems, setActionItems] = useState('')
  const [showCompleteModal, setShowCompleteModal] = useState(false)

  useEffect(() => {
    if (id) {
      fetchMeeting()
    }
  }, [id])

  const fetchMeeting = async () => {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        staff:staff_id (id, full_name, position_type, staff_type),
        evaluator:evaluator_id (id, full_name)
      `)
      .eq('id', id)
      .single()

    if (!error && data) {
      setMeeting(data)
      setNotes(data.notes || '')
      setActionItems(data.action_items || '')
      
      // Fetch context data based on meeting type
      fetchContextData(data.staff_id, data.meeting_type)
    }
    setLoading(false)
  }

  const fetchContextData = async (staffId, meetingType) => {
    // Fetch self-reflection
    const { data: reflectionData } = await supabase
      .from('self_assessments')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (reflectionData) {
      setSelfReflection(reflectionData)
      
      // Fetch rubric data for displaying standards
      if (reflectionData.rubric_id) {
        const { data: domains } = await supabase
          .from('rubric_domains')
          .select('*')
          .eq('rubric_id', reflectionData.rubric_id)
          .order('sort_order')
        
        if (domains) {
          const domainIds = domains.map(d => d.id)
          const { data: standards } = await supabase
            .from('rubric_standards')
            .select('*')
            .in('domain_id', domainIds)
            .order('sort_order')
          
          setRubricData({ domains: domains || [], standards: standards || [] })
        }
      }
    }

    // Fetch goals
    const { data: goalsData } = await supabase
      .from('goals')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
    
    if (goalsData) {
      setGoals(goalsData)
    }

    // Fetch observations (for mid-year and end-year)
    if (meetingType === 'mid_year_review' || meetingType === 'end_year_review') {
      const { data: obsData } = await supabase
        .from('observations')
        .select('*')
        .eq('staff_id', staffId)
        .order('scheduled_at', { ascending: false })
      
      if (obsData) {
        setObservations(obsData)
      }
    }
  }

  const handleSaveNotes = async () => {
    setSaving(true)
    
    const updates = {
      notes,
      action_items: actionItems,
      status: meeting.status === 'scheduled' ? 'in_progress' : meeting.status
    }

    const { error } = await supabase
      .from('meetings')
      .update(updates)
      .eq('id', id)

    if (!error) {
      setMeeting({ ...meeting, ...updates })
    }
    setSaving(false)
  }

  const handleCompleteMeeting = async () => {
    setSaving(true)
    
    const updates = {
      notes,
      action_items: actionItems,
      status: 'completed',
      completed_at: new Date().toISOString(),
      evaluator_signed_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('meetings')
      .update(updates)
      .eq('id', id)

    if (!error) {
      setMeeting({ ...meeting, ...updates })
      setShowCompleteModal(false)
    }
    setSaving(false)
  }

  const handleStaffSignOff = async () => {
    const { error } = await supabase
      .from('meetings')
      .update({ staff_signed_at: new Date().toISOString() })
      .eq('id', id)

    if (!error) {
      setMeeting({ ...meeting, staff_signed_at: new Date().toISOString() })
    }
  }

  const getMeetingTypeLabel = (type) => {
    switch(type) {
      case 'initial_goals': return 'Initial Goals Meeting'
      case 'mid_year_review': return 'Mid-Year Review'
      case 'end_year_review': return 'End-of-Year Review'
      default: return type
    }
  }

  const getGoalTypeLabel = (type) => {
    switch(type) {
      case 'slg': return 'SLG'
      case 'pgg': return 'PGG'
      case 'improvement': return 'Improvement'
      default: return type
    }
  }

  const getGoalStatusBadge = (status) => {
    switch(status) {
      case 'draft': return 'bg-gray-200 text-gray-700'
      case 'submitted': return 'bg-yellow-100 text-yellow-800'
      case 'approved': return 'bg-green-100 text-green-800'
      case 'revision_requested': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-200 text-gray-700'
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getStandardsForDomain = (domainId) => {
    return rubricData.standards.filter(s => s.domain_id === domainId)
  }

  const getDomainAverage = (domainId) => {
    if (!selfReflection?.domain_scores) return null
    const scores = selfReflection.domain_scores
    const domainStandards = getStandardsForDomain(domainId)
    const standardScores = domainStandards
      .map(s => scores[s.id])
      .filter(score => score !== null && score !== undefined)
    
    if (standardScores.length === 0) return null
    return (standardScores.reduce((a, b) => a + b, 0) / standardScores.length).toFixed(1)
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#666666]">Loading meeting...</p>
        </div>
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#666666] mb-4">Meeting not found.</p>
          <a href={isEvaluator ? "/meetings" : "/my-meetings"} className="text-[#477fc1] hover:underline">
            Back to Meetings
          </a>
        </div>
      </div>
    )
  }

  const isCompleted = !!meeting.completed_at
  const isStaffView = profile?.id === meeting.staff_id

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Navigation */}
      <nav className="bg-[#2c3e7e] shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-white">StaffTrak</h1>
            <a 
              href={isEvaluator && !isStaffView ? "/meetings" : "/my-meetings"} 
              className="text-white hover:text-gray-200"
            >
              ← Back to Meetings
            </a>
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

      {/* Meeting Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-[#2c3e7e]">
                  {getMeetingTypeLabel(meeting.meeting_type)}
                </h2>
                {isCompleted && (
                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                    ✓ Completed
                  </span>
                )}
              </div>
              <p className="text-[#666666]">
                {isStaffView ? `With: ${meeting.evaluator?.full_name}` : `Staff: ${meeting.staff?.full_name}`}
                {' • '}
                {formatDate(meeting.scheduled_at)}
                {meeting.location && ` • ${meeting.location}`}
              </p>
            </div>
            
            {!isCompleted && isEvaluator && !isStaffView && (
              <button
                onClick={() => setShowCompleteModal(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                Complete Meeting
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Left Column - Context Panels */}
          <div className="space-y-6">
            
            {/* Self-Reflection Summary (for Initial Goals & Mid-Year) */}
            {(meeting.meeting_type === 'initial_goals' || meeting.meeting_type === 'mid_year_review') && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-[#2c3e7e]">📊 Self-Reflection Summary</h3>
                </div>
                <div className="p-4">
                  {selfReflection ? (
                    <div className="space-y-4">
                      {/* Overall Average */}
                      {selfReflection.overall_score && (
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-[#666666]">Overall Self-Rating</p>
                          <p className="text-3xl font-bold text-[#2c3e7e]">
                            {selfReflection.overall_score.toFixed(1)}
                          </p>
                          <p className="text-xs text-[#666666]">out of 4.0</p>
                        </div>
                      )}
                      
                      {/* Domain Averages */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-[#666666]">By Domain:</p>
                        {rubricData.domains.map(domain => {
                          const avg = getDomainAverage(domain.id)
                          return (
                            <div key={domain.id} className="flex justify-between items-center text-sm">
                              <span className="text-[#666666]">{domain.name}</span>
                              <span className={`font-medium ${
                                avg >= 3 ? 'text-green-600' : 
                                avg >= 2 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {avg || 'N/A'}
                              </span>
                            </div>
                          )
                        })}
                      </div>

                      {/* Overall Reflection Notes */}
                      {selfReflection.content?.overall_reflection && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm font-medium text-[#2c3e7e] mb-1">Reflection Notes:</p>
                          <p className="text-sm text-[#666666]">
                            {selfReflection.content.overall_reflection}
                          </p>
                        </div>
                      )}

                      <a 
                        href={`/self-reflection`} 
                        className="text-sm text-[#477fc1] hover:underline block"
                        target="_blank"
                      >
                        View Full Self-Reflection →
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-[#666666] italic">
                      Self-reflection not yet completed.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Goals Panel */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">
                  🎯 Goals {meeting.meeting_type === 'initial_goals' ? '(Draft)' : ''}
                </h3>
              </div>
              <div className="p-4">
                {goals.length > 0 ? (
                  <div className="space-y-3">
                    {goals.map(goal => (
                      <div key={goal.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-start justify-between mb-1">
                          <span className="font-medium text-[#2c3e7e] text-sm">
                            {goal.title}
                          </span>
                          <div className="flex gap-1">
                            <span className="bg-[#477fc1] text-white text-xs px-1.5 py-0.5 rounded">
                              {getGoalTypeLabel(goal.goal_type)}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${getGoalStatusBadge(goal.status)}`}>
                              {goal.status?.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        {goal.target_data && (
                          <p className="text-xs text-[#666666] mt-1">
                            <span className="font-medium">Target:</span> {goal.target_data}
                          </p>
                        )}
                        {/* Mid-year/End-year progress */}
                        {(meeting.meeting_type === 'mid_year_review' || meeting.meeting_type === 'end_year_review') && (
                          <>
                            {goal.mid_year_progress && (
                              <p className="text-xs text-[#666666] mt-1">
                                <span className="font-medium">Mid-Year Progress:</span> {goal.mid_year_progress}
                              </p>
                            )}
                            {meeting.meeting_type === 'end_year_review' && goal.end_year_progress && (
                              <p className="text-xs text-[#666666] mt-1">
                                <span className="font-medium">End-Year Progress:</span> {goal.end_year_progress}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#666666] italic">No goals created yet.</p>
                )}
              </div>
            </div>

            {/* Observations Panel (for Mid-Year and End-Year) */}
            {(meeting.meeting_type === 'mid_year_review' || meeting.meeting_type === 'end_year_review') && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-[#2c3e7e]">👁️ Observations to Date</h3>
                </div>
                <div className="p-4">
                  {observations.length > 0 ? (
                    <div className="space-y-3">
                      {observations.map(obs => (
                        <div key={obs.id} className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                obs.observation_type === 'formal' 
                                  ? 'bg-[#2c3e7e] text-white' 
                                  : 'bg-gray-300 text-gray-700'
                              }`}>
                                {obs.observation_type}
                              </span>
                              <p className="text-sm text-[#666666] mt-1">
                                {formatDate(obs.scheduled_at)}
                                {obs.subject_topic && ` - ${obs.subject_topic}`}
                              </p>
                            </div>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              obs.status === 'completed' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {obs.status}
                            </span>
                          </div>
                          {obs.feedback && (
                            <p className="text-xs text-[#666666] mt-2 line-clamp-2">
                              {obs.feedback}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#666666] italic">No observations recorded yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Meeting Notes & Actions */}
          <div className="space-y-6">
            
            {/* Agenda */}
            {meeting.agenda && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-[#2c3e7e]">📋 Agenda</h3>
                </div>
                <div className="p-4">
                  <p className="text-sm text-[#666666] whitespace-pre-wrap">{meeting.agenda}</p>
                </div>
              </div>
            )}

            {/* Meeting Notes */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">📝 Meeting Notes</h3>
              </div>
              <div className="p-4">
                {isCompleted && isStaffView ? (
                  <p className="text-sm text-[#666666] whitespace-pre-wrap">
                    {notes || 'No notes recorded.'}
                  </p>
                ) : (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] text-sm"
                    rows="8"
                    placeholder="Discussion points, decisions made, key takeaways..."
                    disabled={isCompleted && !isEvaluator}
                  />
                )}
              </div>
            </div>

            {/* Action Items */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">✅ Action Items</h3>
              </div>
              <div className="p-4">
                {isCompleted && isStaffView ? (
                  <p className="text-sm text-[#666666] whitespace-pre-wrap">
                    {actionItems || 'No action items recorded.'}
                  </p>
                ) : (
                  <textarea
                    value={actionItems}
                    onChange={(e) => setActionItems(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] text-sm"
                    rows="5"
                    placeholder="• Action item 1 - Owner - Due date&#10;• Action item 2 - Owner - Due date"
                    disabled={isCompleted && !isEvaluator}
                  />
                )}
              </div>
            </div>

            {/* Save Button (for evaluator while meeting in progress) */}
            {!isCompleted && isEvaluator && !isStaffView && (
              <button
                onClick={handleSaveNotes}
                disabled={saving}
                className="w-full bg-[#477fc1] text-white py-3 rounded-lg hover:bg-[#3a6ca8] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Notes'}
              </button>
            )}

            {/* Sign-off Section */}
            {isCompleted && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-[#2c3e7e]">✍️ Sign-Off</h3>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#666666]">Evaluator</span>
                    {meeting.evaluator_signed_at ? (
                      <span className="text-green-600 text-sm">
                        ✓ Signed {formatDate(meeting.evaluator_signed_at)}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">Not signed</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#666666]">Staff Member</span>
                    {meeting.staff_signed_at ? (
                      <span className="text-green-600 text-sm">
                        ✓ Signed {formatDate(meeting.staff_signed_at)}
                      </span>
                    ) : isStaffView ? (
                      <button
                        onClick={handleStaffSignOff}
                        className="bg-[#2c3e7e] text-white px-3 py-1 rounded text-sm hover:bg-[#1e2a5e]"
                      >
                        Sign Off
                      </button>
                    ) : (
                      <span className="text-gray-400 text-sm">Awaiting signature</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Complete Meeting Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-xl font-bold text-[#2c3e7e] mb-4">Complete Meeting</h3>
              <p className="text-[#666666] mb-6">
                Are you sure you want to mark this meeting as complete? 
                This will save all notes and action items, and request the staff member's sign-off.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCompleteModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCompleteMeeting}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Completing...' : 'Complete Meeting'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MeetingSession
