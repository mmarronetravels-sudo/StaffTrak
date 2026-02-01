import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('Processing...')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for error in URL params
        const error = searchParams.get('error')
        const errorDescription = searchParams.get('error_description')
        
        if (error) {
          console.error('OAuth error:', error, errorDescription)
          navigate(`/login?error=${encodeURIComponent(errorDescription || error)}`)
          return
        }

        setStatus('Verifying authentication...')

        // Get the session from the URL hash
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('Session error:', sessionError)
          navigate('/login?error=session_failed')
          return
        }

        if (!session) {
          // Try to exchange the code for a session
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
            window.location.href
          )
          
          if (exchangeError || !data.session) {
            console.error('Code exchange error:', exchangeError)
            navigate('/login?error=auth_failed')
            return
          }
        }

        // Re-fetch session after potential exchange
        const { data: { session: currentSession } } = await supabase.auth.getSession()

        if (!currentSession) {
          navigate('/login?error=no_session')
          return
        }

        setStatus('Setting up your account...')

        const { user } = currentSession
        const email = user.email?.toLowerCase()

        // Check for allowed domains (configurable)
        const allowedDomains = ['summitlc.org', 'scholarpathsystems.org']
        const userDomain = email?.split('@')[1]
        
        if (allowedDomains.length > 0 && !allowedDomains.includes(userDomain)) {
          await supabase.auth.signOut()
          navigate('/login?error=domain_not_allowed')
          return
        }

        // Check if profile exists
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*, tenants(name)')
          .eq('id', user.id)
          .single()

        if (profile) {
          // Existing profile - go to dashboard
          setStatus('Welcome back!')
          setTimeout(() => navigate('/dashboard'), 500)
          return
        }

        // Check if there's a profile with this email (from CSV import)
        const { data: emailProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', email)
          .single()

        if (emailProfile) {
          // Link existing profile to this auth user
          setStatus('Linking your account...')
          
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ 
              id: user.id,
              // Update name from Google if not set
              full_name: emailProfile.full_name || user.user_metadata?.full_name || user.user_metadata?.name
            })
            .eq('email', email)

          if (updateError) {
            console.error('Profile link error:', updateError)
            // Continue anyway - profile exists
          }

          setTimeout(() => navigate('/dashboard'), 500)
          return
        }

        // No profile exists - this is a new user
        // For school systems, typically users must be pre-created by admin
        setStatus('Account not found')
        await supabase.auth.signOut()
        navigate('/login?error=account_not_found')

      } catch (err) {
        console.error('Callback error:', err)
        navigate('/login?error=unexpected_error')
      }
    }

    handleCallback()
  }, [navigate, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg text-center">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#2c3e7e]">StaffTrak</h1>
        </div>
        
        <div className="animate-spin w-10 h-10 border-4 border-[#2c3e7e] border-t-transparent rounded-full mx-auto"></div>
        
        <p className="mt-4 text-gray-600">{status}</p>
      </div>
    </div>
  )
}
