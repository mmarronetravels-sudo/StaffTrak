import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

function MyObservations() {
  const { profile, signOut } = useAuth()
  const [observations, setObservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedObs, setSelectedObs] = useState(null)
  const [showPreForm, setShowPreForm] = useState(false)
  const [showPostForm, setShowPostForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [preForm, setPreForm] = useState({
    lesson_objective: '',
    standards_addressed: '',
    student_context: '',
    instructional_strategies: '',
    assessment_plan: '',
    support_needed: '',
    focus_areas: ''
  })

  const [postForm, setPostForm] = useState({
    lesson_reflection: '',
    student_engagement: '',
    what_worked: '',
    what_to_change: '',
    questions_for_evaluator: ''
  })

  useEffect(() => {
    if (profile) {
      fetchMyObservations()
    }
  }, [profile])

  const fetchMyObservations = async () => {
    const { data, error } = await supabase
      .from('observations')
      .select(`
        *,
        observer:observer_id (id, full_name)
      `)
      .eq('staff_id', profile.id)
      .order('scheduled_at', { ascending: true })

    if (!error) {
      setObservations(data || [])
    }
    setLoading(false)
  }

  const openPreForm = (obs) => {
    setSelectedObs(obs)
    if (obs.pre_observation_form) {
      setPreForm(obs.pre_observation_form)
    } else {
      setPreForm({
        lesson_objective: '',
        standards_addressed: '',
        student_context: '',
        instructional_strategies: '',
        assessment_plan: '',
        support_needed: '',
        focus_areas: ''
      })
    }
    setShowPreForm(true)
  }

  const openPostForm = (obs) => {
    setSelectedObs(obs)
    if (obs.post_observation_form) {
      setPostForm(obs.post_observation_form)
    } else {
      setPostForm({
        lesson_reflection: '',
        student_engagement: '',
        what_worked: '',
        what_to_change: '',
        questions_for_evaluator: ''
      })
    }
    setShowPostForm(true)
  }

  const savePreForm = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('observations')
      .update({
        pre_observation_form: preForm,
        pre_observation_submitted_at: new Date().toISOString()
      })
      .eq('id', selectedObs.id)

    if (!error) {
      setObservations(observations.map(o =>
        o.id === selectedObs.id
          ? { ...o, pre_observation_form: preForm, pre_observation_submitted_at: new Date().toISOString() }
          : o
      ))
      setShowPreForm(false)
      setSelectedObs(null)
    }
    setSaving(false)
  }

  const savePostForm = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('observations')
      .update({
        post_observation_form: postForm,
        post_observation_submitted_at: new Date().toISOString()
      })
      .eq('id', selectedObs.id)

    if (!error) {
      setObservations(observations.map(o =>
        o.id === selectedObs.id
          ? { ...o, post_observation_form: postForm, post_observation_submitted_at: new Date().toISOString() }
          : o
      ))
      setShowPostForm(false)
      setSelectedObs(null)
    }
    setSaving(false)
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Not scheduled'
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (obs) => {
    if (obs.status === 'completed') return { text: 'Completed', class: 'bg-green-100 text-green-800' }
    if (obs.status === 'in_progress') return { text: 'In Progress', class: 'bg-yellow-100 text-yellow-800' }
    if (obs.status === 'cancelled') return { text: 'Cancelled', class: 'bg-red-100 text-red-800' }
    return { text: 'Scheduled', class: 'bg-blue-100 text-blue-800' }
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const upcomingObs = observations.filter(o => o.status === 'scheduled' || o.status === 'in_progress')
  const completedObs = observations.filter(o => o.status === 'completed')

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-[#2c3e7e] mb-6">My Observations</h2>

        {loading ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-[#666666]">Loading...</p>
          </div>
        ) : (
          <>
            {/* Upcoming Observations */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-[#2c3e7e] mb-4">Upcoming Observations</h3>
              {upcomingObs.length === 0 ? (
                <div className="bg-white p-6 rounded-lg shadow text-center text-[#666666]">
                  No upcoming observations scheduled.
                </div>
              ) : (
                <div className="grid gap-4">
                  {upcomingObs.map(obs => (
                    <div key={obs.id} className="bg-white p-6 rounded-lg shadow">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`text-xs px-2 py-1 rounded ${obs.observation_type === 'formal' ? 'bg-[#2c3e7e] text-white' : 'bg-[#477fc1] text-white'}`}>
                              {obs.observation_type}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded ${getStatusBadge(obs).class}`}>
                              {getStatusBadge(obs).text}
                            </span>
                          </div>
                          <p className="text-[#666666]">Observer: <span className="font-medium text-[#2c3e7e]">{obs.observer?.full_name}</span></p>
                          <p className="text-sm text-[#666666] mt-1">📅 {formatDate(obs.scheduled_at)}</p>
                          {obs.location && <p className="text-sm text-[#666666]">📍 {obs.location}</p>}
                          {obs.subject_topic && <p className="text-sm text-[#666666]">📚 {obs.subject_topic}</p>}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-2">
                          {obs.observation_type === 'formal' && obs.status === 'scheduled' && (
                            <button
                              onClick={() => openPreForm(obs)}
                              className={`px-4 py-2 rounded-lg text-sm ${
                                obs.pre_observation_submitted_at
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-[#f3843e] text-white hover:bg-[#d9702f]'
                              }`}
                            >
                              {obs.pre_observation_submitted_at ? '✓ Pre-Obs Form Done' : 'Fill Pre-Obs Form'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Completed Observations */}
            <div>
              <h3 className="text-lg font-semibold text-[#2c3e7e] mb-4">Completed Observations</h3>
              {completedObs.length === 0 ? (
                <div className="bg-white p-6 rounded-lg shadow text-center text-[#666666]">
                  No completed observations yet.
                </div>
              ) : (
                <div className="grid gap-4">
                  {completedObs.map(obs => (
                    <div key={obs.id} className="bg-white p-6 rounded-lg shadow">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`text-xs px-2 py-1 rounded ${obs.observation_type === 'formal' ? 'bg-[#2c3e7e] text-white' : 'bg-[#477fc1] text-white'}`}>
                              {obs.observation_type}
                            </span>
                            <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800">Completed</span>
                          </div>
                          <p className="text-[#666666]">Observer: <span className="font-medium text-[#2c3e7e]">{obs.observer?.full_name}</span></p>
                          <p className="text-sm text-[#666666] mt-1">📅 {formatDate(obs.scheduled_at)}</p>

                          {obs.feedback && (
                            <div className="mt-3 p-3 bg-gray-50 rounded">
                              <p className="text-xs font-semibold text-[#2c3e7e] mb-1">Feedback:</p>
                              <p className="text-sm text-[#666666]">{obs.feedback}</p>
                            </div>
                          )}
                        </div>

                        {/* Post-Observation Form */}
                        <div className="flex flex-col gap-2">
                          {obs.observation_type === 'formal' && (
                            <button
                              onClick={() => openPostForm(obs)}
                              className={`px-4 py-2 rounded-lg text-sm ${
                                obs.post_observation_submitted_at
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-[#477fc1] text-white hover:bg-[#3a6ca8]'
                              }`}
                            >
                              {obs.post_observation_submitted_at ? '✓ Post-Obs Done' : 'Fill Post-Obs Form'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Pre-Observation Form Modal */}
      {showPreForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#2c3e7e]">Pre-Observation Form</h3>
                <button onClick={() => setShowPreForm(false)} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Lesson Objective *</label>
                  <textarea
                    value={preForm.lesson_objective}
                    onChange={(e) => setPreForm({...preForm, lesson_objective: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="2"
                    placeholder="What will students learn or be able to do?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Standards Addressed</label>
                  <textarea
                    value={preForm.standards_addressed}
                    onChange={(e) => setPreForm({...preForm, standards_addressed: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="2"
                    placeholder="Which content standards are addressed?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Student Context</label>
                  <textarea
                    value={preForm.student_context}
                    onChange={(e) => setPreForm({...preForm, student_context: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="2"
                    placeholder="Describe the class - size, relevant student needs, prior knowledge..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Instructional Strategies</label>
                  <textarea
                    value={preForm.instructional_strategies}
                    onChange={(e) => setPreForm({...preForm, instructional_strategies: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="2"
                    placeholder="What teaching strategies will you use?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Assessment Plan</label>
                  <textarea
                    value={preForm.assessment_plan}
                    onChange={(e) => setPreForm({...preForm, assessment_plan: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="2"
                    placeholder="How will you know students have learned?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Areas You'd Like Feedback On</label>
                  <textarea
                    value={preForm.focus_areas}
                    onChange={(e) => setPreForm({...preForm, focus_areas: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="2"
                    placeholder="What would you like the observer to focus on?"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowPreForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={savePreForm}
                  disabled={saving || !preForm.lesson_objective.trim()}
                  className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Submit Pre-Observation Form'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post-Observation Form Modal */}
      {showPostForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#2c3e7e]">Post-Observation Reflection</h3>
                <button onClick={() => setShowPostForm(false)} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Lesson Reflection *</label>
                  <textarea
                    value={postForm.lesson_reflection}
                    onChange={(e) => setPostForm({...postForm, lesson_reflection: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="3"
                    placeholder="How do you think the lesson went overall?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Student Engagement</label>
                  <textarea
                    value={postForm.student_engagement}
                    onChange={(e) => setPostForm({...postForm, student_engagement: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="2"
                    placeholder="How engaged were students? What evidence did you see?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">What Worked Well</label>
                  <textarea
                    value={postForm.what_worked}
                    onChange={(e) => setPostForm({...postForm, what_worked: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="2"
                    placeholder="What aspects of the lesson were successful?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">What Would You Change</label>
                  <textarea
                    value={postForm.what_to_change}
                    onChange={(e) => setPostForm({...postForm, what_to_change: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="2"
                    placeholder="If you taught this lesson again, what would you do differently?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">Questions for Your Evaluator</label>
                  <textarea
                    value={postForm.questions_for_evaluator}
                    onChange={(e) => setPostForm({...postForm, questions_for_evaluator: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    rows="2"
                    placeholder="Any questions or topics you'd like to discuss?"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowPostForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={savePostForm}
                  disabled={saving || !postForm.lesson_reflection.trim()}
                  className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Submit Post-Observation Reflection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MyObservations