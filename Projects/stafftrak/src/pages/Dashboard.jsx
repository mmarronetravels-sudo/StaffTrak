import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const [tenant, setTenant] = useState(null)

  useEffect(() => {
    if (profile?.tenant_id) {
      fetchTenant()
    }
  }, [profile])

  const fetchTenant = async () => {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', profile.tenant_id)
      .single()

    if (!error) {
      setTenant(data)
    }
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
          <h1 className="text-xl font-bold text-white">StaffTrak</h1>
          <div className="flex items-center gap-4">
            <span className="text-white">{profile?.full_name || user?.email}</span>
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
        {/* Welcome Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[#2c3e7e]">
            Welcome, {profile?.full_name?.split(' ')[0] || 'there'}!
          </h2>
          {tenant && (
            <p className="text-[#666666]">{tenant.name}</p>
          )}
        </div>
        
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