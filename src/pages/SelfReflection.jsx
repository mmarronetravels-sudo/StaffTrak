import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

function SelfReflection() {
  const { profile, signOut } = useAuth()
  const [rubric, setRubric] = useState(null)
  const [domains, setDomains] = useState([])
  const [standards, setStandards] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [existingReflection, setExistingReflection] = useState(null)
  
  const [scores, setScores] = useState({})
  const [reflections, setReflections] = useState({})
  const [overallReflection, setOverallReflection] = useState('')

  const currentSchoolYear = '2025-2026'

  useEffect(() => {
    if (profile) {
      fetchRubricAndReflection()
    }
  }, [profile])

  const fetchRubricAndReflection = async () => {
    let rubricName = ''
    if (profile.staff_type === 'licensed') {
      if (profile.position_type === 'counselor') {
        rubricName = 'School Counselor Rubric'
      } else if (profile.position_type === 'administrator') {
        rubricName = 'Administrator/Educational Leader Rubric'
      } else {
        rubricName = 'Teacher Rubric (NSQOT-Based)'
      }
    } else {
      rubricName = 'Non-Licensed 4-Domain Rubric'
    }

    const { data: rubricData, error: rubricError } = await supabase
      .from('rubrics')
      .select('*')
      .eq('name', rubricName)
      .single()

    if (rubricError || !rubricData) {
      console.error('Error fetching rubric:', rubricError)
      setLoading(false)
      return
    }

    setRubric(rubricData)

    const { data: domainData } = await supabase
      .from('rubric_domains')
      .select('*')
      .eq('rubric_id', rubricData.id)
      .order('sort_order', { ascending: true })

    if (domainData) {
      setDomains(domainData)

      const domainIds = domainData.map(d => d.id)
      const { data: standardData } = await supabase
        .from('rubric_standards')
        .select('*')
        .in('domain_id', domainIds)
        .order('sort_order', { ascending: true })

      if (standardData) {
        setStandards(standardData)
      }
    }

    const { data: existingData } = await supabase
      .from('self_assessments')
      .select('*')
      .eq('staff_id', profile.id)
      .eq('assessment_type', 'self_reflection')
      .gte('created_at', '2025-07-01')
      .single()

    if (existingData) {
      setExistingReflection(existingData)
      setScores(existingData.domain_scores || {})
      setReflections(existingData.content?.reflections || {})
      setOverallReflection(existingData.content?.overall_reflection || '')
    }

    setLoading(false)
  }

  const getStandardsForDomain = (domainId) => {
    return standards.filter(s => s.domain_id === domainId)
  }

  const handleSetScore = (standardId, score) => {
    setScores({ ...scores, [standardId]: score })
  }

  const handleSetReflection = (standardId, text) => {
    setReflections({ ...reflections, [standardId]: text })
  }

  const calculateDomainAverage = (domainId) => {
    const domainStandards = getStandardsForDomain(domainId)
    const domainScores = domainStandards
      .map(s => scores[s.id])
      .filter(s => s !== undefined && s !== null)
    
    if (domainScores.length === 0) return null
    return (domainScores.reduce((a, b) => a + b, 0) / domainScores.length).toFixed(2)
  }

  const calculateOverallAverage = () => {
    const allScores = Object.values(scores).filter(s => s !== undefined && s !== null)
    if (allScores.length === 0) return null
    return (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(2)
  }

  const getCompletionPercentage = () => {
    const totalStandards = standards.length
    const scoredStandards = Object.keys(scores).length
    return totalStandards > 0 ? Math.round((scoredStandards / totalStandards) * 100) : 0
  }

  const handleSave = async (submit) => {
    setSaving(true)

    const data = {
      staff_id: profile.id,
      assessment_type: 'self_reflection',
      domain_scores: scores,
      content: {
        reflections: reflections,
        overall_reflection: overallReflection,
        rubric_id: rubric.id,
        school_year: currentSchoolYear
      },
      submitted_at: submit ? new Date().toISOString() : null
    }

    let error = null
    let result = null
    
    if (existingReflection) {
      result = await supabase
        .from('self_assessments')
        .update(data)
        .eq('id', existingReflection.id)
        .select()
      error = result.error
      if (!error && result.data) {
        setExistingReflection(result.data[0])
      }
    } else {
      result = await supabase
        .from('self_assessments')
        .insert([data])
        .select()
      error = result.error
      if (!error && result.data) {
        setExistingReflection(result.data[0])
      }
    }

    if (error) {
      console.error('Error saving:', error)
      alert('Error saving: ' + error.message)
    } else {
      if (submit) {
        alert('Self-reflection submitted successfully!')
      } else {
        alert('Draft saved successfully!')
      }
    }

    setSaving(false)
  }

  const getRatingLabel = (score) => {
    switch(score) {
      case 1: return 'Needs Improvement'
      case 2: return 'Developing'
      case 3: return 'Effective'
      case 4: return 'Highly Effective'
      default: return ''
    }
  }

  const getRatingColor = (score) => {
    switch(score) {
      case 1: return 'bg-red-500'
      case 2: return 'bg-yellow-500'
      case 3: return 'bg-blue-500'
      case 4: return 'bg-green-500'
      default: return 'bg-gray-300'
    }
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const isSubmitted = existingReflection?.submitted_at ? true : false

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#666666]">Loading rubric...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
        <Navbar />
      
      <main className="max-w-5xl mx-auto px-4 py-8 pb-32">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#2c3e7e]">Self-Reflection</h2>
            <p className="text-[#666666]">{rubric?.name} • {currentSchoolYear}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-[#2c3e7e]">{getCompletionPercentage()}%</div>
            <p className="text-sm text-[#666666]">Complete</p>
            {isSubmitted && (
              <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                ✓ Submitted
              </span>
            )}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
          <h3 className="font-semibold text-[#2c3e7e] mb-2">📋 Instructions</h3>
          <p className="text-sm text-[#666666]">
            Rate yourself on each standard from 1-4. Add optional reflections to explain your rating or identify areas for growth. 
            This self-reflection will guide your goal-setting process.
          </p>
          <div className="flex gap-4 mt-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded"></span> 1 - Needs Improvement</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded"></span> 2 - Developing</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded"></span> 3 - Effective</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded"></span> 4 - Highly Effective</span>
          </div>
        </div>

        {calculateOverallAverage() && (
          <div className="bg-white p-4 rounded-lg shadow mb-6 flex justify-between items-center">
            <span className="font-semibold text-[#2c3e7e]">Overall Self-Assessment Average</span>
            <span className="text-2xl font-bold text-[#2c3e7e]">{calculateOverallAverage()}</span>
          </div>
        )}

        <div className="space-y-6">
          {domains.map(domain => (
            <div key={domain.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-[#2c3e7e] text-white p-4 flex justify-between items-center">
                <h3 className="font-semibold">{domain.name}</h3>
                {calculateDomainAverage(domain.id) && (
                  <span className="bg-white text-[#2c3e7e] px-3 py-1 rounded-full text-sm font-bold">
                    Avg: {calculateDomainAverage(domain.id)}
                  </span>
                )}
              </div>

              <div className="p-4 space-y-4">
                {getStandardsForDomain(domain.id).map(standard => (
                  <div key={standard.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 pr-4">
                        <span className="font-medium text-[#477fc1]">{standard.code}</span>
                        <span className="text-[#333] ml-2">{standard.name}</span>
                      </div>
                      
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map(rating => (
                          <button
                            key={rating}
                            onClick={() => !isSubmitted && handleSetScore(standard.id, rating)}
                            disabled={isSubmitted}
                            className={`w-10 h-10 rounded-lg font-bold transition-all ${
                              scores[standard.id] === rating
                                ? `${getRatingColor(rating)} text-white`
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            } ${isSubmitted ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            title={getRatingLabel(rating)}
                          >
                            {rating}
                          </button>
                        ))}
                      </div>
                    </div>

                    <textarea
                      value={reflections[standard.id] || ''}
                      onChange={(e) => handleSetReflection(standard.id, e.target.value)}
                      disabled={isSubmitted}
                      placeholder="Add reflection or notes (optional)..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] disabled:bg-gray-50"
                      rows="2"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <h3 className="font-semibold text-[#2c3e7e] mb-3">Overall Reflection</h3>
          <p className="text-sm text-[#666666] mb-3">
            Based on your self-assessment, what are your key strengths? What areas would you like to focus on for growth this year?
          </p>
          <textarea
            value={overallReflection}
            onChange={(e) => setOverallReflection(e.target.value)}
            disabled={isSubmitted}
            placeholder="Write your overall reflection here..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1] disabled:bg-gray-50"
            rows="4"
          />
        </div>

        {!isSubmitted && (
  <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg">
    <div className="max-w-5xl mx-auto flex gap-4">
      <button
        onClick={() => handleSave(false)}
        disabled={saving}
        className="flex-1 px-4 py-3 border border-[#2c3e7e] text-[#2c3e7e] rounded-lg hover:bg-gray-50 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Draft'}
      </button>
      <button
        onClick={() => handleSave(true)}
        disabled={saving || getCompletionPercentage() < 100}
        className="flex-1 px-4 py-3 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50"
      >
        {saving ? 'Submitting...' : `Submit (${getCompletionPercentage()}% complete)`}
      </button>
    </div>
  </div>
)}

        {!isSubmitted && getCompletionPercentage() < 100 && (
          <p className="text-center text-sm text-[#666666] mt-3">
            Rate all standards to submit your self-reflection.
          </p>
        )}
      </main>
    </div>
  )
}

export default SelfReflection
