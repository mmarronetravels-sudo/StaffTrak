import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, allowedRoles, allowEvaluators }) {
  const { user, profile, loading } = useAuth()

  // Still checking if user is logged in?
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  // Not logged in? Go to login page
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Waiting for profile to load?
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading profile...</p>
      </div>
    )
  }

  // Check role-based access
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    // If allowEvaluators is true, also grant access to anyone with is_evaluator flag
    if (allowEvaluators && profile.is_evaluator) {
      // Access granted via is_evaluator flag
    } else {
      return <Navigate to="/dashboard" replace />
    }
  }

  // If only allowEvaluators is set (no allowedRoles), check is_evaluator
  if (!allowedRoles && allowEvaluators && !profile.is_evaluator) {
    return <Navigate to="/dashboard" replace />
  }

  // Show the page
  return children
}
