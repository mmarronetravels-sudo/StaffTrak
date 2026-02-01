 import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { notifyEvaluationReady } from '../services/emailService'
import { SummativePDFDownload } from '../components/SummativePDF'

function SummativeEvaluation() {
  const { staffId } = useParams()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [staff, setStaff] = useState(null)
  const [rubric, setRubric] = useState(null)
  const [domains, setDomains] = useState([])
  const [standards, setStandards] = useState([])
  const [goals, setGoals] = useState([])
  const [observations, setObservations] = useState([])
  const [selfReflection, setSelfReflection] = useState(null)
  
  // Evaluation data
  const [evaluation, setEvaluation] = useState(null)
  const [domainScores, setDomainScores] = useState({})
  const [areasOfStrength, setAreasOfStrength] = useState('')
  const [areasForGrowth, setAreasForGrowth] = useState('')
  const [recommendedSupport, setRecommendedSupport] = useState('')
  const [additionalComments, setAdditionalComments] = useState('')
  
  const [showSubmitModal, setShowSubmitModal] = useState(false)

  useEffect(() => {
    if (staffId && profile) {
      fetchData()
    }
  }, [staffId, profile])

  const fetchData = async () => {
    // Fetch staff member
    const { data: staffData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', staffId)
      .single()
    
    if (staffData) {
      setStaff(staffData)
      
      // Fetch rubric based on staff type/position
      await fetchRubric(staffData)
      
      // Fetch existing evaluation if any
      await fetchExistingEvaluation(staffId)
      
      // Fetch context data
      await fetchContextData(staffId)
    }
    
    setLoading(false)
  }

  const fetchRubric = async (staffData) => {
    // Get the appropriate rubric for this staff member
    let rubricQuery = supabase
      .from('rubrics')
      .select('*')
      .eq('staff_type', staffData.staff_type)
      .eq('is_active', true)
    
    // Try to match position-specific rubric first
    if (staffData.position_type === 'teacher') {
      rubricQuery = rubricQuery.ilike('name', '%teacher%')
    } else if (staffData.position_type === 'counselor') {
      rubricQuery = rubricQuery.ilike('name', '%counselor%')
    } else if (staffData.position_type === 'administrator') {
      rubricQuery = rubricQuery.ilike('name', '%administrator%')
    }
    
    const { data: rubricData } = await rubricQuery.limit(1).single()
    
    if (rubricData) {
      setRubric(rubricData)
      
      // Fetch domains
      const { data: domainData } = await supabase
        .from('rubric_domains')
        .select('*')
        .eq('rubric_id', rubricData.id)
        .order('sort_order')
      
      if (domainData) {
        setDomains(domainData)
        
        // Fetch standards
        const domainIds = domainData.map(d => d.id)
        const { data: standardData } = await supabase
          .from('rubric_standards')
          .select('*')
          .in('domain_id', domainIds)
          .order('sort_order')
        
        if (standardData) {
          setStandards(standardData)
        }
      }
    }
  }

  const fetchExistingEvaluation = async (staffId) => {
    const { data } = await supabase
      .from('summative_evaluations')
      .select('*')
      .eq('staff_id', staffId)
      .eq('evaluator_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (data) {
      setEvaluation(data)
      setDomainScores(data.domain_scores || {})
      setAreasOfStrength(data.areas_of_strength || '')
      setAreasForGrowth(data.areas_for_growth || '')
      setRecommendedSupport(data.recommended_support || '')
      setAdditionalComments(data.additional_comments || '')
    }
  }

  const fetchContextData = async (staffId) => {
    // Fetch goals
    const { data: goalsData } = await supabase
      .from('goals')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at')
    
    if (goalsData) setGoals(goalsData)
    
    // Fetch observations
    const { data: obsData } = await supabase
      .from('observations')
      .select('*')
      .eq('staff_id', staffId)
      .eq('status', 'completed')
      .order('scheduled_at')
    
    if (obsData) setObservations(obsData)
    
    // Fetch self-reflection
    const { data: reflectionData } = await supabase
      .from('self_assessments')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (reflectionData) setSelfReflection(reflectionData)
  }

  const handleDomainScoreChange = (domainId, field, value) => {
    setDomainScores(prev => ({
      ...prev,
      [domainId]: {
        ...prev[domainId],
        [field]: value
      }
    }))
  }

  const calculateOverallScore = () => {
    const scores = Object.values(domainScores)
      .map(d => d.score)
      .filter(s => s !== null && s !== undefined)
    
    if (scores.length === 0) return null
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
  }

  const getOverallRating = (score) => {
    if (!score) return null
    const s = parseFloat(score)
    if (s >= 3.5) return 'Highly Effective'
    if (s >= 2.5) return 'Effective'
    if (s >= 1.5) return 'Developing'
    return 'Needs Improvement'
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    
    const overallScore = calculateOverallScore()
    
    const evalData = {
      staff_id: staffId,
      evaluator_id: profile.id,
      domain_scores: domainScores,
      overall_score: overallScore,
      overall_rating: getOverallRating(overallScore),
      areas_of_strength: areasOfStrength,
      areas_for_growth: areasForGrowth,
      recommended_support: recommendedSupport,
      additional_comments: additionalComments,
      status: 'draft'
    }
    
    if (evaluation?.id) {
      // Update existing
      const { error } = await supabase
        .from('summative_evaluations')
        .update(evalData)
        .eq('id', evaluation.id)
      
      if (!error) {
        setEvaluation({ ...evaluation, ...evalData })
      }
    } else {
      // Create new
      const { data, error } = await supabase
        .from('summative_evaluations')
        .insert([evalData])
        .select()
        .single()
      
      if (!error && data) {
        setEvaluation(data)
      }
    }
    
    setSaving(false)
  }

  const handleSubmitToStaff = async () => {
    setSaving(true)
    
    const overallScore = calculateOverallScore()
    
    const evalData = {
      staff_id: staffId,
      evaluator_id: profile.id,
      domain_scores: domainScores,
      overall_score: overallScore,
      overall_rating: getOverallRating(overallScore),
      areas_of_strength: areasOfStrength,
      areas_for_growth: areasForGrowth,
      recommended_support: recommendedSupport,
      additional_comments: additionalComments,
      status: 'pending_staff_signature',
      evaluator_signature_at: new Date().toISOString()
    }
    
    let success = false
    
    if (evaluation?.id) {
      const { error } = await supabase
        .from('summative_evaluations')
        .update(evalData)
        .eq('id', evaluation.id)
      
      if (!error) {
        setEvaluation({ ...evaluation, ...evalData })
        setShowSubmitModal(false)
        success = true
      }
    } else {
      const { data, error } = await supabase
        .from('summative_evaluations')
        .insert([evalData])
        .select()
        .single()
      
      if (!error && data) {
        setEvaluation(data)
        setShowSubmitModal(false)
        success = true
      }
    }
    
    // Send email notification to staff
    if (success && staff?.email) {
      await notifyEvaluationReady({
        staffEmail: staff.email,
        staffName: staff.full_name,
        evaluatorName: profile.full_name,
        schoolYear: '2025-2026'
      })
    }
    
    setSaving(false)
  }

  const getScoreColor = (score) => {
    if (!score) return 'bg-gray-100'
    if (score >= 4) return 'bg-green-100 text-green-800'
    if (score >= 3) return 'bg-blue-100 text-blue-800'
    if (score >= 2) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const getStandardsForDomain = (domainId) => {
    return standards.filter(s => s.domain_id === domainId)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const overallScore = calculateOverallScore()
  const overallRating = getOverallRating(overallScore)
  const isSubmitted = evaluation?.status === 'pending_staff_signature' || evaluation?.status === 'completed'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#666666]">Loading evaluation...</p>
        </div>
      </div>
    )
  }

  if (!staff) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#666666] mb-4">Staff member not found.</p>
          <a href="/summatives" className="text-[#477fc1] hover:underline">Back to Summatives</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Navigation */}
      <nav className="bg-[#2c3e7e] shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-white">StaffTrak</h1>
            <a href="/summatives" className="text-white hover:text-gray-200">
              ← Back to Summatives
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

      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-[#2c3e7e]">
                Summative Evaluation: {staff.full_name}
              </h2>
              <p className="text-[#666666] capitalize">
                {staff.position_type} • {staff.staff_type} Staff
              </p>
              {isSubmitted && (
                <span className={`inline-block mt-2 text-xs px-2 py-1 rounded ${
                  evaluation?.status === 'completed' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {evaluation?.status === 'completed' ? '✓ Completed' : '⏳ Awaiting Staff Signature'}
                </span>
              )}
            </div>
            
            {/* Overall Score Display */}
            {overallScore && (
              <div className="flex items-start gap-4">
                <div className="text-center bg-gray-50 px-6 py-3 rounded-lg">
                  <p className="text-sm text-[#666666]">Overall Score</p>
                  <p className="text-3xl font-bold text-[#2c3e7e]">{overallScore}</p>
                  <p className={`text-sm font-medium ${
                    overallRating === 'Highly Effective' ? 'text-green-600' :
                    overallRating === 'Effective' ? 'text-blue-600' :
                    overallRating === 'Developing' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {overallRating}
                  </p>
                </div>
                {isSubmitted && (
                  <SummativePDFDownload
                    evaluation={evaluation}
                    staff={staff}
                    evaluator={profile}
                    domains={domains}
                    schoolName="Summit Learning Charter"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column - Context (1/3) */}
          <div className="space-y-6">
            
            {/* Goals Summary */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">🎯 Goals Summary</h3>
              </div>
              <div className="p-4">
                {goals.length > 0 ? (
                  <div className="space-y-3">
                    {goals.map(goal => (
                      <div key={goal.id} className="p-2 bg-gray-50 rounded text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium">{goal.title}</span>
                          {goal.final_score && (
                            <span className={`px-1.5 py-0.5 rounded text-xs ${getScoreColor(goal.final_score)}`}>
                              {goal.final_score}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#666666] capitalize">{goal.goal_type}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#666666] italic">No goals found.</p>
                )}
              </div>
            </div>

            {/* Observations Summary */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">👁️ Observations ({observations.length})</h3>
              </div>
              <div className="p-4">
                {observations.length > 0 ? (
                  <div className="space-y-2">
                    {observations.map(obs => (
                      <div key={obs.id} className="flex justify-between text-sm">
                        <span className="capitalize">{obs.observation_type}</span>
                        <span className="text-[#666666]">{formatDate(obs.scheduled_at)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#666666] italic">No completed observations.</p>
                )}
              </div>
            </div>

            {/* Self-Reflection Score */}
            {selfReflection && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-[#2c3e7e]">📊 Self-Reflection</h3>
                </div>
                <div className="p-4 text-center">
                  <p className="text-sm text-[#666666]">Self-Rating Average</p>
                  <p className="text-2xl font-bold text-[#2c3e7e]">
                    {selfReflection.overall_score?.toFixed(1) || 'N/A'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Evaluation Form (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Domain Scoring */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">📋 Domain Scores</h3>
                <p className="text-sm text-[#666666]">Rate each domain from 1-4</p>
              </div>
              <div className="p-4 space-y-6">
                {domains.map(domain => (
                  <div key={domain.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-medium text-[#2c3e7e]">{domain.name}</h4>
                        <p className="text-xs text-[#666666]">
                          {getStandardsForDomain(domain.id).length} standards
                        </p>
                      </div>
                      
                      {/* Score Buttons */}
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map(score => (
                          <button
                            key={score}
                            onClick={() => handleDomainScoreChange(domain.id, 'score', score)}
                            disabled={isSubmitted}
                            className={`w-10 h-10 rounded-lg font-bold transition-all ${
                              domainScores[domain.id]?.score === score
                                ? score === 4 ? 'bg-green-500 text-white' :
                                  score === 3 ? 'bg-blue-500 text-white' :
                                  score === 2 ? 'bg-yellow-500 text-white' :
                                  'bg-red-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            } ${isSubmitted ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Domain Feedback */}
                    <textarea
                      value={domainScores[domain.id]?.feedback || ''}
                      onChange={(e) => handleDomainScoreChange(domain.id, 'feedback', e.target.value)}
                      placeholder="Feedback for this domain..."
                      disabled={isSubmitted}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] disabled:bg-gray-50"
                      rows="2"
                    />
                    
                    {/* Show standards (collapsed) */}
                    <details className="mt-2">
                      <summary className="text-xs text-[#477fc1] cursor-pointer hover:underline">
                        View standards in this domain
                      </summary>
                      <ul className="mt-2 space-y-1 text-xs text-[#666666]">
                        {getStandardsForDomain(domain.id).map(std => (
                          <li key={std.id}>• {std.code} - {std.name}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                ))}
              </div>
            </div>

            {/* Narrative Sections */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">📝 Narrative Feedback</h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">
                    Areas of Strength
                  </label>
                  <textarea
                    value={areasOfStrength}
                    onChange={(e) => setAreasOfStrength(e.target.value)}
                    disabled={isSubmitted}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] disabled:bg-gray-50"
                    rows="3"
                    placeholder="Describe the employee's key strengths..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">
                    Areas for Growth
                  </label>
                  <textarea
                    value={areasForGrowth}
                    onChange={(e) => setAreasForGrowth(e.target.value)}
                    disabled={isSubmitted}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] disabled:bg-gray-50"
                    rows="3"
                    placeholder="Describe areas where improvement is recommended..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">
                    Recommended Support
                  </label>
                  <textarea
                    value={recommendedSupport}
                    onChange={(e) => setRecommendedSupport(e.target.value)}
                    disabled={isSubmitted}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] disabled:bg-gray-50"
                    rows="3"
                    placeholder="Professional development, resources, or support recommended..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#666666] mb-1">
                    Additional Comments
                  </label>
                  <textarea
                    value={additionalComments}
                    onChange={(e) => setAdditionalComments(e.target.value)}
                    disabled={isSubmitted}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] disabled:bg-gray-50"
                    rows="3"
                    placeholder="Any additional comments..."
                  />
                </div>
              </div>
            </div>

            {/* Staff Comments (if submitted) */}
            {isSubmitted && evaluation?.staff_comments && (
              <div className="bg-blue-50 rounded-lg shadow">
                <div className="p-4 border-b border-blue-100">
                  <h3 className="font-semibold text-[#2c3e7e]">💬 Staff Comments</h3>
                </div>
                <div className="p-4">
                  <p className="text-sm text-[#666666] whitespace-pre-wrap">
                    {evaluation.staff_comments}
                  </p>
                </div>
              </div>
            )}

            {/* Signature Status */}
            {isSubmitted && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-[#2c3e7e]">✍️ Signatures</h3>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-[#666666]">Evaluator</span>
                    <span className="text-sm text-green-600">
                      ✓ Signed {formatDate(evaluation.evaluator_signature_at)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-[#666666]">Staff Member</span>
                    {evaluation.staff_signature_at ? (
                      <span className="text-sm text-green-600">
                        ✓ Signed {formatDate(evaluation.staff_signature_at)}
                      </span>
                    ) : (
                      <span className="text-sm text-yellow-600">Awaiting signature</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!isSubmitted && (
              <div className="flex gap-3">
                <button
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Draft'}
                </button>
                <button
                  onClick={() => setShowSubmitModal(true)}
                  disabled={saving || !overallScore}
                  className="flex-1 px-4 py-3 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50"
                >
                  Sign & Send to Staff
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-xl font-bold text-[#2c3e7e] mb-4">Submit Evaluation</h3>
              <p className="text-[#666666] mb-4">
                You are about to sign and send this evaluation to <strong>{staff.full_name}</strong>.
              </p>
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-[#666666]">Overall Score:</span>
                  <span className="font-bold text-[#2c3e7e]">{overallScore}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#666666]">Rating:</span>
                  <span className="font-medium">{overallRating}</span>
                </div>
              </div>
              <p className="text-sm text-[#666666] mb-6">
                The staff member will be able to add comments and sign off.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitToStaff}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50"
                >
                  {saving ? 'Submitting...' : 'Sign & Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SummativeEvaluation
