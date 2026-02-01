import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

function GoalApprovals() {
  const { profile, signOut, isEvaluator } = useAuth()
  const [pendingGoals, setPendingGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedGoal, setSelectedGoal] = useState(null)
  const [feedback, setFeedback] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (profile && isEvaluator) {
      fetchPendingGoals()
    }
  }, [profile])

  const fetchPendingGoals = async () => {
    // Get all staff assigned to this evaluator
    const { data: staffList } = await supabase
      .from('profiles')
      .select('id')
      .eq('evaluator_id', profile.id)

    if (!staffList || staffList.length === 0) {
      setLoading(false)
      return
    }

    const staffIds = staffList.map(s => s.id)

    // Get submitted goals from those staff members
    const { data: goals, error } = await supabase
      .from('goals')
      .select(`
        *,
        staff:staff_id (id, full_name, position_type, staff_type)
      `)
      .in('staff_id', staffIds)
      .eq('status', 'submitted')
      .order('created_at', { ascending: true })

    if (!error) {
      setPendingGoals(goals || [])
    }
    setLoading(false)
  }

  const handleApprove = async (goal) => {
    setProcessing(true)

    const { error } = await supabase
      .from('goals')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: profile.id,
        evaluator_feedback: feedback || null
      })
      .eq('id', goal.id)

    if (!error) {
      setPendingGoals(pendingGoals.filter(g => g.id !== goal.id))
      setSelectedGoal(null)
      setFeedback('')
    }
    setProcessing(false)
  }

  const handleRequestRevision = async (goal) => {
    if (!feedback.trim()) {
      alert('Please provide feedback explaining what needs to be revised.')
      return
    }

    setProcessing(true)

    const { error } = await supabase
      .from('goals')
      .update({
        status: 'draft',
        evaluator_feedback: feedback
      })
      .eq('id', goal.id)

    if (!error) {
      setPendingGoals(pendingGoals.filter(g => g.id !== goal.id))
      setSelectedGoal(null)
      setFeedback('')
    }
    setProcessing(false)
  }

  const getGoalTypeLabel = (type) => {
    switch(type) {
      case 'slg': return 'Student Learning Goal'
      case 'pgg': return 'Professional Growth Goal'
      case 'improvement': return 'Improvement Goal'
      default: return type
    }
  }

  const getGoalTypeBadgeColor = (type) => {
    switch(type) {
      case 'slg': return 'bg-[#477fc1]'
      case 'pgg': return 'bg-[#2c3e7e]'
      case 'improvement': return 'bg-[#f3843e]'
      default: return 'bg-gray-500'
    }
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
              <a href="/rubrics" className="text-white hover:text-gray-200">Rubrics</a>
              <a href="/goals" className="text-white hover:text-gray-200">Goals</a>
              <a href="/goal-approvals" className="text-white hover:text-gray-200 font-semibold">Goal Approvals</a>
              <a href="/observations" className="text-white hover:text-gray-200">Observations</a>
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
          <div>
            <h2 className="text-2xl font-bold text-[#2c3e7e]">Goal Approvals</h2>
            <p className="text-[#666666]">Review and approve staff goals</p>
          </div>
          <div className="bg-[#f3843e] text-white px-4 py-2 rounded-lg">
            {pendingGoals.length} Pending
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-[#666666]">Loading pending goals...</p>
          </div>
        ) : pendingGoals.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-[#666666]">No goals pending approval.</p>
            <p className="text-sm text-[#666666] mt-2">Goals submitted by your staff will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {pendingGoals.map(goal => (
              <div key={goal.id} className="bg-white rounded-lg shadow">
                {/* Goal Header */}
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-[#666666]">From:</span>
                        <span className="font-medium text-[#2c3e7e]">{goal.staff?.full_name}</span>
                        <span className="text-sm text-[#666666]">({goal.staff?.position_type})</span>
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg text-[#2c3e7e]">{goal.title}</h3>
                        <span className={`text-white text-xs px-2 py-1 rounded ${getGoalTypeBadgeColor(goal.goal_type)}`}>
                          {getGoalTypeLabel(goal.goal_type)}
                        </span>
                      </div>
                      {goal.description && (
                        <p className="text-sm text-[#666666]">{goal.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedGoal(selectedGoal?.id === goal.id ? null : goal)}
                      className="text-[#477fc1] hover:underline"
                    >
                      {selectedGoal?.id === goal.id ? 'Hide Details' : 'Review'}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {selectedGoal?.id === goal.id && (
                  <div className="px-6 pb-6 border-t border-gray-100">
                    <div className="grid gap-4 mt-4">
                      {goal.content_standards && (
                        <div>
                          <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">Content Standard(s)/Skill(s)</h4>
                          <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded">{goal.content_standards}</p>
                        </div>
                      )}

                      {goal.assessments && (
                        <div>
                          <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">Assessments</h4>
                          <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded">{goal.assessments}</p>
                        </div>
                      )}

                      {goal.context_students && (
                        <div>
                          <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">Context / Students</h4>
                          <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded">{goal.context_students}</p>
                        </div>
                      )}

                      {goal.baseline_data && (
                        <div>
                          <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">Baseline Data</h4>
                          <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded">{goal.baseline_data}</p>
                        </div>
                      )}

                      {goal.target_data && (
                        <div>
                          <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">SMART Growth Goal (Target)</h4>
                          <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded">{goal.target_data}</p>
                        </div>
                      )}

                      {goal.rationale && (
                        <div>
                          <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">Rationale</h4>
                          <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded">{goal.rationale}</p>
                        </div>
                      )}

                      {goal.strategies && (
                        <div>
                          <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">Strategies</h4>
                          <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded">{goal.strategies}</p>
                        </div>
                      )}

                      {goal.professional_learning && (
                        <div>
                          <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">Professional Learning and Support</h4>
                          <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded">{goal.professional_learning}</p>
                        </div>
                      )}
                    </div>

                    {/* Feedback & Actions */}
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <label className="block text-sm font-semibold text-[#2c3e7e] mb-2">
                        Feedback (optional for approval, required for revision)
                      </label>
                      <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] mb-4"
                        rows="3"
                        placeholder="Provide feedback to the staff member..."
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleApprove(goal)}
                          disabled={processing}
                          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          {processing ? 'Processing...' : '✓ Approve Goal'}
                        </button>
                        <button
                          onClick={() => handleRequestRevision(goal)}
                          disabled={processing}
                          className="flex-1 px-4 py-2 bg-[#f3843e] text-white rounded-lg hover:bg-[#d9702f] disabled:opacity-50"
                        >
                          {processing ? 'Processing...' : '↩ Request Revision'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default GoalApprovals