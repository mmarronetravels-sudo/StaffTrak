import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Staff from './pages/Staff'
import Rubrics from './pages/Rubrics'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes - anyone can see */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />

          {/* Protected routes - must be logged in */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />

          {/* Admin/Evaluator only - staff management */}
          <Route 
            path="/staff" 
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'school_admin', 'evaluator']}>
                <Staff />
              </ProtectedRoute>
            } 
          />

          {/* Admin/Evaluator only - rubrics */}
          <Route 
            path="/rubrics" 
            element={
              <ProtectedRoute allowedRoles={['district_admin', 'school_admin', 'evaluator']}>
                <Rubrics />
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