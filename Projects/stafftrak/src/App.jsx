import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Staff from './pages/Staff'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/staff" element={<Staff />} />
      </Routes>
    </BrowserRouter>
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