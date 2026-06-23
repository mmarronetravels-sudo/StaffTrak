import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { notifyObservationScheduled } from '../services/emailService'
import { createNotification } from '../services/notificationService'
import { pacificInputToUTC } from '../lib/timezone'
import Navbar from '../components/Navbar'
import {
  OBSERVATION_TYPES,
  OBSERVATION_TYPE_ORDER,
  obsTypeLabel,
  formativeOnlyDefault,
} from '../lib/observationTypes'
import { feedbackTurnaround } from '../lib/feedbackTiming'

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
    is_formative_only: false,
    scheduled_at: '',
    location: '',
    subject_topic: ''
  })

  // Changing the type resets the formative flag to that type's default.
  const setObsType = (observation_type) =>
    setNewObservation(o => ({ ...o, observation_type, is_formative_only: formativeOnlyDefault(observation_type) }))

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
        is_formative_only: newObservation.is_formative_only,
        scheduled_at: pacificInputToUTC(newObservation.scheduled_at),
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
        is_formative_only: false,
        scheduled_at: '',
        location: '',
        subject_topic: ''
      })

      const obsDate = new Date(obs.scheduled_at)

      // Send email notification to staff (dedicated template)
      if (obs.staff?.email) {
        await notifyObservationScheduled({
          staffEmail: obs.staff.email,
          staffName: obs.staff.full_name,
          evaluatorName: profile.full_name,
          date: obsDate.toLocaleDateString(),
          time: obsDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: obsTypeLabel(obs.observation_type)
        })
      }

      // In-app notification to staff (email already sent above, so no dup).
      createNotification({
        userId: obs.staff_id,
        tenantId: profile.tenant_id,
        type: 'observation_scheduled',
        title: 'An observation has been scheduled',
        message: `${profile.full_name || 'Your evaluator'} scheduled a ${obsTypeLabel(obs.observation_type)} observation for ${obsDate.toLocaleDateString()}.`,
        relatedEntityType: 'observation',
        relatedEntityId: obs.id,
      })
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

  const cancelObservation = async (observation) => {
    const who = observation.staff?.full_name || 'this staff member'
    if (!confirm(
      `Cancel the ${obsTypeLabel(observation.observation_type)} observation for ${who}?\n\n` +
      `It will be removed from the calendar (including the staff member's Google Calendar). ` +
      `The record is kept and marked Cancelled.`
    )) return

    const { error } = await supabase
      .from('observations')
      .update({ status: 'cancelled' })
      .eq('id', observation.id)

    if (error) {
      alert(`Could not cancel: ${error.message}`)
      return
    }

    setObservations(prev =>
      prev.map(o => (o.id === observation.id ? { ...o, status: 'cancelled' } : o))
    )

    // Let the staff member know (best-effort; never blocks the cancel).
    createNotification({
      userId: observation.staff_id,
      tenantId: profile.tenant_id,
      type: 'observation_cancelled',
      title: 'An observation was cancelled',
      message: `${profile.full_name || 'Your evaluator'} cancelled the ${obsTypeLabel(observation.observation_type)} observation scheduled for ${formatDate(observation.scheduled_at)}.`,
      relatedEntityType: 'observation',
      relatedEntityId: observation.id,
    })
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
    if (type === 'formal') return 'bg-[#2c3e7e] text-white'
    if (type === 'informal') return 'bg-[#477fc1] text-white'
    return 'bg-sky-100 text-sky-700' // lightweight/formative types
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
                        {obsTypeLabel(observation.observation_type)}
                      </span>
                      {observation.is_formative_only && (
                        <span className="text-xs px-2 py-1 rounded bg-sky-50 text-sky-700 border border-sky-200">Formative only</span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded capitalize ${getStatusBadge(observation.status)}`}>
                        {observation.status?.replace('_', ' ')}
                      </span>
                      {observation.status === 'completed' && (() => {
                        const t = feedbackTurnaround(observation)
                        return t ? (
                          <span className={`text-xs px-2 py-1 rounded ${t.within24 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`} title={`Feedback delivered ${new Date(t.deliveredAt).toLocaleString()}`}>
                            ⏱ {t.label}{t.within24 ? ' ✓' : ''}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500">Feedback pending</span>
                        )
                      })()}
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
                      <>
                        <button
                          onClick={() => startObservation(observation)}
                          className="bg-[#f3843e] text-white px-4 py-2 rounded-lg hover:bg-[#d9702f]"
                        >
                          Start
                        </button>
                        <button
                          onClick={() => cancelObservation(observation)}
                          className="border border-red-300 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50"
                        >
                          Cancel
                        </button>
                      </>
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
                    <select
                      value={newObservation.observation_type}
                      onChange={(e) => setObsType(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    >
                      {OBSERVATION_TYPE_ORDER.map(t => (
                        <option key={t} value={t}>{OBSERVATION_TYPES[t].label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-[#666666] mt-1">
                      {OBSERVATION_TYPES[newObservation.observation_type]?.blurb}
                    </p>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newObservation.is_formative_only}
                        onChange={(e) => setNewObservation({...newObservation, is_formative_only: e.target.checked})}
                        className="rounded text-[#477fc1]"
                      />
                      <span className="text-sm text-[#666666]">
                        Formative only <span className="text-gray-400">— evidence for growth, not counted in the summative score</span>
                      </span>
                    </label>
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
