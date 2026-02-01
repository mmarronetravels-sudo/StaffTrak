import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

function Staff() {
  const [user, setUser] = useState(null)
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: 'licensed_staff',
    position_type: '',
    staff_type: 'licensed',
  })

  useEffect(() => {
    getUser()
    fetchStaff()
  }, [])

  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  const fetchStaff = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name')
    
    if (error) {
      console.error('Error fetching staff:', error)
    } else {
      setStaff(data || [])
    }
    setLoading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const { error } = await supabase
      .from('profiles')
      .insert([{
        ...formData,
        id: crypto.randomUUID(),
      }])
    
    if (error) {
      alert('Error adding staff: ' + error.message)
    } else {
      setShowForm(false)
      setFormData({
        full_name: '',
        email: '',
        role: 'licensed_staff',
        position_type: '',
        staff_type: 'licensed',
      })
      fetchStaff()
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-[#666666]">Loading...</p>
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
            <div className="flex gap-4">
              <a href="/dashboard" className="text-white/80 hover:text-white">Dashboard</a>
              <a href="/staff" className="text-white font-medium">Staff</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white">{user?.email}</span>
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
            onClick={() => setShowForm(true)}
            className="bg-[#2c3e7e] text-white px-4 py-2 rounded-lg hover:bg-[#1e2a5e]"
          >
            + Add Staff
          </button>
        </div>

        {/* Add Staff Form */}
        {showForm && (
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <h3 className="text-lg font-semibold text-[#2c3e7e] mb-4">Add New Staff Member</h3>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#666666] text-sm font-medium mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[#666666] text-sm font-medium mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[#666666] text-sm font-medium mb-2">
                    Staff Type
                  </label>
                  <select
                    value={formData.staff_type}
                    onChange={(e) => setFormData({...formData, staff_type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                  >
                    <option value="licensed">Licensed (Certified)</option>
                    <option value="classified">Classified (Non-Licensed)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#666666] text-sm font-medium mb-2">
                    Position
                  </label>
                  <select
                    value={formData.position_type}
                    onChange={(e) => setFormData({...formData, position_type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                    required
                  >
                    <option value="">Select Position...</option>
                    <optgroup label="Licensed">
                      <option value="teacher">Teacher</option>
                      <option value="counselor">School Counselor</option>
                      <option value="administrator">Administrator</option>
                    </optgroup>
                    <optgroup label="Classified">
                      <option value="secretary">Secretary</option>
                      <option value="registrar">Registrar</option>
                      <option value="advisor">Student Advisor</option>
                      <option value="tech_lead">Technology Lead</option>
                      <option value="executive_assistant">Executive Assistant</option>
                    </optgroup>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  className="bg-[#2c3e7e] text-white px-6 py-2 rounded-lg hover:bg-[#1e2a5e]"
                >
                  Add Staff
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="bg-gray-200 text-[#666666] px-6 py-2 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Staff List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Position</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#666666] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-[#666666]">
                    No staff members yet. Click "+ Add Staff" to get started.
                  </td>
                </tr>
              ) : (
                staff.map((person) => (
                  <tr key={person.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-[#2c3e7e] font-medium">{person.full_name}</td>
                    <td className="px-6 py-4 text-[#666666]">{person.email}</td>
                    <td className="px-6 py-4 text-[#666666] capitalize">{person.position_type?.replace('_', ' ')}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        person.staff_type === 'licensed' 
                          ? 'bg-[#477fc1]/10 text-[#477fc1]' 
                          : 'bg-[#f3843e]/10 text-[#f3843e]'
                      }`}>
                        {person.staff_type === 'licensed' ? 'Licensed' : 'Classified'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button className="text-[#477fc1] hover:text-[#2c3e7e]">View</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

export default Staff