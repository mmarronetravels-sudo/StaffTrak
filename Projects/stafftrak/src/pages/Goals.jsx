import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

function Goals() {
  const { user, profile, signOut } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedGoal, setExpandedGoal] = useState(null)
  const [newGoal, setNewGoal] = useState({
    goal_type: 'slg',
    title: '',
    description: '',
    content_standards: '',
    assessments: '',
    context_students: '',
    baseline_data: '',
    target_data: '',
    rationale: '',
    strategies: '',
    professional_learning: ''
  })

  useEffect(() => {
    if (profile) {
      fetchGoals()
    }
  }, [profile])

  const fetchGoals = async () => {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('staff_id', profile.id)
      .order('created_at', { ascending: false })

    if (!error) {
      setGoals(data)
    }
    setLoading(false)
  }

  const handleAddGoal = async (e) => {
    e.preventDefault()
    
    const { data, error } = await supabase
      .from('goals')
      .insert([{
        staff_id: profile.id,
        goal_type: newGoal.goal_type,
        title: newGoal.title,
        description: newGoal.description,
        content_standards: newGoal.content_standards,
        assessments: newGoal.assessments,
        context_students: newGoal.context_students,
        baseline_data: newGoal.baseline_data,
        target_data: newGoal.target_data,
        rationale: newGoal.rationale,
        strategies: newGoal.strategies,
        professional_learning: newGoal.professional_learning,
        status: 'draft'
      }])
      .select()

    if (!error) {
      setGoals([data[0], ...goals])
      setShowAddModal(false)
      setNewGoal({
        goal_type: 'slg',
        title: '',
        description: '',
        content_standards: '',
        assessments: '',
        context_students: '',
        baseline_data: '',
        target_data: '',
        rationale: '',
        strategies: '',
        professional_learning: ''
      })
    }
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

  const getStatusBadge = (status) => {
    switch(status) {
      case 'draft': return 'bg-gray-200 text-gray-700'
      case 'submitted': return 'bg-yellow-100 text-yellow-800'
      case 'approved': return 'bg-green-100 text-green-800'
      case 'in_progress': return 'bg-blue-100 text-blue-800'
      case 'completed': return 'bg-green-200 text-green-900'
      default: return 'bg-gray-200 text-gray-700'
    }
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const toggleGoalExpand = (goalId) => {
    setExpandedGoal(expandedGoal === goalId ? null : goalId)
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
              <a href="/goals" className="text-white hover:text-gray-200 font-semibold">Goals</a>
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
          <h2 className="text-2xl font-bold text-[#2c3e7e]">My Goals</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#1e2a5e]"
          >
            + New Goal
          </button>
        </div>

        {/* Goal Requirements Info */}
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
          <p className="text-sm text-blue-800">
            <strong>Required Goals:</strong> {profile?.staff_type === 'licensed' 
              ? '2 Student Learning Goals (SLGs) + 1 Professional Growth Goal (PGG)' 
              : '1 Professional Practice Goal (PPG) + 2 Improvement Goals'}
          </p>
        </div>

        {loading ? (
          <p className="text-[#666666]">Loading goals...</p>
        ) : goals.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <p className="text-[#666666] mb-4">No goals created yet.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#1e2a5e]"
            >
              Create Your First Goal
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {goals.map(goal => (
              <div key={goal.id} className="bg-white rounded-lg shadow">
                {/* Goal Header - Always Visible */}
                <div 
                  className="p-6 cursor-pointer"
                  onClick={() => toggleGoalExpand(goal.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-[#2c3e7e] text-lg">{goal.title}</h3>
                      {goal.description && (
                        <p className="text-sm text-[#666666] mt-1">{goal.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span className={`text-white text-xs px-2 py-1 rounded ${getGoalTypeBadgeColor(goal.goal_type)}`}>
                        {getGoalTypeLabel(goal.goal_type)}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded capitalize ${getStatusBadge(goal.status)}`}>
                        {goal.status?.replace('_', ' ')}
                      </span>
                      <span className="text-[#666666] ml-2">
                        {expandedGoal === goal.id ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedGoal === goal.id && (
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
                          <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">Student SMART Growth Goal (Target)</h4>
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
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Goal Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#2c3e7e]">Beginning of Year Goal Setting</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleAddGoal}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#666666] mb-1">
                        Goal Type
                      </label>
                      <select
                        value={newGoal.goal_type}
                        onChange={(e) => setNewGoal({...newGoal, goal_type: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                        required
                      >
                        <option value="slg">Student Learning Goal (SLG)</option>
                        <option value="pgg">Professional Growth Goal (PGG)</option>
                        <option value="improvement">Improvement Goal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#666666] mb-1">
                        Goal Title
                      </label>
                      <input
                        type="text"
                        value={newGoal.title}
                        onChange={(e) => setNewGoal({...newGoal, title: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                        placeholder="Brief title for this goal"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Content Standard(s)/Skill(s)
                    </label>
                    <textarea
                      value={newGoal.content_standards}
                      onChange={(e) => setNewGoal({...newGoal, content_standards: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      rows="3"
                      placeholder="e.g., HS.WR.CP.10 Identify the characteristics of fascism, militarism..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Assessments
                    </label>
                    <textarea
                      value={newGoal.assessments}
                      onChange={(e) => setNewGoal({...newGoal, assessments: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      rows="2"
                      placeholder="How will you measure progress? (e.g., Pre/post assessments, essays, tests)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Context / Students
                    </label>
                    <textarea
                      value={newGoal.context_students}
                      onChange={(e) => setNewGoal({...newGoal, context_students: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      rows="2"
                      placeholder="Describe the student population and context for this goal"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Baseline Data
                    </label>
                    <textarea
                      value={newGoal.baseline_data}
                      onChange={(e) => setNewGoal({...newGoal, baseline_data: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      rows="2"
                      placeholder="What is the starting point? When will baseline data be gathered?"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
  Student SMART Growth Goal (Target)
</label>
                    <textarea
                      value={newGoal.target_data}
                      onChange={(e) => setNewGoal({...newGoal, target_data: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      rows="3"
                      placeholder="SMART Goal: Specific, Measurable, Achievable, Relevant, Time-bound (e.g., By May 2026, 90% of students will...)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Rationale
                    </label>
                    <textarea
                      value={newGoal.rationale}
                      onChange={(e) => setNewGoal({...newGoal, rationale: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      rows="3"
                      placeholder="Why is this goal important? Why did you choose this focus?"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Strategies
                    </label>
                    <textarea
                      value={newGoal.strategies}
                      onChange={(e) => setNewGoal({...newGoal, strategies: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      rows="4"
                      placeholder="What strategies will you use to achieve this goal?"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Professional Learning and Support
                    </label>
                    <textarea
                      value={newGoal.professional_learning}
                      onChange={(e) => setNewGoal({...newGoal, professional_learning: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      rows="2"
                      placeholder="What resources, training, or support do you need?"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e]"
                  >
                    Save Goal
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

export default Goals