import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

function Meetings() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [meetings, setMeetings] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [filter, setFilter] = useState('all')
  const [newMeeting, setNewMeeting] = useState({
    staff_id: '',
    meeting_type: 'initial_goals',
    scheduled_at: '',
    location: '',
    agenda: ''
  })

  useEffect(() => {
    if (profile) {
      fetchMeetings()
      fetchStaff()
    }
  }, [profile])

  const fetchMeetings = async () => {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        staff:staff_id (id, full_name, position_type),
        evaluator:evaluator_id (id, full_name)
      `)
      .eq('evaluator_id', profile.id)
      .order('scheduled_at', { ascending: true })

    if (!error) {
      setMeetings(data || [])
    }
    setLoading(false)
  }

  const fetchStaff = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, position_type, staff_type')
      .eq('evaluator_id', profile.id)
      .eq('is_active', true)
      .order('full_name')

    if (!error) {
      setStaff(data || [])
    }
  }

  const handleScheduleMeeting = async (e) => {
    e.preventDefault()
    
    const { data, error } = await supabase
      .from('meetings')
      .insert([{
        staff_id: newMeeting.staff_id,
        evaluator_id: profile.id,
        meeting_type: newMeeting.meeting_type,
        scheduled_at: newMeeting.scheduled_at,
        location: newMeeting.location,
        agenda: newMeeting.agenda,
        status: 'scheduled'
      }])
      .select(`
        *,
        staff:staff_id (id, full_name, position_type),
        evaluator:evaluator_id (id, full_name)
      `)

    if (!error && data) {
      setMeetings([...meetings, data[0]])
      setShowScheduleModal(false)
      setNewMeeting({
        staff_id: '',
        meeting_type: 'initial_goals',
        scheduled_at: '',
        location: '',
        agenda: ''
      })
    }
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

  const getMeetingTypeBadgeColor = (type) => {
    switch(type) {
      case 'initial_goals': return 'bg-[#2c3e7e]'
      case 'mid_year_review': return 'bg-[#477fc1]'
      case 'end_year_review': return 'bg-[#f3843e]'
      case 'post_observation': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusBadge = (meeting) => {
    if (meeting.completed_at) {
      return { class: 'bg-green-100 text-green-800', label: 'Completed' }
    }
    if (meeting.status === 'in_progress') {
      return { class: 'bg-blue-100 text-blue-800', label: 'In Progress' }
    }
    const meetingDate = new Date(meeting.scheduled_at)
    const now = new Date()
    if (meetingDate < now) {
      return { class: 'bg-yellow-100 text-yellow-800', label: 'Overdue' }
    }
    return { class: 'bg-gray-100 text-gray-800', label: 'Scheduled' }
  }

  const formatDateTime = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const filteredMeetings = meetings.filter(m => {
    if (filter === 'all') return true
    if (filter === 'upcoming') return !m.completed_at && new Date(m.scheduled_at) >= new Date()
    if (filter === 'completed') return m.completed_at
    return m.meeting_type === filter
  })

  const stats = {
    total: meetings.length,
    upcoming: meetings.filter(m => !m.completed_at && new Date(m.scheduled_at) >= new Date()).length,
    completed: meetings.filter(m => m.completed_at).length,
    thisWeek: meetings.filter(m => {
      const meetingDate = new Date(m.scheduled_at)
      const now = new Date()
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      return meetingDate >= now && meetingDate <= weekFromNow && !m.completed_at
    }).length
  }

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
              <a href="/staff" className="text-white hover:text-gray-200">Staff</a>
              <a href="/observations" className="text-white hover:text-gray-200">Observations</a>
              <a href="/meetings" className="text-white hover:text-gray-200 font-semibold">Meetings</a>
              <a href="/goal-approvals" className="text-white hover:text-gray-200">Goal Approvals</a>
              <a href="/rubrics" className="text-white hover:text-gray-200">Rubrics</a>
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
          <h2 className="text-2xl font-bold text-[#2c3e7e]">Meetings</h2>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#1e2a5e]"
          >
            + Schedule Meeting
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#2c3e7e]">
            <p className="text-[#666666] text-sm">Total Meetings</p>
            <p className="text-2xl font-bold text-[#2c3e7e]">{stats.total}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#477fc1]">
            <p className="text-[#666666] text-sm">Upcoming</p>
            <p className="text-2xl font-bold text-[#477fc1]">{stats.upcoming}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
            <p className="text-[#666666] text-sm">Completed</p>
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#f3843e]">
            <p className="text-[#666666] text-sm">This Week</p>
            <p className="text-2xl font-bold text-[#f3843e]">{stats.thisWeek}</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { value: 'all', label: 'All' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'completed', label: 'Completed' },
            { value: 'initial_goals', label: 'Initial Goals' },
            { value: 'mid_year_review', label: 'Mid-Year' },
            { value: 'end_year_review', label: 'End-of-Year' }
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
            <p className="text-[#666666] mb-4">No meetings found.</p>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#1e2a5e]"
            >
              Schedule Your First Meeting
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredMeetings.map(meeting => {
              const status = getStatusBadge(meeting)
              return (
                <div key={meeting.id} className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-[#2c3e7e] text-lg">
                          {meeting.staff?.full_name}
                        </h3>
                        <span className={`text-white text-xs px-2 py-1 rounded ${getMeetingTypeBadgeColor(meeting.meeting_type)}`}>
                          {getMeetingTypeLabel(meeting.meeting_type)}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${status.class}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="text-sm text-[#666666] space-y-1">
                        <p>📅 {formatDateTime(meeting.scheduled_at)}</p>
                        {meeting.location && <p>📍 {meeting.location}</p>}
                        {meeting.staff?.position_type && (
                          <p className="capitalize">👤 {meeting.staff.position_type}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {meeting.completed_at ? (
                        <button
                          onClick={() => navigate(`/meetings/${meeting.id}`)}
                          className="bg-gray-100 text-[#666666] px-4 py-2 rounded-lg hover:bg-gray-200"
                        >
                          View
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/meetings/${meeting.id}`)}
                          className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#1e2a5e]"
                        >
                          {meeting.status === 'in_progress' ? 'Continue' : 'Start'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#2c3e7e]">Schedule Meeting</h3>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleScheduleMeeting}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Staff Member
                    </label>
                    <select
                      value={newMeeting.staff_id}
                      onChange={(e) => setNewMeeting({...newMeeting, staff_id: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      required
                    >
                      <option value="">Select staff member...</option>
                      {staff.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({s.position_type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Meeting Type
                    </label>
                    <select
                      value={newMeeting.meeting_type}
                      onChange={(e) => setNewMeeting({...newMeeting, meeting_type: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      required
                    >
                      <option value="initial_goals">Initial Goals Meeting</option>
                      <option value="mid_year_review">Mid-Year Review</option>
                      <option value="end_year_review">End-of-Year Review</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={newMeeting.scheduled_at}
                      onChange={(e) => setNewMeeting({...newMeeting, scheduled_at: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={newMeeting.location}
                      onChange={(e) => setNewMeeting({...newMeeting, location: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      placeholder="e.g., Room 101, Zoom, Google Meet"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Agenda (Optional)
                    </label>
                    <textarea
                      value={newMeeting.agenda}
                      onChange={(e) => setNewMeeting({...newMeeting, agenda: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      rows="3"
                      placeholder="Topics to discuss..."
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e]"
                  >
                    Schedule Meeting
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Meetings
