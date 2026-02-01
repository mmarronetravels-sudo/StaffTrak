import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

function Dashboard() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getUser()
  }, [])

  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
    setLoading(false)
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

  if (!user) {
    window.location.href = '/login'
    return null
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Navigation */}
      <nav className="bg-[#2c3e7e] shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">StaffTrak</h1>
          <div className="flex items-center gap-4">
            <span className="text-white">{user.email}</span>
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
        <h2 className="text-2xl font-bold text-[#2c3e7e] mb-6">Dashboard</h2>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-[#2c3e7e]">
            <p className="text-[#666666] text-sm">Staff Assigned</p>
            <p className="text-3xl font-bold text-[#2c3e7e]">0</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-[#477fc1]">
            <p className="text-[#666666] text-sm">Observations Due</p>
            <p className="text-3xl font-bold text-[#2c3e7e]">0</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-[#f3843e]">
            <p className="text-[#666666] text-sm">Overdue Items</p>
            <p className="text-3xl font-bold text-[#f3843e]">0</p>
          </div>
        </div>

        {/* Quick Actions */}
        <h3 className="text-lg font-semibold text-[#2c3e7e] mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <a href="/staff" className="bg-[#2c3e7e] text-white p-4 rounded-lg hover:bg-[#1e2a5e] text-center">
            + Add Staff
          </a>
          <button className="bg-[#477fc1] text-white p-4 rounded-lg hover:bg-[#3a6ca8]">
            + New Observation
          </button>
          <button className="bg-[#477fc1] text-white p-4 rounded-lg hover:bg-[#3a6ca8]">
            View Rubrics
          </button>
          <button className="bg-[#f3843e] text-white p-4 rounded-lg hover:bg-[#d9702f]">
            Reports
          </button>
        </div>
      </main>
    </div>
  )
}

export default Dashboard