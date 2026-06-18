import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// ============================================================
// SetPassword (/set-password, alias /reset-password)
// ------------------------------------------------------------
// One page for two flows that both land the user in a Supabase session via the
// URL hash:
//   • Invite     — admin invited the staff member (banked #3 invite flow); they
//                  arrive with no password yet and set one here.
//   • Recovery   — "Forgot password?" on the login page sends a reset link here
//                  (previously pointed at a non-existent /reset-password route).
//
// supabase-js processes the hash on load (detectSessionInUrl) and establishes a
// short-lived session; updateUser({ password }) then sets the password.
// ============================================================

export default function SetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  // Parse any error carried in the URL hash (e.g. expired/used link) once,
  // synchronously, via a lazy initializer — avoids setState-in-effect.
  const [linkError] = useState(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash || '' : ''
    if (!hash.includes('error')) return null
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const desc = params.get('error_description') || params.get('error')
    return desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : null
  })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let mounted = true
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      setHasSession(!!session)
      setReady(true)
    }
    // Give detectSessionInUrl a tick to consume the hash, then check.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setHasSession(!!session)
      setReady(true)
    })
    check()
    return () => {
      mounted = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setDone(true)
    setTimeout(() => navigate('/dashboard'), 1200)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2c3e7e] to-[#477fc1] px-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-[#2c3e7e]">Set Your Password</h1>
          <p className="text-gray-500 mt-1 text-sm">ScholarPath Staff Evaluation</p>
        </div>

        {!ready ? (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-4 border-[#2c3e7e] border-t-transparent rounded-full mx-auto" />
            <p className="text-gray-500 mt-3 text-sm">Verifying your link…</p>
          </div>
        ) : linkError || !hasSession ? (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded text-sm">
              {linkError || 'This link is invalid or has expired. Please request a new invite or password reset.'}
            </div>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2d5b] transition-colors font-medium"
            >
              Back to Login
            </button>
          </div>
        ) : done ? (
          <div className="p-4 bg-green-50 border-l-4 border-green-500 text-green-700 rounded text-sm text-center">
            Password set. Signing you in…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                placeholder="At least 8 characters"
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#477fc1]"
                placeholder="Re-enter password"
                required
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2d5b] transition-colors font-medium disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Set Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
