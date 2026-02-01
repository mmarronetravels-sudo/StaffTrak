import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

function Summatives() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [staff, setStaff] = useState([])
  const [evaluations, setEvaluations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (profile) {
      fetchData()
    }
  }, [profile])

  const fetchData = async () => {
    // Fetch staff assigned to this evaluator
    const { data: staffData } = await supabase
      .from('profiles')
      .select('*')
      .eq('evaluator_id', profile.id)
      .eq('is_active', true)
      .order('full_name')

    if (staffData) {
      setStaff(staffData)
      
      // Fetch existing evaluations for these staff
      const staffIds = staffData.map(s => s.id)
      if (staffIds.length > 0) {
        const { data: evalData } = await supabase
          .from('summative_evaluations')
          .select('*')
          .in('staff_id', staffIds)
          .eq('evaluator_id', profile.id)

        if (evalData) {
          setEvaluations(evalData)
        }
      }
    }

    setLoading(false)
  }

  const getEvaluationForStaff = (staffId) => {
    return evaluations.find(e => e.staff_id === staffId)
  }

  const getStatusInfo = (evaluation) => {
    if (!evaluation) {
      return { label: 'Not Started', class: 'bg-gray-100 text-gray-600', icon: '○' }
    }
    switch (evaluation.status) {
      case 'draft':
        return { label: 'Draft', class: 'bg-yellow-100 text-yellow-800', icon: '📝' }
      case 'pending_staff_signature':
        return { label: 'Awaiting Signature', class: 'bg-blue-100 text-blue-800', icon: '⏳' }
      case 'completed':
        return { label: 'Completed', class: 'bg-green-100 text-green-800', icon: '✓' }
      default:
        return { label: 'Unknown', class: 'bg-gray-100 text-gray-600', icon: '?' }
    }
  }

  const getRatingColor = (rating) => {
    switch (rating) {
      case 'Highly Effective': return 'text-green-600'
      case 'Effective': return 'text-blue-600'
      case 'Developing': return 'text-yellow-600'
      case 'Needs Improvement': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const filteredStaff = staff.filter(s => {
    const evaluation = getEvaluationForStaff(s.id)
    if (filter === 'all') return true
    if (filter === 'not_started') return !evaluation
    if (filter === 'in_progress') return evaluation?.status === 'draft'
    if (filter === 'pending') return evaluation?.status === 'pending_staff_signature'
    if (filter === 'completed') return evaluation?.status === 'completed'
    return true
  })

  const stats = {
    total: staff.length,
    notStarted: staff.filter(s => !getEvaluationForStaff(s.id)).length,
    inProgress: evaluations.filter(e => e.status === 'draft').length,
    pending: evaluations.filter(e => e.status === 'pending_staff_signature').length,
    completed: evaluations.filter(e => e.status === 'completed').length
  }

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
          <h2 className="text-2xl font-bold text-[#2c3e7e]">Summative Evaluations</h2>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#2c3e7e]">
            <p className="text-[#666666] text-sm">Total Staff</p>
            <p className="text-2xl font-bold text-[#2c3e7e]">{stats.total}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-gray-400">
            <p className="text-[#666666] text-sm">Not Started</p>
            <p className="text-2xl font-bold text-gray-600">{stats.notStarted}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
            <p className="text-[#666666] text-sm">In Progress</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.inProgress}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
            <p className="text-[#666666] text-sm">Awaiting Signature</p>
            <p className="text-2xl font-bold text-blue-600">{stats.pending}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
            <p className="text-[#666666] text-sm">Completed</p>
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { value: 'all', label: 'All Staff' },
            { value: 'not_started', label: 'Not Started' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'pending', label: 'Awaiting Signature' },
            { value: 'completed', label: 'Completed' }
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

        {/* Staff List */}
        {loading ? (
          <p className="text-[#666666]">Loading...</p>
        ) : filteredStaff.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <p className="text-[#666666]">
              {filter === 'all' 
                ? 'No staff members assigned to you.' 
                : 'No staff members match this filter.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredStaff.map(member => {
              const evaluation = getEvaluationForStaff(member.id)
              const status = getStatusInfo(evaluation)
              
              return (
                <div key={member.id} className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-[#2c3e7e] text-lg">
                          {member.full_name}
                        </h3>
                        <span className={`text-xs px-2 py-1 rounded ${status.class}`}>
                          {status.icon} {status.label}
                        </span>
                      </div>
                      <p className="text-sm text-[#666666] capitalize">
                        {member.position_type} • {member.staff_type} Staff
                      </p>
                      
                      {/* Show score if exists */}
                      {evaluation?.overall_score && (
                        <div className="mt-2 flex items-center gap-4">
                          <span className="text-sm text-[#666666]">
                            Score: <strong className="text-[#2c3e7e]">{evaluation.overall_score}</strong>
                          </span>
                          <span className={`text-sm font-medium ${getRatingColor(evaluation.overall_rating)}`}>
                            {evaluation.overall_rating}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/summatives/${member.id}`)}
                        className={`px-4 py-2 rounded-lg ${
                          evaluation?.status === 'completed'
                            ? 'bg-gray-100 text-[#666666] hover:bg-gray-200'
                            : 'bg-[#2c3e7e] text-white hover:bg-[#1e2a5e]'
                        }`}
                      >
                        {!evaluation ? 'Start Evaluation' :
                         evaluation.status === 'draft' ? 'Continue' :
                         evaluation.status === 'completed' ? 'View' : 'View'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 p-4 rounded-lg">
          <h3 className="font-semibold text-[#2c3e7e] mb-2">📋 Summative Evaluation Process</h3>
          <ol className="text-sm text-[#666666] space-y-1 list-decimal list-inside">
            <li>Review staff member's goals, observations, and self-reflection</li>
            <li>Score each rubric domain (1-4)</li>
            <li>Add narrative feedback (strengths, growth areas, support needed)</li>
            <li>Sign and send to staff member for review</li>
            <li>Staff adds comments (optional) and signs</li>
            <li>Evaluation complete!</li>
          </ol>
        </div>
      </main>
    </div>
  )
}

export default Summatives
