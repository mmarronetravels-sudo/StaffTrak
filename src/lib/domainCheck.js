// Per-tenant allowed-domain check (banked #3).
// Shared by Login (email/password) and AuthCallback (Google SSO).
//
// allowedDomains: array of bare, lowercased domains from tenants.allowed_domains.
//   - null / undefined / empty array  -> no restriction (allow any).
// Returns true if the email is permitted for this tenant.
export function isEmailDomainAllowed(email, allowedDomains) {
  const list = (allowedDomains || [])
    .map((d) => String(d).trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
  if (list.length === 0) return true // unrestricted
  const domain = String(email || '').toLowerCase().split('@')[1]
  return !!domain && list.includes(domain)
}
