import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

function Rubrics() {
  const { profile, signOut } = useAuth()
  const [rubrics, setRubrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRubric, setSelectedRubric] = useState(null)
  const [domains, setDomains] = useState([])
  const [standards, setStandards] = useState([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  useEffect(() => {
    fetchRubrics()
  }, [])

  const fetchRubrics = async () => {
    const { data, error } = await supabase
      .from('rubrics')
      .select('*')
      .order('staff_type', { ascending: true })
      .order('name', { ascending: true })

    if (!error) {
      setRubrics(data)
    }
    setLoading(false)
  }

  const handleRubricClick = async (rubric) => {
    if (selectedRubric?.id === rubric.id) {
      // Close if clicking the same rubric
      setSelectedRubric(null)
      setDomains([])
      setStandards([])
      return
    }

    setSelectedRubric(rubric)
    setLoadingDetails(true)

    // Fetch domains for this rubric
    const { data: domainData, error: domainError } = await supabase
      .from('rubric_domains')
      .select('*')
      .eq('rubric_id', rubric.id)
      .order('sort_order', { ascending: true })

    if (!domainError) {
      setDomains(domainData)

      // Fetch standards for all domains
      const domainIds = domainData.map(d => d.id)
      const { data: standardData, error: standardError } = await supabase
        .from('rubric_standards')
        .select('*')
        .in('domain_id', domainIds)
        .order('sort_order', { ascending: true })

      if (!standardError) {
        setStandards(standardData)
      }
    }

    setLoadingDetails(false)
  }

  const getStandardsForDomain = (domainId) => {
    return standards.filter(s => s.domain_id === domainId)
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
              <a href="/rubrics" className="text-white hover:text-gray-200 font-semibold">Rubrics</a>
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
          <h2 className="text-2xl font-bold text-[#2c3e7e]">Evaluation Rubrics</h2>
        </div>

        {loading ? (
          <p className="text-[#666666]">Loading rubrics...</p>
        ) : rubrics.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <p className="text-[#666666] mb-4">No rubrics found.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {/* Licensed Staff Rubrics */}
            <div>
              <h3 className="text-lg font-semibold text-[#2c3e7e] mb-3">Licensed Staff</h3>
              <div className="grid gap-4">
                {rubrics
                  .filter(r => r.staff_type === 'licensed')
                  .map(rubric => (
                    <div key={rubric.id}>
                      <div 
                        onClick={() => handleRubricClick(rubric)}
                        className={`bg-white p-6 rounded-lg shadow cursor-pointer transition-all ${
                          selectedRubric?.id === rubric.id ? 'ring-2 ring-[#477fc1]' : 'hover:shadow-md'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold text-[#2c3e7e]">{rubric.name}</h4>
                            <p className="text-sm text-[#666666] mt-1">{rubric.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="bg-[#477fc1] text-white text-xs px-2 py-1 rounded">
                              Licensed
                            </span>
                            <span className="text-[#666666]">
                              {selectedRubric?.id === rubric.id ? '▼' : '▶'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {selectedRubric?.id === rubric.id && (
                        <div className="bg-gray-50 p-6 rounded-b-lg border-t-0 mt-1">
                          {loadingDetails ? (
                            <p className="text-[#666666]">Loading...</p>
                          ) : (
                            <div className="space-y-4">
                              {domains.map(domain => (
                                <div key={domain.id} className="bg-white p-4 rounded-lg">
                                  <h5 className="font-semibold text-[#2c3e7e] mb-2">
                                    {domain.name}
                                  </h5>
                                  <ul className="space-y-2">
                                    {getStandardsForDomain(domain.id).map(standard => (
                                      <li key={standard.id} className="text-sm text-[#666666] flex">
                                        <span className="font-medium text-[#477fc1] w-12 flex-shrink-0">
                                          {standard.code}
                                        </span>
                                        <span>{standard.name}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Classified Staff Rubrics */}
            <div>
              <h3 className="text-lg font-semibold text-[#2c3e7e] mb-3">Classified Staff</h3>
              <div className="grid gap-4">
                {rubrics
                  .filter(r => r.staff_type === 'classified')
                  .map(rubric => (
                    <div key={rubric.id}>
                      <div 
                        onClick={() => handleRubricClick(rubric)}
                        className={`bg-white p-6 rounded-lg shadow cursor-pointer transition-all ${
                          selectedRubric?.id === rubric.id ? 'ring-2 ring-[#f3843e]' : 'hover:shadow-md'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold text-[#2c3e7e]">{rubric.name}</h4>
                            <p className="text-sm text-[#666666] mt-1">{rubric.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="bg-[#f3843e] text-white text-xs px-2 py-1 rounded">
                              Classified
                            </span>
                            <span className="text-[#666666]">
                              {selectedRubric?.id === rubric.id ? '▼' : '▶'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {selectedRubric?.id === rubric.id && (
                        <div className="bg-gray-50 p-6 rounded-b-lg border-t-0 mt-1">
                          {loadingDetails ? (
                            <p className="text-[#666666]">Loading...</p>
                          ) : (
                            <div className="space-y-4">
                              {domains.map(domain => (
                                <div key={domain.id} className="bg-white p-4 rounded-lg">
                                  <h5 className="font-semibold text-[#2c3e7e] mb-2">
                                    {domain.name}
                                  </h5>
                                  <ul className="space-y-2">
                                    {getStandardsForDomain(domain.id).map(standard => (
                                      <li key={standard.id} className="text-sm text-[#666666] flex">
                                        <span className="font-medium text-[#f3843e] w-12 flex-shrink-0">
                                          {standard.code}
                                        </span>
                                        <span>{standard.name}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default Rubrics