 import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { notifyEvaluationReady } from '../services/emailService'
import { SummativePDFDownload } from '../components/SummativePDF'
import Navbar from '../components/Navbar'
import { obsTypeLabel } from '../lib/observationTypes'
import { fetchScoredIndicatorRatings, fetchEvidenceTagsForStaff } from '../lib/summativeRollup'

const RATING_OPTIONS = ['Highly Effective', 'Effective', 'Developing', 'Needs Improvement']
const ratingTextColor = (rating) =>
  rating === 'Highly Effective' ? 'text-green-600'
  : rating === 'Effective' ? 'text-blue-600'
  : rating === 'Developing' ? 'text-yellow-600'
  : rating === 'Needs Improvement' ? 'text-red-600'
  : 'text-gray-600'

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

  // #8 roll-up (suggestions from the body of evidence) + professional-judgment override
  const [scoredRatings, setScoredRatings] = useState([]) // { standard_id, rating }
  const [evidenceTags, setEvidenceTags] = useState([])   // { id, tags:[{standard_id}] }
  const [overrideEnabled, setOverrideEnabled] = useState(false)
  const [overrideRating, setOverrideRating] = useState('')
  const [overrideJustification, setOverrideJustification] = useState('')

  const [showSubmitModal, setShowSubmitModal] = useState(false)

  useEffect(() => {
    if (staffId && profile) {
      fetchData()
    }
  }, [staffId, profile])

  const fetchData = async () => {
    // Fetch staff member — verify they belong to the same tenant
    const { data: staffData } = await supabase
      .from('profiles')
      .select('id, full_name, email, position_type, staff_type, assigned_rubric_id, evaluator_id, years_at_school, tenant_id')
      .eq('id', staffId)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (!staffData) {
      // Staff not found or not in this tenant — redirect
      navigate('/summatives')
      return
    }

    setStaff(staffData)

    // Fetch rubric based on staff type/position
    await fetchRubric(staffData)

    // Fetch existing evaluation if any
    await fetchExistingEvaluation(staffId)

    // Fetch context data
    await fetchContextData(staffId)

    // #8: roll-up data (scored observation ratings + evidence tags)
    const [rs, ev] = await Promise.all([
      fetchScoredIndicatorRatings(staffId),
      fetchEvidenceTagsForStaff(staffId),
    ])
    setScoredRatings(rs)
    setEvidenceTags(ev)

    setLoading(false)
  }

  const fetchRubric = async (staffData) => {
    let rubricData = null

    // Priority 1: Use assigned_rubric_id if set
    if (staffData.assigned_rubric_id) {
      const { data, error } = await supabase
        .from('rubrics')
        .select('id, name, staff_type')
        .eq('id', staffData.assigned_rubric_id)
        .single()

      if (!error && data) {
        rubricData = data
      }
    }

    // Priority 2: Fallback to staff_type/position matching
    if (!rubricData) {
      let rubricQuery = supabase
        .from('rubrics')
        .select('id, name, staff_type')
        .eq('staff_type', staffData.staff_type)
        .eq('is_active', true)

      if (staffData.position_type === 'teacher') {
        rubricQuery = rubricQuery.ilike('name', '%teacher%')
      } else if (staffData.position_type === 'counselor') {
        rubricQuery = rubricQuery.ilike('name', '%counselor%')
      } else if (staffData.position_type === 'administrator') {
        rubricQuery = rubricQuery.ilike('name', '%administrator%')
      }

      const { data } = await rubricQuery.limit(1).single()
      rubricData = data
    }

    if (rubricData) {
      setRubric(rubricData)

      // Fetch domains
      const { data: domainData } = await supabase
        .from('rubric_domains')
        .select('id, name, sort_order')
        .eq('rubric_id', rubricData.id)
        .order('sort_order')

      if (domainData) {
        setDomains(domainData)

        // Fetch standards
        const domainIds = domainData.map(d => d.id)
        const { data: standardData } = await supabase
          .from('rubric_standards')
          .select('id, domain_id, code, name, sort_order')
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
      .select('id, staff_id, evaluator_id, status, domain_scores, areas_of_strength, areas_for_growth, recommended_support, additional_comments, overall_score, overall_rating, overall_rating_override, override_justification, created_at')
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
      setOverrideEnabled(!!data.overall_rating_override)
      setOverrideRating(data.overall_rating_override || '')
      setOverrideJustification(data.override_justification || '')
    }
  }

  const fetchContextData = async (staffId) => {
    // Fetch goals
    const { data: goalsData } = await supabase
      .from('goals')
      .select('id, title, goal_type, final_score, created_at')
      .eq('staff_id', staffId)
      .order('created_at')

    if (goalsData) setGoals(goalsData)

    // Fetch observations
    const { data: obsData } = await supabase
      .from('observations')
      .select('id, observation_type, is_formative_only, scheduled_at')
      .eq('staff_id', staffId)
      .eq('status', 'completed')
      .order('scheduled_at')

    if (obsData) setObservations(obsData)

    // Fetch self-reflection
    const { data: reflectionData } = await supabase
      .from('self_assessments')
      .select('id, overall_score, created_at')
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

  // Build the override-aware rating fields shared by draft + submit.
  const ratingFields = () => {
    const overallScore = calculateOverallScore()
    const calculated = getOverallRating(overallScore)
    const useOverride = overrideEnabled && !!overrideRating
    return {
      overall_score: overallScore,
      overall_rating: useOverride ? overrideRating : calculated, // EFFECTIVE final rating
      overall_rating_override: useOverride ? overrideRating : null,
      override_justification: useOverride ? (overrideJustification.trim() || null) : null,
    }
  }

  const handleSaveDraft = async () => {
    setSaving(true)

    const evalData = {
      staff_id: staffId,
      evaluator_id: profile.id,
      domain_scores: domainScores,
      ...ratingFields(),
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
    // Override requires a chosen rating + written justification.
    if (overrideEnabled && (!overrideRating || !overrideJustification.trim())) {
      alert('To override the calculated rating, choose a final rating and provide a written justification.')
      return
    }
    setSaving(true)

    const evalData = {
      staff_id: staffId,
      evaluator_id: profile.id,
      domain_scores: domainScores,
      ...ratingFields(),
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

  // #8: suggested domain score from scored observation indicator ratings.
  const domainSuggestion = (domainId) => {
    const sIds = getStandardsForDomain(domainId).map(s => s.id)
    const rs = scoredRatings.filter(r => sIds.includes(r.standard_id))
    if (!rs.length) return null
    const avg = rs.reduce((a, r) => a + r.rating, 0) / rs.length
    return { avg: avg.toFixed(2), rounded: Math.round(avg), label: getOverallRating(avg), count: rs.length }
  }

  // #8: how many evidence items touch any indicator in this domain.
  const domainEvidenceCount = (domainId) => {
    const sIds = new Set(getStandardsForDomain(domainId).map(s => s.id))
    return evidenceTags.filter(it => (it.tags || []).some(t => sIds.has(t.standard_id))).length
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const overallScore = calculateOverallScore()
  const overallRating = getOverallRating(overallScore)
  const isSubmitted = evaluation?.status === 'pending_staff_signature' || evaluation?.status === 'completed'

  // #8 professional-judgment override: the EFFECTIVE final rating.
  const computedRating = overallRating
  const overrideActive = isSubmitted
    ? !!evaluation?.overall_rating_override
    : (overrideEnabled && !!overrideRating)
  const effectiveRating = overrideActive
    ? (isSubmitted ? evaluation.overall_rating_override : overrideRating)
    : computedRating

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
      <Navbar />
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
                  <p className={`text-sm font-medium ${ratingTextColor(effectiveRating)}`}>
                    {effectiveRating}
                  </p>
                  {overrideActive && (
                    <p className="text-[10px] text-amber-600 mt-0.5">override · calculated {computedRating}</p>
                  )}
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
                <p className="text-xs text-[#666666]">
                  {observations.filter(o => !o.is_formative_only).length} scored · {observations.filter(o => o.is_formative_only).length} formative
                </p>
              </div>
              <div className="p-4">
                {observations.length > 0 ? (
                  <div className="space-y-2">
                    {observations.map(obs => (
                      <div key={obs.id} className="flex justify-between items-center text-sm gap-2">
                        <span className="flex items-center gap-1.5">
                          {obsTypeLabel(obs.observation_type)}
                          {obs.is_formative_only && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200" title="Formative only — not counted toward the summative score">
                              not scored
                            </span>
                          )}
                        </span>
                        <span className="text-[#666666] shrink-0">{formatDate(obs.scheduled_at)}</span>
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

                    {/* #8 Roll-up: suggestion from the body of evidence */}
                    {(() => {
                      const sug = domainSuggestion(domain.id)
                      const ev = domainEvidenceCount(domain.id)
                      if (!sug && ev === 0) return null
                      return (
                        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs bg-blue-50 border border-blue-100 rounded p-2">
                          {sug ? (
                            <>
                              <span className="font-medium text-[#2c3e7e]">From observations:</span>
                              <span className={`px-1.5 py-0.5 rounded ${getScoreColor(parseFloat(sug.avg))}`}>{sug.avg} avg · {sug.label}</span>
                              <span className="text-[#666666]">({sug.count} indicator rating{sug.count !== 1 ? 's' : ''}, scored only)</span>
                              {!isSubmitted && (
                                <button
                                  onClick={() => handleDomainScoreChange(domain.id, 'score', sug.rounded)}
                                  className="px-2 py-0.5 rounded bg-[#477fc1] text-white hover:bg-[#3a6ca8]"
                                >
                                  Use {sug.rounded}
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="text-[#666666]">No scored observation ratings for this domain yet.</span>
                          )}
                          {ev > 0 && <span className="text-[#666666]">· {ev} evidence item{ev !== 1 ? 's' : ''}</span>}
                        </div>
                      )
                    })()}

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

            {/* #8 Overall Rating + professional-judgment override */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">⭐ Overall Rating</h3>
                <p className="text-sm text-[#666666]">Calculated from the domain scores. You may override it with professional judgment.</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-[#666666]">Calculated:</span>
                  <span className="font-bold text-[#2c3e7e]">{overallScore || '—'}</span>
                  {computedRating && <span className={`text-sm font-medium ${ratingTextColor(computedRating)}`}>{computedRating}</span>}
                </div>

                {!isSubmitted ? (
                  <>
                    <label className="flex items-center gap-2 text-sm text-[#666666] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overrideEnabled}
                        onChange={(e) => setOverrideEnabled(e.target.checked)}
                        className="rounded text-[#477fc1]"
                      />
                      Override the calculated rating (professional judgment)
                    </label>
                    {overrideEnabled && (
                      <div className="space-y-2 pl-6">
                        <select
                          value={overrideRating}
                          onChange={(e) => setOverrideRating(e.target.value)}
                          className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                        >
                          <option value="">Select final rating…</option>
                          {RATING_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <textarea
                          value={overrideJustification}
                          onChange={(e) => setOverrideJustification(e.target.value)}
                          rows="3"
                          placeholder="Justification (required when overriding the calculated rating)…"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                        />
                        <p className="text-xs text-[#666666]">A written justification is required when the final rating differs from the calculated score.</p>
                      </div>
                    )}
                  </>
                ) : (
                  evaluation?.overall_rating_override ? (
                    <div className="bg-amber-50 border border-amber-200 rounded p-3">
                      <p className="text-sm">
                        <span className="font-medium text-[#2c3e7e]">Final rating (professional-judgment override):</span>{' '}
                        <span className={`font-medium ${ratingTextColor(evaluation.overall_rating_override)}`}>{evaluation.overall_rating_override}</span>
                      </p>
                      <p className="text-xs text-[#666666] mt-0.5">Calculated rating was {computedRating}.</p>
                      {evaluation.override_justification && (
                        <p className="text-sm text-[#666666] mt-2"><span className="font-medium">Justification:</span> {evaluation.override_justification}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-[#666666]">No override — the final rating is the calculated rating.</p>
                  )
                )}
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
                  <span className="text-sm text-[#666666]">Final Rating:</span>
                  <span className={`font-medium ${ratingTextColor(effectiveRating)}`}>{effectiveRating}</span>
                </div>
                {overrideActive && (
                  <p className="text-xs text-amber-600 mt-1 text-right">Professional-judgment override (calculated: {computedRating})</p>
                )}
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
