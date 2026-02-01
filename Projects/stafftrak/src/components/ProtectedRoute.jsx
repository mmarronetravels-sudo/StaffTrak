import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth()

  // Still checking if user is logged in? Show loading spinner
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#666666]">Loading...</p>
        </div>
      </div>
    )
  }

  // Not logged in? Send to login page
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // If specific roles are required, check them
  if (allowedRoles && allowedRoles.length > 0) {
    // Still waiting for profile to load
    if (!profile) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#2c3e7e] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-[#666666]">Loading profile...</p>
          </div>
        </div>
      )
    }

    // User doesn't have the right role? Show access denied
    if (!allowedRoles.includes(profile.role)) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center bg-white p-8 rounded-lg shadow-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
            <p className="text-[#666666] mb-4">You don't have permission to view this page.</p>
            <a 
              href="/dashboard" 
              className="text-[#477fc1] hover:underline"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      )
    }
  }

  // All checks passed! Show the page
  return children
}