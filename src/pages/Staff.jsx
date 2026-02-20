import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

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
  const [showArchived, setShowArchived] = useState(false)
  
  const [newStaff, setNewStaff] = useState({
    email: '',
    full_name: '',
    role: 'licensed_staff',
    position_type: 'teacher',
    staff_type: 'licensed',
    hire_date: '',
    years_at_school: 1,
    evaluator_id: ''
  })

  useEffect(() => {
    if (profile) {
      fetchStaff()
      fetchEvaluators()
    }
  }, [profile])

  const fetchStaff = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .in('role', ['licensed_staff', 'classified_staff'])
      .order('full_name')

    if (!error) {
      setStaff(data)
    }
    setLoading(false)
  }

  const fetchEvaluators = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .or('is_evaluator.eq.true,role.eq.district_admin')
      .order('full_name')

    if (!error) {
      setEvaluators(data)
    }
  }

  // Calculate years at school from hire_date
  const calculateYearsAtSchool = (hireDate) => {
    if (!hireDate) return null
    const hire = new Date(hireDate)
    const now = new Date()
    let years = now.getFullYear() - hire.getFullYear()
    // If hire anniversary hasn't happened yet this year, subtract 1
    const hireMonth = hire.getMonth()
    const hireDay = hire.getDate()
    const nowMonth = now.getMonth()
    const nowDay = now.getDate()
    if (nowMonth < hireMonth || (nowMonth === hireMonth && nowDay < hireDay)) {
      years--
    }
    // Year 1 starts on hire date (so 0 full years elapsed = Year 1)
    return Math.max(1, years + 1)
  }

  const handleAddStaff = async (e) => {
    e.preventDefault()
    
    // Determine staff_type based on role
    const staffType = newStaff.role === 'licensed_staff' ? 'licensed' : 'classified'
    
    const { data, error } = await supabase
      .from('profiles')
      .insert([{
        ...newStaff,
        staff_type: staffType,
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
        hire_date: selectedStaff.hire_date,
        years_at_school: selectedStaff.years_at_school,
        evaluator_id: selectedStaff.evaluator_id || null,
        is_active: selectedStaff.is_active
      })
      .eq('id', selectedStaff.id)

    if (error) {
      console.error('Error updating staff:', error)
      alert('Error updating staff member.')
    } else {
      // Refresh staff list
      fetchStaff()
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
      evaluator_id: ''
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

  const handleArchiveStaff = async (staffMember) => {
    const action = staffMember.is_active !== false ? 'archive' : 'reactivate'
    if (!confirm(`Are you sure you want to ${action} ${staffMember.full_name}?`)) return

    const newStatus = staffMember.is_active === false ? true : false
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: newStatus })
      .eq('id', staffMember.id)

    if (error) {
      alert('Error updating staff: ' + error.message)
      return
    }

    setStaff(prev => prev.map(s => s.id === staffMember.id ? { ...s, is_active: newStatus } : s))
    setShowViewModal(false)
    setSelectedStaff(null)
  }

  const handleDeleteStaff = async (staffMember) => {
    if (!confirm(`⚠️ PERMANENT DELETE\n\nAre you sure you want to permanently delete ${staffMember.full_name}?\n\nThis will remove all their data including evaluations, observations, and leave records.\n\nConsider archiving instead if you want to keep their records.`)) return
    
    // Second confirmation for safety
    if (!confirm(`Final confirmation: permanently delete ${staffMember.full_name}? This cannot be undone.`)) return

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', staffMember.id)

    if (error) {
      alert('Error deleting staff: ' + error.message)
      return
    }

    setStaff(prev => prev.filter(s => s.id !== staffMember.id))
    setShowViewModal(false)
    setSelectedStaff(null)
  }

  const filteredStaff = staff.filter(s => {
    const matchesFilter = filter === 'all' || 
                         (filter === 'licensed' && s.staff_type === 'licensed') ||
                         (filter === 'classified' && s.staff_type === 'classified')
    const matchesSearch = s.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         s.position_type?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesArchived = showArchived || s.is_active !== false
    return matchesFilter && matchesSearch && matchesArchived
  })

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const positionOptions = {
  licensed: [
    'teacher',
    'school_counselor',
    'ec_counselor',
    'administrator',
    'principal',
    'assistant_principal',
    'director',
    'case_manager',
    'curriculum_specialist',
    'instructional_coach',
    'special_education_director',
    'student_support_specialist'
  ],
  classified: [
    'secretary',
    'registrar',
    'va_advisor',
    'student_advisor',
    'student_support',
    'cultural_liaison',
    'paraprofessional',
    'receptionist',
    'translator',
    'community_partnerships',
    'technology_lead',
    'executive_assistant'
  ]
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
              <a href="/staff" className="text-white hover:text-gray-200 font-semibold">Staff</a>
              <a href="/observations" className="text-white hover:text-gray-200">Observations</a>
              <a href="/meetings" className="text-white hover:text-gray-200">Meetings</a>
              <a href="/summatives" className="text-white hover:text-gray-200">Summatives</a>
              <a href="/reports" className="text-white hover:text-gray-200">Reports</a>
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
          <h2 className="text-2xl font-bold text-[#2c3e7e]">Staff Directory</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#1e2a5e]"
          >
            + Add Staff
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
            {['all', 'licensed', 'classified'].map(f => (
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
            <label className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-sm text-[#666666] cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-gray-300"
              />
              Show Archived
              {staff.filter(s => s.is_active === false).length > 0 && (
                <span className="bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full">
                  {staff.filter(s => s.is_active === false).length}
                </span>
              )}
            </label>
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
          <div className="bg-white rounded-lg shadow overflow-hidden">
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
                  <tr key={member.id} className={`hover:bg-gray-50 ${member.is_active === false ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="font-medium text-[#2c3e7e]">{member.full_name}</div>
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
                        className="text-[#f3843e] hover:text-[#d9702f] mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleArchiveStaff(member)}
                        className={`text-xs ${member.is_active !== false ? 'text-yellow-600 hover:text-yellow-800' : 'text-green-600 hover:text-green-800'}`}
                      >
                        {member.is_active !== false ? 'Archive' : 'Reactivate'}
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
                  Ã—
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
                        const defaultPosition = staffType === 'licensed' ? 'teacher' : 'secretary'
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
                    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-[#2c3e7e] font-medium">
                      {newStaff.hire_date 
                        ? `${calculateYearsAtSchool(newStaff.hire_date)} (auto-calculated from hire date)`
                        : 'Set hire date above to calculate'}
                    </div>
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
                  Ã—
                </button>
              </div>

              <div className="space-y-4">
                {/* Header with name and type badge */}
                <div className="text-center pb-4 border-b">
                  <h4 className="text-2xl font-bold text-[#2c3e7e] mb-2">{selectedStaff.full_name}</h4>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    selectedStaff.staff_type === 'licensed'
                      ? 'bg-[#477fc1] text-white'
                      : 'bg-[#f3843e] text-white'
                  }`}>
                    {selectedStaff.staff_type === 'licensed' ? 'Licensed Staff' : 'Classified Staff'}
                  </span>
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
                      {selectedStaff.hire_date 
                        ? `${calculateYearsAtSchool(selectedStaff.hire_date)} year${calculateYearsAtSchool(selectedStaff.hire_date) !== 1 ? 's' : ''}`
                        : 'Set hire date to calculate'}
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
                      ? (calculateYearsAtSchool(selectedStaff.hire_date) || 1) <= 3 
                        ? `Probationary (Year ${calculateYearsAtSchool(selectedStaff.hire_date) || 1} of 3): Full observation cycle with formal observation required`
                        : `Permanent (Year ${calculateYearsAtSchool(selectedStaff.hire_date) || '?'}): Informal observations only`
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
                  onClick={() => handleArchiveStaff(selectedStaff)}
                  className={`px-4 py-2 rounded-lg text-sm ${
                    selectedStaff.is_active !== false
                      ? 'border border-yellow-400 text-yellow-700 hover:bg-yellow-50'
                      : 'border border-green-400 text-green-700 hover:bg-green-50'
                  }`}
                >
                  {selectedStaff.is_active !== false ? 'Archive' : 'Reactivate'}
                </button>
                <button
                  onClick={() => handleDeleteStaff(selectedStaff)}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm"
                >
                  Delete
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => { setShowViewModal(false); setSelectedStaff(null); }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-[#666666] hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowViewModal(false)
                    handleEditStaff(selectedStaff)
                  }}
                  className="px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2a5e]"
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
                  Ã—
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
                        const defaultPosition = staffType === 'licensed' ? 'teacher' : 'secretary'
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
                    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-[#2c3e7e] font-medium">
                      {selectedStaff.hire_date 
                        ? `${calculateYearsAtSchool(selectedStaff.hire_date)} (auto-calculated from hire date)`
                        : 'Set hire date above to calculate'}
                    </div>
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
