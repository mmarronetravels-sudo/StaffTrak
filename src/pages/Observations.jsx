import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { notifyObservationScheduled } from '../services/emailService'
import Navbar from '../components/Navbar'

function Observations() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [observations, setObservations] = useState([])
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [activeTab, setActiveTab] = useState('upcoming')
  const [newObservation, setNewObservation] = useState({
    staff_id: '',
    observation_type: 'informal',
    scheduled_at: '',
    location: '',
    subject_topic: ''
  })

  useEffect(() => {
    if (profile) {
      fetchObservations()
      fetchStaffList()
    }
  }, [profile])

  const fetchObservations = async () => {
    // Fetch observations where current user is the observer
    const { data, error } = await supabase
      .from('observations')
      .select(`
        *,
        staff:staff_id (id, full_name, position_type),
        observer:observer_id (id, full_name)
      `)
      .eq('observer_id', profile.id)
      .order('scheduled_at', { ascending: true })

    if (!error) {
      setObservations(data || [])
    }
    setLoading(false)
  }

  const fetchStaffList = async () => {
    // Fetch staff that this evaluator can observe
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, position_type, staff_type')
      .eq('tenant_id', profile.tenant_id)
      .in('role', ['licensed_staff', 'classified_staff'])
      .eq('is_active', true)
      .order('full_name', { ascending: true })

    if (!error) {
      setStaffList(data || [])
    }
  }

  const handleScheduleObservation = async (e) => {
    e.preventDefault()

    const { data, error } = await supabase
      .from('observations')
      .insert([{
        observer_id: profile.id,
        staff_id: newObservation.staff_id,
        observation_type: newObservation.observation_type,
        scheduled_at: newObservation.scheduled_at,
        location: newObservation.location,
        subject_topic: newObservation.subject_topic,
        status: 'scheduled'
      }])
      .select(`
        *,
        staff:staff_id (id, full_name, position_type, email),
        observer:observer_id (id, full_name)
      `)

    if (!error && data) {
      const obs = data[0]
      setObservations([...observations, obs])
      setShowScheduleModal(false)
      setNewObservation({
        staff_id: '',
        observation_type: 'informal',
        scheduled_at: '',
        location: '',
        subject_topic: ''
      })

      // Send email notification to staff
      if (obs.staff?.email) {
        const obsDate = new Date(obs.scheduled_at)
        await notifyObservationScheduled({
          staffEmail: obs.staff.email,
          staffName: obs.staff.full_name,
          evaluatorName: profile.full_name,
          date: obsDate.toLocaleDateString(),
          time: obsDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: obs.observation_type === 'formal' ? 'Formal' : 'Informal'
        })
      }
    }
  }

  const startObservation = async (observation) => {
    // Update status to in_progress and set start time
    const { error } = await supabase
      .from('observations')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .eq('id', observation.id)

    if (!error) {
      navigate(`/observations/${observation.id}`)
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800'
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeBadge = (type) => {
    return type === 'formal' 
      ? 'bg-[#2c3e7e] text-white' 
      : 'bg-[#477fc1] text-white'
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Not scheduled'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const filteredObservations = observations.filter(obs => {
    switch (activeTab) {
      case 'upcoming':
        return obs.status === 'scheduled' || obs.status === 'in_progress'
      case 'completed':
        return obs.status === 'completed'
      case 'all':
      default:
        return true
    }
  })

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-gray-100">
     <Navbar />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-[#2c3e7e]">Observations</h2>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#1e2a5e] flex items-center gap-2"
          >
            <span className="text-lg">+</span> Schedule Observation
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'upcoming'
                ? 'bg-[#2c3e7e] text-white'
                : 'bg-white text-[#666666] hover:bg-gray-50'
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'completed'
                ? 'bg-[#2c3e7e] text-white'
                : 'bg-white text-[#666666] hover:bg-gray-50'
            }`}
          >
            Completed
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'all'
                ? 'bg-[#2c3e7e] text-white'
                : 'bg-white text-[#666666] hover:bg-gray-50'
            }`}
          >
            All
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
            <p className="text-sm text-[#666666]">Scheduled</p>
            <p className="text-2xl font-bold text-[#2c3e7e]">
              {observations.filter(o => o.status === 'scheduled').length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
            <p className="text-sm text-[#666666]">In Progress</p>
            <p className="text-2xl font-bold text-[#2c3e7e]">
              {observations.filter(o => o.status === 'in_progress').length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
            <p className="text-sm text-[#666666]">Completed</p>
            <p className="text-2xl font-bold text-[#2c3e7e]">
              {observations.filter(o => o.status === 'completed').length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#f3843e]">
            <p className="text-sm text-[#666666]">This Month</p>
            <p className="text-2xl font-bold text-[#2c3e7e]">
              {observations.filter(o => {
                const obsDate = new Date(o.scheduled_at)
                const now = new Date()
                return obsDate.getMonth() === now.getMonth() && obsDate.getFullYear() === now.getFullYear()
              }).length}
            </p>
          </div>
        </div>

        {/* Observations List */}
        {loading ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-[#666666]">Loading observations...</p>
          </div>
        ) : filteredObservations.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-[#666666] mb-4">
              {activeTab === 'upcoming' 
                ? 'No upcoming observations scheduled.' 
                : activeTab === 'completed'
                ? 'No completed observations yet.'
                : 'No observations found.'}
            </p>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#1e2a5e]"
            >
              Schedule Observation
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredObservations.map(observation => (
              <div
                key={observation.id}
                className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg text-[#2c3e7e]">
                        {observation.staff?.full_name || 'Unknown Staff'}
                      </h3>
                      <span className={`text-xs px-2 py-1 rounded ${getTypeBadge(observation.observation_type)}`}>
                        {observation.observation_type}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded capitalize ${getStatusBadge(observation.status)}`}>
                        {observation.status?.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-[#666666]">
                      {observation.staff?.position_type || 'Staff Member'}
                    </p>
                    <div className="flex gap-6 mt-3 text-sm text-[#666666]">
                      <div className="flex items-center gap-1">
                        <span>📅</span>
                        <span>{formatDate(observation.scheduled_at)}</span>
                      </div>
                      {observation.location && (
                        <div className="flex items-center gap-1">
                          <span>📍</span>
                          <span>{observation.location}</span>
                        </div>
                      )}
                      {observation.subject_topic && (
                        <div className="flex items-center gap-1">
                          <span>📚</span>
                          <span>{observation.subject_topic}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {observation.status === 'scheduled' && (
                      <button
                        onClick={() => startObservation(observation)}
                        className="bg-[#f3843e] text-white px-4 py-2 rounded-lg hover:bg-[#d9702f]"
                      >
                        Start
                      </button>
                    )}
                    {observation.status === 'in_progress' && (
                      <button
                        onClick={() => navigate(`/observations/${observation.id}`)}
                        className="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600"
                      >
                        Continue
                      </button>
                    )}
                    {observation.status === 'completed' && (
                      <button
                        onClick={() => navigate(`/observations/${observation.id}`)}
                        className="bg-[#477fc1] text-white px-4 py-2 rounded-lg hover:bg-[#3a6ca8]"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Schedule Observation Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#2c3e7e]">Schedule Observation</h3>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleScheduleObservation}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Staff Member *
                    </label>
                    <select
                      value={newObservation.staff_id}
                      onChange={(e) => setNewObservation({...newObservation, staff_id: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      required
                    >
                      <option value="">Select a staff member...</option>
                      {staffList.map(staff => (
                        <option key={staff.id} value={staff.id}>
                          {staff.full_name} - {staff.position_type || staff.staff_type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Observation Type *
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="observation_type"
                          value="informal"
                          checked={newObservation.observation_type === 'informal'}
                          onChange={(e) => setNewObservation({...newObservation, observation_type: e.target.value})}
                          className="text-[#477fc1]"
                        />
                        <span className="text-[#666666]">Informal</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="observation_type"
                          value="formal"
                          checked={newObservation.observation_type === 'formal'}
                          onChange={(e) => setNewObservation({...newObservation, observation_type: e.target.value})}
                          className="text-[#2c3e7e]"
                        />
                        <span className="text-[#666666]">Formal</span>
                      </label>
                    </div>
                    <p className="text-xs text-[#666666] mt-1">
                      {newObservation.observation_type === 'formal' 
                        ? 'Formal observations include pre-observation and post-observation forms.'
                        : 'Informal observations are shorter drop-in visits.'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Date & Time *
                    </label>
                    <input
                      type="datetime-local"
                      value={newObservation.scheduled_at}
                      onChange={(e) => setNewObservation({...newObservation, scheduled_at: e.target.value})}
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
                      value={newObservation.location}
                      onChange={(e) => setNewObservation({...newObservation, location: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      placeholder="e.g., Room 201, Google Meet, Zoom"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Subject / Topic
                    </label>
                    <input
                      type="text"
                      value={newObservation.subject_topic}
                      onChange={(e) => setNewObservation({...newObservation, subject_topic: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      placeholder="e.g., Math - Fractions, ELA - Essay Writing"
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
                    Schedule
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

export default Observations
