import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ============================================================
// invite-staff — email/password account provisioning (banked #3)
// ------------------------------------------------------------
// An admin (district_admin) or HR invites an imported staff member who doesn't
// use Google SSO. We create a Supabase auth user, email them an invite link
// (which lands on /set-password), and re-key their existing profile row to the
// new auth user id so RLS (auth.uid() = profiles.id) resolves — mirroring what
// AuthCallback already does for the Google path.
//
// Creating auth users needs the service role, so it runs here, not in the
// browser. Authorization is enforced in-function: only district_admin / hr,
// and only for staff in THEIR tenant. The email domain is checked against the
// tenant's allowed_domains (same rule as login).
//
// Body: { staffId: uuid, redirectTo: string }
// Returns: { status: 'invited' | 'pending' | 'active', last_sign_in_at? }
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const INVITE_ROLES = ['district_admin', 'hr']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: cors })

function domainAllowed(email: string, allowed: string[] | null | undefined): boolean {
  const list = (allowed || [])
    .map((d) => String(d).trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
  if (list.length === 0) return true
  const domain = String(email || '').toLowerCase().split('@')[1]
  return !!domain && list.includes(domain)
}

// Find an existing auth user by email (paginated listUsers).
async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const target = email.toLowerCase()
  let page = 1
  const perPage = 1000
  for (let i = 0; i < 50; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error || !data?.users?.length) break
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < perPage) break
    page++
  }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    // 1. Resolve caller from JWT.
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await caller.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    // 2. Service client for privileged work.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // 3. Confirm caller role + tenant.
    const { data: me } = await admin
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single()
    if (!me || !INVITE_ROLES.includes(me.role)) return json({ error: 'Forbidden' }, 403)

    // 4. Parse body + load the target staff profile (must be same tenant).
    const { staffId, redirectTo } = await req.json() as { staffId?: string; redirectTo?: string }
    if (!staffId) return json({ error: 'Missing staffId' }, 400)

    const { data: target } = await admin
      .from('profiles')
      .select('id, email, tenant_id, tenants(allowed_domains)')
      .eq('id', staffId)
      .single()
    if (!target || target.tenant_id !== me.tenant_id) return json({ error: 'Staff not found' }, 404)
    if (!target.email) return json({ error: 'Staff has no email on file' }, 400)

    const email = String(target.email).toLowerCase()
    const allowed = (target as { tenants?: { allowed_domains?: string[] } }).tenants?.allowed_domains
    if (!domainAllowed(email, allowed)) {
      return json({ error: 'That email domain is not allowed for this organization.' }, 400)
    }

    // 5. Branch on existing auth state.
    const existing = await findAuthUserByEmail(admin, email)

    if (existing) {
      if (existing.last_sign_in_at) {
        return json({ status: 'active', last_sign_in_at: existing.last_sign_in_at })
      }
      // Account exists but never signed in — make sure the profile is linked.
      if (target.id !== existing.id) {
        await admin.from('profiles').update({ id: existing.id }).eq('email', email).eq('tenant_id', me.tenant_id)
      }
      return json({ status: 'pending' })
    }

    // 6. No auth user yet — create + email the invite, then link the profile.
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    )
    if (inviteErr || !invited?.user) {
      return json({ error: inviteErr?.message || 'Invite failed' }, 400)
    }
    await admin.from('profiles').update({ id: invited.user.id }).eq('email', email).eq('tenant_id', me.tenant_id)

    console.log(JSON.stringify({
      action: 'staff_invite', tenant_id: me.tenant_id, invited_by: user.id,
      timestamp: new Date().toISOString(),
    }))

    return json({ status: 'invited' })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
