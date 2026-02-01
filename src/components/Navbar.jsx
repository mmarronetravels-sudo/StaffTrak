import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, profile, signOut, isAdmin, isEvaluator } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  // Navigation items based on role
  const getNavItems = () => {
    if (isAdmin || isEvaluator) {
      return [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/staff', label: 'Staff' },
        { href: '/observations', label: 'Observations' },
        { href: '/meetings', label: 'Meetings' },
        { href: '/summatives', label: 'Summatives' },
        { href: '/reports', label: 'Reports' },
        { href: '/goal-approvals', label: 'Goal Approvals' }
      ]
    }
    return [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/goals', label: 'My Goals' },
      { href: '/self-reflection', label: 'Self-Reflection' },
      { href: '/my-observations', label: 'My Observations' },
      { href: '/my-meetings', label: 'My Meetings' },
      { href: '/my-summative', label: 'My Evaluation' }
    ]
  }

  return (
    <nav className="bg-[#2c3e7e] shadow">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-8">
          <a href="/dashboard" className="text-xl font-bold text-white">StaffTrak</a>
          {/* Desktop Nav - hidden on mobile */}
          <div className="hidden md:flex gap-4">
            {getNavItems().map(item => (
              <a 
                key={item.href}
                href={item.href} 
                className="text-white hover:text-gray-200"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Username - hidden on mobile */}
          <span className="hidden md:block text-white">{profile?.full_name || user?.email}</span>
          {/* Logout - hidden on mobile */}
          <button
            onClick={handleLogout}
            className="hidden md:block bg-white text-[#2c3e7e] px-4 py-2 rounded-lg hover:bg-gray-100"
          >
            Logout
          </button>
          {/* Hamburger Menu - shown only on mobile */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-white p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>
      
      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#1e2a5e] border-t border-[#477fc1]">
          <div className="px-4 py-2 text-white text-sm border-b border-[#477fc1]">
            {profile?.full_name || user?.email}
          </div>
          {getNavItems().map(item => (
            <a 
              key={item.href}
              href={item.href} 
              className="block px-4 py-3 text-white hover:bg-[#477fc1] border-b border-[#477fc1]/30"
            >
              {item.label}
            </a>
          ))}
          <button
            onClick={handleLogout}
            className="block w-full text-left px-4 py-3 text-white hover:bg-[#477fc1]"
          >
            Logout
          </button>
        </div>
      )}
    </nav>
  )
}