import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const C = {
  navy: '#2c3e7e',
  orange: '#f3843e',
}

export default function Navbar() {
  const { user, profile, signOut, isAdmin, isEvaluator } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState(null) // 'myEval' | 'evaluations' | 'hr' | 'user'

  const dropdownRef = useRef(null)

  const isHR = profile?.role === 'hr'
  const isAdminOrEvaluator = isAdmin || isEvaluator
  const isStaffOnly = !isHR && !isAdmin && !isEvaluator

  if (!profile) return null

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const leaveTrakUrl = import.meta.env.VITE_LEAVETRAK_URL

  const handleSwitchToLeaveTrak = async (e) => {
    e.preventDefault()
    if (!leaveTrakUrl) return
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      window.location.href = `${leaveTrakUrl}/dashboard?token=${session.access_token}&refresh=${session.refresh_token}`
    } else {
      window.location.href = leaveTrakUrl
    }
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handleMouseDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  // Close dropdowns on route change
  useEffect(() => {
    setOpenDropdown(null)
    setMobileOpen(false)
  }, [location.pathname])

  const toggleDropdown = (name) => {
    setOpenDropdown(prev => prev === name ? null : name)
  }

  const isActive = (path) => location.pathname === path

  // Check if any path in a group is active
  const isGroupActive = (paths) => paths.some(p => location.pathname === p)

  // Role label for display
  const roleLabel = () => {
    if (isAdmin) return 'Admin'
    if (isEvaluator) return 'Evaluator'
    if (isHR) return 'HR'
    return 'Staff'
  }

  // Initials from full name
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  // First name only for navbar button
  const firstName = profile?.full_name?.split(' ')[0] || profile?.email || ''

  // ── Nav structure ─────────────────────────────────────────────

  // My Evaluation group (staff + evaluators can see their own)
  const myEvalLinks = [
    { to: '/goals', label: 'My Goals', icon: '🎯' },
    { to: '/self-reflection', label: 'Self-Reflection', icon: '🔍' },
    { to: '/my-observations', label: 'My Observations', icon: '👁' },
    { to: '/my-meetings', label: 'My Meetings', icon: '🗓' },
    { to: '/my-summative', label: 'My Evaluation', icon: '📄' },
  ]

  // Evaluations group (admin/evaluator only)
  const evaluationLinks = [
    { to: '/observations', label: 'Observations', icon: '👁' },
    { to: '/meetings', label: 'Meetings', icon: '🗓' },
    { to: '/summatives', label: 'Summatives', icon: '📄' },
    { to: '/goal-approvals', label: 'Goal Approvals', icon: '✅' },
  ]

  // HR group (admin + hr)
  const hrLinks = [
    { to: '/staff', label: 'Staff Directory', icon: '👥', adminOnly: false },
    { to: '/leave-tracker', label: 'Leave Tracker', icon: '🏥' },
    { to: '/ode-staff-position', label: 'ODE Position File', icon: '📁' },
  ]

  // ── Dropdown component ────────────────────────────────────────

  const DropdownMenu = ({ name, label, icon, links, groupPaths }) => {
    const isOpen = openDropdown === name
    const groupActive = isGroupActive(groupPaths)

    return (
      <div className="relative">
        <button
          onClick={() => toggleDropdown(name)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            groupActive || isOpen
              ? 'bg-white/20 text-white'
              : 'text-blue-200 hover:text-white hover:bg-white/10'
          }`}
        >
          <span>{icon}</span>
          <span>{label}</span>
          <svg
            className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50">
            {links.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all ${
                  isActive(link.to)
                    ? 'border-l-2 border-[#2c3e7e] bg-[#EEF2FF] text-[#2c3e7e] font-medium pl-[14px]'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{link.icon}</span>
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <nav style={{ background: C.navy }} className="shadow-lg" ref={dropdownRef}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-14">

          {/* ── Logo ── */}
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ background: C.orange }}
            >
              ST
            </div>
            <div>
              <span className="text-white font-bold text-lg tracking-tight">StaffTrak</span>
              <span className="text-blue-200 text-xs ml-2 hidden sm:inline">ScholarPath Systems</span>
            </div>
          </Link>

          {/* ── Desktop Nav ── */}
          <div className="hidden lg:flex items-center gap-1">

            {/* Dashboard — everyone */}
            <Link
              to="/dashboard"
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                isActive('/dashboard')
                  ? 'bg-white/20 text-white'
                  : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}
            >
              🏠 Dashboard
            </Link>

            {/* My Evaluation — staff + evaluators/admins (anyone who has personal eval pages) */}
            {!isHR && (
              <DropdownMenu
                name="myEval"
                label="My Evaluation"
                icon="📋"
                links={myEvalLinks}
                groupPaths={myEvalLinks.map(l => l.to)}
              />
            )}

            {/* Evaluations — admin/evaluator */}
            {isAdminOrEvaluator && (
              <DropdownMenu
                name="evaluations"
                label="Evaluations"
                icon="✏️"
                links={evaluationLinks}
                groupPaths={evaluationLinks.map(l => l.to)}
              />
            )}

            {/* Reports — admin/evaluator */}
            {isAdminOrEvaluator && (
              <Link
                to="/reports"
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive('/reports')
                    ? 'bg-white/20 text-white'
                    : 'text-blue-200 hover:text-white hover:bg-white/10'
                }`}
              >
                📊 Reports
              </Link>
            )}

            {/* HR — admin + hr */}
            {(isAdmin || isHR) && (
              <DropdownMenu
                name="hr"
                label="HR"
                icon="🏥"
                links={hrLinks}
                groupPaths={hrLinks.map(l => l.to)}
              />
            )}
          </div>

          {/* ── Right side: User Avatar Menu + Mobile Hamburger ── */}
          <div className="flex items-center gap-2">

            {/* User Avatar Dropdown */}
            <div className="hidden lg:block relative">
              <button
                onClick={() => toggleDropdown('user')}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  openDropdown === 'user'
                    ? 'bg-white/20 text-white'
                    : 'text-blue-200 hover:text-white hover:bg-white/10'
                }`}
              >
                {/* Initials circle */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: C.orange }}
                >
                  {initials}
                </div>
                <span className="text-white font-medium">{firstName}</span>
                <span className="text-blue-300 text-[10px] uppercase tracking-wide">{roleLabel()}</span>
                <svg
                  className={`w-3 h-3 transition-transform ${openDropdown === 'user' ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {openDropdown === 'user' && (
                <div className="absolute top-full right-0 mt-1 w-60 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50">
                  {/* User info header */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                        style={{ background: C.orange }}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{profile.full_name}</p>
                        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                        <span
                          className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                          style={{ background: C.navy }}
                        >
                          {roleLabel()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Switch to LeaveTrak (only shown when bundled) */}
                  {leaveTrakUrl && (
                    <a
                      href={leaveTrakUrl}
                      onClick={handleSwitchToLeaveTrak}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-all"
                    >
                      <span>🔀</span>
                      <span>Switch to LeaveTrak</span>
                    </a>
                  )}

                  <div className="border-t border-gray-100 my-1" />

                  {/* Sign Out */}
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-all"
                  >
                    <span>🚪</span>
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-md text-blue-200 hover:text-white hover:bg-white/10"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileOpen
                  ? <path d="M18 6L6 18M6 6l12 12" />
                  : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
                }
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Menu ── */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-white/10 px-4 py-3 space-y-1">

          {/* Dashboard */}
          <Link
            to="/dashboard"
            onClick={() => setMobileOpen(false)}
            className={`block px-3 py-2 rounded-md text-sm font-medium transition-all ${
              isActive('/dashboard') ? 'bg-white/20 text-white' : 'text-blue-200 hover:text-white hover:bg-white/10'
            }`}
          >
            🏠 Dashboard
          </Link>

          {/* My Evaluation section */}
          {!isHR && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-blue-300">My Evaluation</p>
              {myEvalLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    isActive(link.to) ? 'bg-white/20 text-white' : 'text-blue-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="mr-2">{link.icon}</span>{link.label}
                </Link>
              ))}
            </>
          )}

          {/* Evaluations section */}
          {isAdminOrEvaluator && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-blue-300">Evaluations</p>
              {evaluationLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    isActive(link.to) ? 'bg-white/20 text-white' : 'text-blue-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="mr-2">{link.icon}</span>{link.label}
                </Link>
              ))}
              <Link
                to="/reports"
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  isActive('/reports') ? 'bg-white/20 text-white' : 'text-blue-200 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="mr-2">📊</span>Reports
              </Link>
            </>
          )}

          {/* HR section */}
          {(isAdmin || isHR) && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-blue-300">HR</p>
              {hrLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    isActive(link.to) ? 'bg-white/20 text-white' : 'text-blue-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="mr-2">{link.icon}</span>{link.label}
                </Link>
              ))}
            </>
          )}

          {/* User info + actions */}
          <div className="border-t border-white/10 pt-3 mt-3">
            <div className="flex items-center gap-2 px-3 mb-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: C.orange }}
              >
                {initials}
              </div>
              <div>
                <p className="text-white text-sm font-medium">{profile.full_name}</p>
                <p className="text-blue-300 text-[10px] uppercase tracking-wide">{roleLabel()}</p>
              </div>
            </div>
            {leaveTrakUrl && (
              <a
                href={leaveTrakUrl}
                onClick={handleSwitchToLeaveTrak}
                className="block px-3 py-2 rounded-md text-sm font-semibold text-[#f3843e] hover:text-white hover:bg-white/10 transition-all"
              >
                🔀 Switch to LeaveTrak
              </a>
            )}
            <button
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-all"
            >
              🚪 Sign Out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
