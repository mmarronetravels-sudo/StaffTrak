import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

function MyMeetings() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('upcoming')

  useEffect(() => {
    if (profile) {
      fetchMeetings()
    }
  }, [profile])

  const fetchMeetings = async () => {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        evaluator:evaluator_id (id, full_name)
      `)
      .eq('staff_id', profile.id)
      .order('scheduled_at', { ascending: true })

    if (!error) {
      setMeetings(data || [])
    }
    setLoading(false)
  }

  const getMeetingTypeLabel = (type) => {
    switch(type) {
      case 'initial_goals': return 'Initial Goals Meeting'
      case 'mid_year_review': return 'Mid-Year Review'
      case 'end_year_review': return 'End-of-Year Review'
      case 'post_observation': return 'Post-Observation'
      default: return type
    }
  }

  const getMeetingTypeDescription = (type) => {
    switch(type) {
      case 'initial_goals': return 'Discuss self-reflection results and finalize your goals for the year.'
      case 'mid_year_review': return 'Review goal progress, discuss observations, and adjust strategies as needed.'
      case 'end_year_review': return 'Final review of goal outcomes before summative evaluation.'
      default: return ''
    }
  }

  const getMeetingTypeBadgeColor = (type) => {
    switch(type) {
      case 'initial_goals': return 'bg-[#2c3e7e]'
      case 'mid_year_review': return 'bg-[#477fc1]'
      case 'end_year_review': return 'bg-[#f3843e]'
      case 'post_observation': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusInfo = (meeting) => {
    if (meeting.completed_at) {
      return { 
        class: 'bg-green-100 text-green-800', 
        label: 'Completed',
        icon: '✅'
      }
    }
    const meetingDate = new Date(meeting.scheduled_at)
    const now = new Date()
    if (meetingDate < now) {
      return { 
        class: 'bg-yellow-100 text-yellow-800', 
        label: 'Pending',
        icon: '⏳'
      }
    }
    return { 
      class: 'bg-blue-100 text-blue-800', 
      label: 'Scheduled',
      icon: '📅'
    }
  }

  const formatDateTime = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getTimeUntil = (dateStr) => {
    const meetingDate = new Date(dateStr)
    const now = new Date()
    const diff = meetingDate - now
    
    if (diff < 0) return null
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}`
    if (hours > 0) return `in ${hours} hour${hours > 1 ? 's' : ''}`
    return 'starting soon'
  }

  const filteredMeetings = meetings.filter(m => {
    if (filter === 'upcoming') return !m.completed_at
    if (filter === 'completed') return m.completed_at
    return true
  })

  const upcomingMeetings = meetings.filter(m => !m.completed_at)
  const completedMeetings = meetings.filter(m => m.completed_at)

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Navigation */}
      <nav className="bg-[#2c3e7e] shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-white">StaffTrak</h1>
            <div className="flex gap-4">
              <a href="/dashboard" className="text-white hover:text-gray-200">Dashboard</a>
              <a href="/self-reflection" className="text-white hover:text-gray-200">Self-Reflection</a>
              <a href="/goals" className="text-white hover:text-gray-200">My Goals</a>
              <a href="/my-observations" className="text-white hover:text-gray-200">My Observations</a>
              <a href="/my-meetings" className="text-white hover:text-gray-200 font-semibold">My Meetings</a>
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
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-[#2c3e7e] mb-6">My Meetings</h2>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#477fc1]">
            <p className="text-[#666666] text-sm">Upcoming Meetings</p>
            <p className="text-2xl font-bold text-[#477fc1]">{upcomingMeetings.length}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
            <p className="text-[#666666] text-sm">Completed Meetings</p>
            <p className="text-2xl font-bold text-green-600">{completedMeetings.length}</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'completed', label: 'Completed' },
            { value: 'all', label: 'All' }
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === tab.value
                  ? 'bg-[#2c3e7e] text-white'
                  : 'bg-white text-[#666666] hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Meetings List */}
        {loading ? (
          <p className="text-[#666666]">Loading meetings...</p>
        ) : filteredMeetings.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <p className="text-[#666666]">
              {filter === 'upcoming' 
                ? 'No upcoming meetings scheduled.' 
                : filter === 'completed'
                ? 'No completed meetings yet.'
                : 'No meetings found.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMeetings.map(meeting => {
              const status = getStatusInfo(meeting)
              const timeUntil = !meeting.completed_at ? getTimeUntil(meeting.scheduled_at) : null
              
              return (
                <div key={meeting.id} className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`text-white text-xs px-2 py-1 rounded ${getMeetingTypeBadgeColor(meeting.meeting_type)}`}>
                            {getMeetingTypeLabel(meeting.meeting_type)}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${status.class}`}>
                            {status.icon} {status.label}
                          </span>
                          {timeUntil && (
                            <span className="text-sm text-[#477fc1] font-medium">
                              {timeUntil}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[#666666]">
                          {getMeetingTypeDescription(meeting.meeting_type)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-[#666666]">
                          <span className="font-medium">📅 When:</span> {formatDateTime(meeting.scheduled_at)}
                        </p>
                        {meeting.location && (
                          <p className="text-[#666666] mt-1">
                            <span className="font-medium">📍 Where:</span> {meeting.location}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[#666666]">
                          <span className="font-medium">👤 With:</span> {meeting.evaluator?.full_name}
                        </p>
                      </div>
                    </div>

                    {meeting.agenda && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm font-medium text-[#2c3e7e] mb-1">Agenda:</p>
                        <p className="text-sm text-[#666666]">{meeting.agenda}</p>
                      </div>
                    )}

                    {/* Action Items from completed meeting */}
                    {meeting.completed_at && meeting.action_items && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm font-medium text-[#2c3e7e] mb-1">Action Items:</p>
                        <p className="text-sm text-[#666666] whitespace-pre-wrap">{meeting.action_items}</p>
                      </div>
                    )}

                    {/* Meeting Notes from completed meeting */}
                    {meeting.completed_at && meeting.notes && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm font-medium text-[#2c3e7e] mb-1">Meeting Notes:</p>
                        <p className="text-sm text-[#666666] whitespace-pre-wrap">{meeting.notes}</p>
                      </div>
                    )}

                    {/* Sign-off status */}
                    {meeting.completed_at && (
                      <div className="mt-4 pt-4 border-t border-gray-100 flex gap-4">
                        <div className="flex items-center gap-2">
                          {meeting.evaluator_signed_at ? (
                            <span className="text-green-600 text-sm">✓ Evaluator signed</span>
                          ) : (
                            <span className="text-gray-400 text-sm">○ Evaluator not signed</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {meeting.staff_signed_at ? (
                            <span className="text-green-600 text-sm">✓ You signed</span>
                          ) : (
                            <button
                              onClick={() => navigate(`/my-meetings/${meeting.id}`)}
                              className="text-[#477fc1] text-sm hover:underline"
                            >
                              Sign off on this meeting →
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* View Details Button */}
                  <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
                    <button
                      onClick={() => navigate(`/my-meetings/${meeting.id}`)}
                      className="text-[#477fc1] text-sm font-medium hover:underline"
                    >
                      View Full Details →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Preparation Tips */}
        {filter === 'upcoming' && upcomingMeetings.length > 0 && (
          <div className="mt-8 bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <h3 className="font-semibold text-[#2c3e7e] mb-2">📝 Prepare for Your Meeting</h3>
            <ul className="text-sm text-[#666666] space-y-1">
              <li>• Complete your self-reflection if you haven't already</li>
              <li>• Review your goals and note any questions</li>
              <li>• Gather evidence of progress on your goals</li>
              <li>• Think about areas where you'd like support</li>
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}

export default MyMeetings
