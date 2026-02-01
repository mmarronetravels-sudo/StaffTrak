import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { SummativePDFDownload } from '../components/SummativePDF'
import Navbar from '../components/Navbar'

function MySummative() {
  const { profile, signOut } = useAuth()
  const [loading, setLoading] = useState(true)
  const [evaluation, setEvaluation] = useState(null)
  const [domains, setDomains] = useState([])
  const [staffComments, setStaffComments] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSignModal, setShowSignModal] = useState(false)

  useEffect(() => {
    if (profile) {
      fetchEvaluation()
    }
  }, [profile])

  const fetchEvaluation = async () => {
    // Fetch the most recent summative evaluation for this staff member
    const { data, error } = await supabase
      .from('summative_evaluations')
      .select(`
        *,
        evaluator:evaluator_id (id, full_name)
      `)
      .eq('staff_id', profile.id)
      .in('status', ['pending_staff_signature', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      setEvaluation(data)
      setStaffComments(data.staff_comments || '')
      
      // Fetch domain info for displaying names
      if (data.domain_scores) {
        const domainIds = Object.keys(data.domain_scores)
        if (domainIds.length > 0) {
          const { data: domainData } = await supabase
            .from('rubric_domains')
            .select('*')
            .in('id', domainIds)
            .order('sort_order')
          
          if (domainData) {
            setDomains(domainData)
          }
        }
      }
    }

    setLoading(false)
  }

  const handleSaveComments = async () => {
    setSaving(true)
    
    const { error } = await supabase
      .from('summative_evaluations')
      .update({ staff_comments: staffComments })
      .eq('id', evaluation.id)

    if (!error) {
      setEvaluation({ ...evaluation, staff_comments: staffComments })
    }
    
    setSaving(false)
  }

  const handleSignOff = async () => {
    setSaving(true)
    
    const { error } = await supabase
      .from('summative_evaluations')
      .update({ 
        staff_comments: staffComments,
        staff_signature_at: new Date().toISOString(),
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', evaluation.id)

    if (!error) {
      setEvaluation({ 
        ...evaluation, 
        staff_comments: staffComments,
        staff_signature_at: new Date().toISOString(),
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      setShowSignModal(false)
    }
    
    setSaving(false)
  }

  const getScoreColor = (score) => {
    if (score >= 4) return 'bg-green-100 text-green-800 border-green-300'
    if (score >= 3) return 'bg-blue-100 text-blue-800 border-blue-300'
    if (score >= 2) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    return 'bg-red-100 text-red-800 border-red-300'
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

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const isCompleted = evaluation?.status === 'completed'
  const canSign = evaluation?.status === 'pending_staff_signature'

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

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-[#2c3e7e] mb-6">My Summative Evaluation</h2>

        {!evaluation ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-xl font-semibold text-[#2c3e7e] mb-2">No Evaluation Available Yet</h3>
            <p className="text-[#666666]">
              Your summative evaluation has not been submitted yet. 
              Check back later or contact your evaluator.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Status Banner */}
            <div className={`p-4 rounded-lg ${
              isCompleted 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-yellow-50 border border-yellow-200'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-semibold ${isCompleted ? 'text-green-800' : 'text-yellow-800'}`}>
                    {isCompleted ? '✓ Evaluation Complete' : '⏳ Action Required: Please Review and Sign'}
                  </p>
                  <p className="text-sm text-[#666666]">
                    Evaluator: {evaluation.evaluator?.full_name}
                  </p>
                </div>
                {!isCompleted && (
                  <button
                    onClick={() => setShowSignModal(true)}
                    className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#1e2a5e]"
                  >
                    Sign Evaluation
                  </button>
                )}
              </div>
            </div>

            {/* Overall Score */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-center">
                <p className="text-sm text-[#666666] mb-1">Overall Score</p>
                <p className="text-5xl font-bold text-[#2c3e7e] mb-2">
                  {evaluation.overall_score}
                </p>
                <p className={`text-xl font-semibold ${getRatingColor(evaluation.overall_rating)}`}>
                  {evaluation.overall_rating}
                </p>
                
                {/* PDF Download Button */}
                <div className="mt-4">
                  <SummativePDFDownload
                    evaluation={evaluation}
                    staff={profile}
                    evaluator={evaluation.evaluator}
                    domains={domains}
                    schoolName="Summit Learning Charter"
                  />
                </div>
              </div>
            </div>

            {/* Domain Scores */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">📊 Domain Scores</h3>
              </div>
              <div className="p-4 space-y-4">
                {domains.map(domain => {
                  const domainData = evaluation.domain_scores?.[domain.id]
                  return (
                    <div key={domain.id} className={`p-4 rounded-lg border ${getScoreColor(domainData?.score)}`}>
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium">{domain.name}</h4>
                        <span className="text-2xl font-bold">{domainData?.score || 'N/A'}</span>
                      </div>
                      {domainData?.feedback && (
                        <p className="text-sm opacity-80">{domainData.feedback}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Narrative Feedback */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">📝 Evaluator Feedback</h3>
              </div>
              <div className="p-4 space-y-4">
                {evaluation.areas_of_strength && (
                  <div>
                    <h4 className="text-sm font-semibold text-green-700 mb-1">Areas of Strength</h4>
                    <p className="text-sm text-[#666666] bg-green-50 p-3 rounded-lg">
                      {evaluation.areas_of_strength}
                    </p>
                  </div>
                )}
                
                {evaluation.areas_for_growth && (
                  <div>
                    <h4 className="text-sm font-semibold text-yellow-700 mb-1">Areas for Growth</h4>
                    <p className="text-sm text-[#666666] bg-yellow-50 p-3 rounded-lg">
                      {evaluation.areas_for_growth}
                    </p>
                  </div>
                )}
                
                {evaluation.recommended_support && (
                  <div>
                    <h4 className="text-sm font-semibold text-blue-700 mb-1">Recommended Support</h4>
                    <p className="text-sm text-[#666666] bg-blue-50 p-3 rounded-lg">
                      {evaluation.recommended_support}
                    </p>
                  </div>
                )}
                
                {evaluation.additional_comments && (
                  <div>
                    <h4 className="text-sm font-semibold text-[#2c3e7e] mb-1">Additional Comments</h4>
                    <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded-lg">
                      {evaluation.additional_comments}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Staff Comments */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">💬 Your Comments (Optional)</h3>
              </div>
              <div className="p-4">
                {isCompleted ? (
                  <p className="text-sm text-[#666666] bg-gray-50 p-3 rounded-lg">
                    {staffComments || 'No comments added.'}
                  </p>
                ) : (
                  <>
                    <textarea
                      value={staffComments}
                      onChange={(e) => setStaffComments(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      rows="4"
                      placeholder="Add any comments about this evaluation (optional)..."
                    />
                    <button
                      onClick={handleSaveComments}
                      disabled={saving}
                      className="mt-2 text-sm text-[#477fc1] hover:underline"
                    >
                      {saving ? 'Saving...' : 'Save Comments'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Signatures */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-[#2c3e7e]">✍️ Signatures</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[#666666]">Evaluator</span>
                  {evaluation.evaluator_signature_at ? (
                    <span className="text-green-600 text-sm">
                      ✓ Signed on {formatDate(evaluation.evaluator_signature_at)}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">Not signed</span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#666666]">Employee (You)</span>
                  {evaluation.staff_signature_at ? (
                    <span className="text-green-600 text-sm">
                      ✓ Signed on {formatDate(evaluation.staff_signature_at)}
                    </span>
                  ) : (
                    <span className="text-yellow-600 text-sm">Awaiting your signature</span>
                  )}
                </div>
              </div>
            </div>

            {/* Sign Button (if not completed) */}
            {canSign && (
              <button
                onClick={() => setShowSignModal(true)}
                className="w-full bg-[#2c3e7e] text-white py-4 rounded-lg hover:bg-[#1e2a5e] font-semibold text-lg"
              >
                Sign Evaluation
              </button>
            )}

            {/* Completed Notice */}
            {isCompleted && (
              <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-center">
                <p className="text-green-800 font-medium">
                  ✓ This evaluation was completed on {formatDate(evaluation.completed_at)}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Sign Off Modal */}
      {showSignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-xl font-bold text-[#2c3e7e] mb-4">Sign Evaluation</h3>
              
              <p className="text-[#666666] mb-4">
                By signing, you acknowledge that you have reviewed this evaluation. 
                Your signature does not necessarily indicate agreement with the evaluation.
              </p>
              
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-[#666666]">Overall Score:</span>
                  <span className="font-bold text-[#2c3e7e]">{evaluation?.overall_score}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[#666666]">Rating:</span>
                  <span className={`font-medium ${getRatingColor(evaluation?.overall_rating)}`}>
                    {evaluation?.overall_rating}
                  </span>
                </div>
              </div>

              {staffComments && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-[#666666] mb-1">Your Comments:</p>
                  <p className="text-sm bg-blue-50 p-2 rounded">{staffComments}</p>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSignModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignOff}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50"
                >
                  {saving ? 'Signing...' : 'Sign & Complete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MySummative
