import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

function Staff() {
  const { profile, signOut } = useAuth()
  const [staff, setStaff] = useState([])
  const [evaluators, setEvaluators] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  
  const isAdmin = profile?.role === 'district_admin'

  const [newStaff, setNewStaff] = useState({
    email: '',
    full_name: '',
    role: 'licensed_staff',
    position_type: 'teacher',
    staff_type: 'licensed',
    hire_date: '',
    years_at_school: 1,
    evaluator_id: '',
    is_evaluator: false
  })

  useEffect(() => {
    if (profile) {
      fetchStaff()
      fetchEvaluators()
    }
  }, [profile])

  const fetchStaff = async () => {
    let query = supabase
      .from('profiles')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .in('role', ['licensed_staff', 'classified_staff'])
      .order('full_name')

    // Non-admin evaluators only see their assigned staff
    if (!isAdmin && profile.is_evaluator) {
      query = supabase
        .from('profiles')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('evaluator_id', profile.id)
        .order('full_name')
    }

    const { data, error } = await query

    if (!error) {
      setStaff(data || [])
    }
    setLoading(false)
  }

  const fetchEvaluators = async () => {
    // Fetch anyone who is an evaluator (is_evaluator flag) OR is an admin
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, is_evaluator')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .order('full_name')

    if (!error) {
      // Filter to only those who can evaluate
      const evals = (data || []).filter(p => 
        p.is_evaluator === true || 
        p.role === 'district_admin'
      )
      setEvaluators(evals)
    }
  }

  const handleAddStaff = async (e) => {
    e.preventDefault()
    
    // Determine staff_type based on role
    const staffType = newStaff.role === 'licensed_staff' ? 'licensed' : 'classified'
    
    const { data, error } = await supabase
      .from('profiles')
      .insert([{
        email: newStaff.email,
        full_name: newStaff.full_name,
        role: newStaff.role,
        position_type: newStaff.position_type,
        staff_type: staffType,
        hire_date: newStaff.hire_date || null,
        years_at_school: newStaff.years_at_school,
        evaluator_id: newStaff.evaluator_id || null,
        is_evaluator: newStaff.is_evaluator,
        tenant_id: profile.tenant_id,
        is_active: true
      }])
      .select()

    if (error) {
      console.error('Error adding staff:', error)
      alert('Error adding staff member. They may need to create an account first.')
    } else {
      setStaff([...staff, data[0]])
      setShowAddModal(false)
      resetNewStaff()
      // Refresh evaluators list in case new person is an evaluator
      if (newStaff.is_evaluator) fetchEvaluators()
    }
  }

  const handleUpdateStaff = async (e) => {
    e.preventDefault()
    
    const staffType = selectedStaff.role === 'licensed_staff' ? 'licensed' : 'classified'
    
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: selectedStaff.full_name,
        role: selectedStaff.role,
        position_type: selectedStaff.position_type,
        staff_type: staffType,
        hire_date: selectedStaff.hire_date || null,
        years_at_school: selectedStaff.years_at_school,
        evaluator_id: selectedStaff.evaluator_id || null,
        is_evaluator: selectedStaff.is_evaluator || false,
        is_active: selectedStaff.is_active
      })
      .eq('id', selectedStaff.id)

    if (error) {
      console.error('Error updating staff:', error)
      alert('Error updating staff member.')
    } else {
      fetchStaff()
      fetchEvaluators() // Refresh in case evaluator status changed
      setShowEditModal(false)
      setSelectedStaff(null)
    }
  }

  const resetNewStaff = () => {
    setNewStaff({
      email: '',
      full_name: '',
      role: 'licensed_staff',
      position_type: 'teacher',
      staff_type: 'licensed',
      hire_date: '',
      years_at_school: 1,
      evaluator_id: '',
      is_evaluator: false
    })
  }

  const handleViewStaff = (staffMember) => {
    setSelectedStaff(staffMember)
    setShowViewModal(true)
  }

  const handleEditStaff = (staffMember) => {
    setSelectedStaff({ ...staffMember })
    setShowEditModal(true)
  }

  const getEvaluatorName = (evaluatorId) => {
    const evaluator = evaluators.find(e => e.id === evaluatorId)
    return evaluator ? evaluator.full_name : 'Not Assigned'
  }

  const filteredStaff = staff.filter(s => {
    const matchesFilter = filter === 'all' || 
                         (filter === 'licensed' && s.staff_type === 'licensed') ||
                         (filter === 'classified' && s.staff_type === 'classified') ||
                         (filter === 'evaluators' && s.is_evaluator === true)
    const matchesSearch = s.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         s.position_type?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const positionOptions = {
    licensed: [
      'teacher', 
      'school_counselor', 
      'principal',
      'assistant_principal',
      'director',
      'case_manager',
      'special_education_director',
      'curriculum_specialist',
      'instructional_coach'
    ],
    classified: [
      'advisor',
      'student_support',
      'paraprofessional',
      'secretary', 
      'registrar',
      'receptionist',
      'office_manager',
      'technology_lead', 
      'translator',
      'community_partnerships',
      'executive_assistant',
      'bookkeeper'
    ]
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-[#2c3e7e]">Staff Directory</h2>
          <div className="flex gap-2">
            {isAdmin && (
              <a
                href="/staff/import"
                className="bg-white text-[#2c3e7e] border border-[#2c3e7e] px-4 py-2 rounded-lg hover:bg-gray-50"
              >
                Import CSV
              </a>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#1e2a5e]"
            >
              + Add Staff
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#2c3e7e]">
            <p className="text-[#666666] text-sm">Total Staff</p>
            <p className="text-2xl font-bold text-[#2c3e7e]">{staff.length}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#477fc1]">
            <p className="text-[#666666] text-sm">Licensed Staff</p>
            <p className="text-2xl font-bold text-[#477fc1]">
              {staff.filter(s => s.staff_type === 'licensed').length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#f3843e]">
            <p className="text-[#666666] text-sm">Classified Staff</p>
            <p className="text-2xl font-bold text-[#f3843e]">
              {staff.filter(s => s.staff_type === 'classified').length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
            <p className="text-[#666666] text-sm">Evaluators</p>
            <p className="text-2xl font-bold text-green-600">
              {staff.filter(s => s.is_evaluator === true).length}
            </p>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <input
            type="text"
            placeholder="Search by name, email, or position..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
          />
          <div className="flex gap-2">
            {['all', 'licensed', 'classified', 'evaluators'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg capitalize ${
                  filter === f
                    ? 'bg-[#2c3e7e] text-white'
                    : 'bg-white text-[#666666] hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
        </div>

        {/* Staff List */}
        {loading ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-[#666666]">Loading staff...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <p className="text-[#666666] mb-4">
              {searchTerm || filter !== 'all' 
                ? 'No staff members match your search.' 
                : 'No staff members found. Add your first staff member!'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">
                    Evaluator
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-[#666666] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredStaff.map(member => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="font-medium text-[#2c3e7e] flex items-center gap-2">
                          {member.full_name}
                          {member.is_evaluator && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded font-medium">
                              EVALUATOR
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-[#666666]">{member.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-[#666666] capitalize">
                      {member.position_type?.replace(/_/g, ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded ${
                        member.staff_type === 'licensed'
                          ? 'bg-[#477fc1] text-white'
                          : 'bg-[#f3843e] text-white'
                      }`}>
                        {member.staff_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-[#666666]">
                      {getEvaluatorName(member.evaluator_id)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded ${
                        member.is_active !== false
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {member.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleViewStaff(member)}
                        className="text-[#477fc1] hover:text-[#2c3e7e] mr-3"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleEditStaff(member)}
                        className="text-[#f3843e] hover:text-[#d9702f]"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#2c3e7e]">Add Staff Member</h3>
                <button
                  onClick={() => { setShowAddModal(false); resetNewStaff(); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleAddStaff}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={newStaff.full_name}
                      onChange={(e) => setNewStaff({...newStaff, full_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={newStaff.email}
                      onChange={(e) => setNewStaff({...newStaff, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Staff Type *
                    </label>
                    <select
                      value={newStaff.role}
                      onChange={(e) => {
                        const role = e.target.value
                        const staffType = role === 'licensed_staff' ? 'licensed' : 'classified'
                        const defaultPosition = staffType === 'licensed' ? 'teacher' : 'advisor'
                        setNewStaff({
                          ...newStaff, 
                          role, 
                          staff_type: staffType,
                          position_type: defaultPosition
                        })
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    >
                      <option value="licensed_staff">Licensed (Certified)</option>
                      <option value="classified_staff">Classified (Non-Licensed)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Position *
                    </label>
                    <select
                      value={newStaff.position_type}
                      onChange={(e) => setNewStaff({...newStaff, position_type: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    >
                      {positionOptions[newStaff.role === 'licensed_staff' ? 'licensed' : 'classified'].map(pos => (
                        <option key={pos} value={pos}>
                          {pos.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Hire Date
                    </label>
                    <input
                      type="date"
                      value={newStaff.hire_date}
                      onChange={(e) => setNewStaff({...newStaff, hire_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Years at School
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={newStaff.years_at_school}
                      onChange={(e) => setNewStaff({...newStaff, years_at_school: parseInt(e.target.value) || 1})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Assigned Evaluator
                    </label>
                    <select
                      value={newStaff.evaluator_id}
                      onChange={(e) => setNewStaff({...newStaff, evaluator_id: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    >
                      <option value="">Select Evaluator</option>
                      {evaluators.map(ev => (
                        <option key={ev.id} value={ev.id}>{ev.full_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Evaluator toggle - admin only */}
                  {isAdmin && (
                    <div className="bg-purple-50 p-3 rounded-lg">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newStaff.is_evaluator}
                          onChange={(e) => setNewStaff({...newStaff, is_evaluator: e.target.checked})}
                          className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm font-medium text-purple-800">
                          This person evaluates other staff members
                        </span>
                      </label>
                      <p className="text-xs text-purple-600 mt-1 ml-6">
                        Grants access to Observations, Meetings, Summatives, and Goal Approvals for their assigned staff
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); resetNewStaff(); }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e]"
                  >
                    Add Staff
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* View Staff Modal */}
      {showViewModal && selectedStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#2c3e7e]">Staff Details</h3>
                <button
                  onClick={() => { setShowViewModal(false); setSelectedStaff(null); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {/* Header with name and type badge */}
                <div className="text-center pb-4 border-b">
                  <h4 className="text-2xl font-bold text-[#2c3e7e] mb-2">{selectedStaff.full_name}</h4>
                  <div className="flex items-center justify-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      selectedStaff.staff_type === 'licensed'
                        ? 'bg-[#477fc1] text-white'
                        : 'bg-[#f3843e] text-white'
                    }`}>
                      {selectedStaff.staff_type === 'licensed' ? 'Licensed Staff' : 'Classified Staff'}
                    </span>
                    {selectedStaff.is_evaluator && (
                      <span className="px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-700">
                        Evaluator
                      </span>
                    )}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-[#666666]">Email</p>
                    <p className="font-medium text-[#2c3e7e]">{selectedStaff.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-[#666666]">Position</p>
                    <p className="font-medium text-[#2c3e7e] capitalize">
                      {selectedStaff.position_type?.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-[#666666]">Hire Date</p>
                    <p className="font-medium text-[#2c3e7e]">
                      {selectedStaff.hire_date 
                        ? new Date(selectedStaff.hire_date).toLocaleDateString() 
                        : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-[#666666]">Years at School</p>
                    <p className="font-medium text-[#2c3e7e]">
                      {selectedStaff.years_at_school || 1} year{selectedStaff.years_at_school !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-[#666666]">Evaluator</p>
                    <p className="font-medium text-[#2c3e7e]">
                      {getEvaluatorName(selectedStaff.evaluator_id)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-[#666666]">Status</p>
                    <span className={`px-2 py-1 text-xs rounded ${
                      selectedStaff.is_active !== false
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {selectedStaff.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Evaluation Info */}
                <div className="pt-4 border-t">
                  <h5 className="font-semibold text-[#2c3e7e] mb-2">Evaluation Track</h5>
                  <p className="text-sm text-[#666666]">
                    {selectedStaff.staff_type === 'licensed' 
                      ? selectedStaff.years_at_school <= 3 
                        ? 'Probationary (Years 1-3): Full observation cycle with formal observation required'
                        : 'Permanent (Year 4+): Informal observations only'
                      : 'Classified: Annual evaluation with mid-year and summative reviews'
                    }
                  </p>
                </div>

                {/* Quick Links */}
                <div className="pt-4 border-t">
                  <h5 className="font-semibold text-[#2c3e7e] mb-2">Quick Actions</h5>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/observations?staff=${selectedStaff.id}`}
                      className="px-3 py-1 bg-gray-100 text-[#666666] rounded hover:bg-gray-200 text-sm"
                    >
                      View Observations
                    </a>
                    <a
                      href={`/summatives/${selectedStaff.id}`}
                      className="px-3 py-1 bg-gray-100 text-[#666666] rounded hover:bg-gray-200 text-sm"
                    >
                      View Evaluation
                    </a>
                    <a
                      href={`/meetings?staff=${selectedStaff.id}`}
                      className="px-3 py-1 bg-gray-100 text-[#666666] rounded hover:bg-gray-200 text-sm"
                    >
                      View Meetings
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setShowViewModal(false); setSelectedStaff(null); }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowViewModal(false)
                    handleEditStaff(selectedStaff)
                  }}
                  className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e]"
                >
                  Edit Staff
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {showEditModal && selectedStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-[#2c3e7e]">Edit Staff Member</h3>
                <button
                  onClick={() => { setShowEditModal(false); setSelectedStaff(null); }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleUpdateStaff}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={selectedStaff.full_name}
                      onChange={(e) => setSelectedStaff({...selectedStaff, full_name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={selectedStaff.email}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-[#666666]"
                    />
                    <p className="text-xs text-[#666666] mt-1">Email cannot be changed</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Staff Type *
                    </label>
                    <select
                      value={selectedStaff.role}
                      onChange={(e) => {
                        const role = e.target.value
                        const staffType = role === 'licensed_staff' ? 'licensed' : 'classified'
                        const defaultPosition = staffType === 'licensed' ? 'teacher' : 'advisor'
                        setSelectedStaff({
                          ...selectedStaff, 
                          role, 
                          staff_type: staffType,
                          position_type: defaultPosition
                        })
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    >
                      <option value="licensed_staff">Licensed (Certified)</option>
                      <option value="classified_staff">Classified (Non-Licensed)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Position *
                    </label>
                    <select
                      value={selectedStaff.position_type}
                      onChange={(e) => setSelectedStaff({...selectedStaff, position_type: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    >
                      {positionOptions[selectedStaff.role === 'licensed_staff' ? 'licensed' : 'classified'].map(pos => (
                        <option key={pos} value={pos}>
                          {pos.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Hire Date
                    </label>
                    <input
                      type="date"
                      value={selectedStaff.hire_date || ''}
                      onChange={(e) => setSelectedStaff({...selectedStaff, hire_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Years at School
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={selectedStaff.years_at_school || 1}
                      onChange={(e) => setSelectedStaff({...selectedStaff, years_at_school: parseInt(e.target.value) || 1})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#666666] mb-1">
                      Assigned Evaluator
                    </label>
                    <select
                      value={selectedStaff.evaluator_id || ''}
                      onChange={(e) => setSelectedStaff({...selectedStaff, evaluator_id: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    >
                      <option value="">Select Evaluator</option>
                      {evaluators.map(ev => (
                        <option key={ev.id} value={ev.id}>{ev.full_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Evaluator toggle - admin only */}
                  {isAdmin && (
                    <div className="bg-purple-50 p-3 rounded-lg">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedStaff.is_evaluator || false}
                          onChange={(e) => setSelectedStaff({...selectedStaff, is_evaluator: e.target.checked})}
                          className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm font-medium text-purple-800">
                          This person evaluates other staff members
                        </span>
                      </label>
                      <p className="text-xs text-purple-600 mt-1 ml-6">
                        Grants access to Observations, Meetings, Summatives, and Goal Approvals for their assigned staff
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedStaff.is_active !== false}
                        onChange={(e) => setSelectedStaff({...selectedStaff, is_active: e.target.checked})}
                        className="w-4 h-4 text-[#2c3e7e] rounded focus:ring-[#477fc1]"
                      />
                      <span className="text-sm text-[#666666]">Active (uncheck to deactivate)</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setSelectedStaff(null); }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e]"
                  >
                    Save Changes
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

export default Staff
