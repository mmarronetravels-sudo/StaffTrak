import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ============================================================
// staff-login-status — HR rollout helper
// ------------------------------------------------------------
// Returns, per staff member in the caller's tenant, whether an auth account
// exists and when they last signed in — so HR can see who's provisioned and
// chase the stragglers before evaluation cycles start. Read-only.
//
// The client can't read auth.users, so this runs with the service role. It is
// authorization-gated: only HR / admin in the caller's tenant get data, and
// only for THEIR tenant's staff.
//
// Auth: called from the app with the caller's JWT (verify_jwt on). We resolve
// the caller from that token, confirm their role, then use the service role
// for the admin listing.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const HR_ADMIN_ROLES = ['hr', 'district_admin', 'school_admin']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: cors })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    // 1. Resolve the caller from their JWT.
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await caller.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    // 2. Service client for privileged reads.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // 3. Confirm the caller is HR/admin and grab their tenant.
    const { data: me } = await admin
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single()
    if (!me || !HR_ADMIN_ROLES.includes(me.role)) {
      return json({ error: 'Forbidden' }, 403)
    }

    // 4. The caller's tenant staff (email is the join key to auth).
    const { data: staff } = await admin
      .from('profiles')
      .select('id, email')
      .eq('tenant_id', me.tenant_id)
    const staffList = (staff || []).filter((s) => s.email)

    // 5. Map every auth user's email → last_sign_in_at (paginated).
    const lastSignInByEmail: Record<string, string | null> = {}
    let page = 1
    const perPage = 1000
    // Cap pages defensively.
    for (let i = 0; i < 50; i++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
      if (error || !data?.users?.length) break
      for (const u of data.users) {
        if (u.email) lastSignInByEmail[u.email.toLowerCase()] = u.last_sign_in_at ?? null
      }
      if (data.users.length < perPage) break
      page++
    }

    // 6. Compose per-staff status.
    const statuses = staffList.map((s) => {
      const key = s.email.toLowerCase()
      const exists = key in lastSignInByEmail
      return {
        email: s.email,
        exists,
        last_sign_in_at: exists ? lastSignInByEmail[key] : null,
      }
    })

    return json({ statuses })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
