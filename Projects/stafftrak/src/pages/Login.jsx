import { useState } from 'react'
import { supabase } from '../supabaseClient'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
    } else {
      window.location.href = '/dashboard'
    }
    setLoading(false)
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Check your email for a confirmation link!')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-2 text-center text-[#2c3e7e]">StaffTrak</h1>
        <p className="text-[#666666] text-center mb-6">Sign in to your account</p>
        
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-[#666666] text-sm font-medium mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              placeholder="you@school.org"
              required
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-[#666666] text-sm font-medium mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
              placeholder="••••••••"
              required
            />
          </div>

          {message && (
            <div className="mb-4 p-3 bg-[#477fc1]/10 text-[#2c3e7e] rounded-lg text-sm">
              {message}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2c3e7e] text-white py-2 rounded-lg hover:bg-[#1e2a5e] disabled:opacity-50 mb-3"
          >
            {loading ? 'Loading...' : 'Sign In'}
          </button>
          
          <button
            type="button"
            onClick={handleSignUp}
            disabled={loading}
            className="w-full bg-[#f3843e] text-white py-2 rounded-lg hover:bg-[#d9702f] disabled:opacity-50"
          >
            Create Account
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login