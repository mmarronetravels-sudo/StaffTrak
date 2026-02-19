import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Staff from './pages/Staff'
import Rubrics from './pages/Rubrics'
import Goals from './pages/Goals'
import GoalApprovals from './pages/GoalApprovals'
import Observations from './pages/Observations'
import ObservationSession from './pages/ObservationSession'
import MyObservations from './pages/MyObservations'
import SelfReflection from './pages/SelfReflection'
import Meetings from './pages/Meetings'
import MyMeetings from './pages/MyMeetings'
import MeetingSession from './pages/MeetingSession'
import Summatives from './pages/Summatives'
import SummativeEvaluation from './pages/SummativeEvaluation'
import MySummative from './pages/MySummative'
import Reports from './pages/Reports'
import StaffImport from './pages/StaffImport'
import AuthCallback from './pages/AuthCallback'
import LeaveTracker from './pages/LeaveTracker'
import ODEStaffPosition from './pages/ODEStaffPosition'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Protected routes - all authenticated users */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />

          {/* Goals - all users can view their own */}
          <Route 
            path="/goals" 
            element={
              <ProtectedRoute>
                <Goals />
              </ProtectedRoute>
            } 
          />

          {/* Self-Reflection - all authenticated users */}
          <Route 
            path="/self-reflection" 
            element={
              <ProtectedRoute>
                <SelfReflection />
              </ProtectedRoute>
            } 
          />

          {/* My Observations - staff view */}
          <Route 
            path="/my-observations" 
            element={
              <ProtectedRoute>
                <MyObservations />
              </ProtectedRoute>
            } 
          />

          {/* My Meetings - staff view */}
          <Route 
            path="/my-meetings" 
            element={
              <ProtectedRoute>
                <MyMeetings />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/my-meetings/:id" 
            element={
              <ProtectedRoute>
                <MeetingSession />
              </ProtectedRoute>
            } 
          />

          {/* My Summative - staff view */}
          <Route 
            path="/my-summative" 
            element={
              <ProtectedRoute>
                <MySummative />
              </ProtectedRoute>
            } 
          />

          {/* Admin/Evaluator routes - use allowEvaluators for is_evaluator flag */}
          <Route 
            path="/staff" 
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'hr']} allowEvaluators>
                <Staff />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/staff/import" 
            element={
              <ProtectedRoute allowedRoles={['district_admin']}>
                <StaffImport />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/rubrics" 
            element={
              <ProtectedRoute allowedRoles={['district_admin']} allowEvaluators>
                <Rubrics />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/goal-approvals" 
            element={
              <ProtectedRoute allowedRoles={['district_admin']} allowEvaluators>
                <GoalApprovals />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/observations" 
            element={
              <ProtectedRoute allowedRoles={['district_admin']} allowEvaluators>
                <Observations />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/observations/:id" 
            element={
              <ProtectedRoute allowedRoles={['district_admin']} allowEvaluators>
                <ObservationSession />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/meetings" 
            element={
              <ProtectedRoute allowedRoles={['district_admin']} allowEvaluators>
                <Meetings />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/meetings/:id" 
            element={
              <ProtectedRoute>
                <MeetingSession />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/summatives" 
            element={
              <ProtectedRoute allowedRoles={['district_admin']} allowEvaluators>
                <Summatives />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/summatives/:staffId" 
            element={
              <ProtectedRoute allowedRoles={['district_admin']} allowEvaluators>
                <SummativeEvaluation />
              </ProtectedRoute>
            } 
          />

          {/* Reports - Admin/Evaluator/HR */}
          <Route 
            path="/reports" 
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'hr']} allowEvaluators>
                <Reports />
              </ProtectedRoute>
            } 
          />

          {/* Leave Tracker - Admin/HR */}
          <Route 
            path="/leave-tracker" 
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'hr']}>
                <LeaveTracker />
              </ProtectedRoute>
            } 
          />

          {/* ODE Staff Position File - Admin/HR */}
          <Route 
            path="/ode-staff-position" 
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'hr']}>
                <ODEStaffPosition />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

function Home() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-[#2c3e7e] mb-4">StaffTrak</h1>
        <p className="text-[#666666] mb-8">Staff Evaluation Management System</p>
        <a href="/login" className="bg-[#2c3e7e] text-white px-6 py-3 rounded-lg hover:bg-[#1e2a5e]">
          Sign In
        </a>
      </div>
    </div>
  )
}

export default App
