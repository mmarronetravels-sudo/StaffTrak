import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Staff from './pages/Staff'
import StaffDetail from './pages/StaffDetail'
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
import SetPassword from './pages/SetPassword'
import Settings from './pages/Settings'
import MyChecklist from './pages/MyChecklist'
import Checklists from './pages/Checklists'
import Calendar from './pages/Calendar'
import MyEvidence from './pages/MyEvidence'
import Evidence from './pages/Evidence'
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
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/reset-password" element={<SetPassword />} />

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

          {/* My Checklist - all authenticated users (their own cycle) */}
          <Route
            path="/my-checklist"
            element={
              <ProtectedRoute>
                <MyChecklist />
              </ProtectedRoute>
            }
          />

          {/* Calendar - all authenticated users (staff see own, evaluators see caseload + can schedule) */}
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <Calendar />
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

          {/* My Evidence - all authenticated users (their own body of evidence) */}
          <Route
            path="/my-evidence"
            element={
              <ProtectedRoute>
                <MyEvidence />
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

          {/* Admin + Evaluator routes (is_evaluator flag OR admin role) */}
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={['district_admin']} allowEvaluators>
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
            path="/staff/:id"
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'school_admin', 'hr']} allowEvaluators>
                <StaffDetail />
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

          {/* Evaluation Checklists - Admin + Evaluators + HR */}
          <Route
            path="/checklists"
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'hr']} allowEvaluators>
                <Checklists />
              </ProtectedRoute>
            }
          />

          {/* Body of Evidence - Admin + Evaluators + HR */}
          <Route
            path="/evidence"
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'hr']} allowEvaluators>
                <Evidence />
              </ProtectedRoute>
            }
          />

          {/* Reports - Admin + Evaluators + HR */}
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'hr']} allowEvaluators>
                <Reports />
              </ProtectedRoute>
            }
          />

          {/* Leave Tracker - Admin + HR */}
          <Route
            path="/leave-tracker"
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'hr']}>
                <LeaveTracker />
              </ProtectedRoute>
            }
          />

          {/* Settings - Admin + HR (tenant configuration) */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'hr']}>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* ODE Staff Position - Admin + HR */}
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
        <h1 className="text-4xl font-bold text-[#2c3e7e] mb-4">ScholarPath Staff Evaluation</h1>
        <p className="text-[#666666] mb-8">Staff Evaluation Management System</p>
        <a href="/login" className="bg-[#2c3e7e] text-white px-6 py-3 rounded-lg hover:bg-[#1e2a5e]">
          Sign In
        </a>
      </div>
    </div>
  )
}

export default App
