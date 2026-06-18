import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

// ============================================================
// Settings (/settings) — tenant administration (banked #3)
// ------------------------------------------------------------
// v1 manages the tenant's allowed login email domains. Saving goes through the
// set_tenant_allowed_domains RPC (migration 031), which authorizes the caller
// (district_admin / hr) and updates only their own tenant row. Reads use the
// normal tenant SELECT the app already relies on.
// ============================================================

export default function Settings() {
  const { profile, isHR } = useAuth()
  const canManage = profile?.role === 'district_admin' || isHR

  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (profile?.tenant_id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tenants')
      .select('allowed_domains')
      .eq('id', profile.tenant_id)
      .maybeSingle()
    if (error) setErr(error.message)
    setText(((data?.allowed_domains) || []).join('\n'))
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    setErr(null)
    // Split on newlines/commas, normalize is also done server-side.
    const domains = text
      .split(/[\n,]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean)
    const { data, error } = await supabase.rpc('set_tenant_allowed_domains', { p_domains: domains })
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    setText(((data?.allowed_domains) || []).join('\n'))
    setMsg('Saved.')
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-[#2c3e7e]">Settings</h2>
        <p className="text-[#666666] mb-6">Organization configuration</p>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-[#2c3e7e]">Allowed login domains</h3>
          <p className="text-sm text-[#666666] mt-1 mb-4">
            Only people whose email address ends in one of these domains can sign in
            (Google or password). One domain per line, e.g. <code>summitlearning.org</code>.
            Leave empty to allow any domain.
          </p>

          {loading ? (
            <p className="text-sm text-[#999999]">Loading…</p>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={!canManage || saving}
                rows={5}
                placeholder="summitlearning.org"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#477fc1] disabled:bg-gray-50 disabled:text-gray-500"
              />

              {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
              {msg && <p className="text-sm text-green-700 mt-2">{msg}</p>}

              {canManage ? (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-[#2c3e7e] text-white rounded-lg hover:bg-[#1e2d5b] disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save domains'}
                  </button>
                  <button
                    onClick={load}
                    disabled={saving}
                    className="px-4 py-2 border border-gray-300 text-[#666666] rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    Reset
                  </button>
                </div>
              ) : (
                <p className="text-xs text-[#999999] mt-3">
                  Only a district admin or HR can change these.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
