// Resolve a staff member's probationary vs. permanent status.
// Mirrors the DB resolver public.effective_employment_status (migration 040):
//   - explicit override (employment_status) wins
//   - otherwise derive from hire_date: probationary for the first 3 years of
//     service, permanent once 3 full years have elapsed
//   - null hire_date and no override => null (unknown)

/**
 * @param {{ employment_status?: string|null, hire_date?: string|null }} staff
 * @returns {'probationary'|'permanent'|null}
 */
export function effectiveEmploymentStatus(staff = {}) {
  const { employment_status, hire_date } = staff

  if (employment_status === 'probationary' || employment_status === 'permanent') {
    return employment_status
  }
  if (!hire_date) return null

  const hire = new Date(hire_date)
  if (Number.isNaN(hire.getTime())) return null

  const threeYearsAgo = new Date()
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)

  return hire > threeYearsAgo ? 'probationary' : 'permanent'
}

/** Human label for a resolved status. */
export function employmentStatusLabel(status) {
  if (status === 'probationary') return 'Probationary'
  if (status === 'permanent') return 'Permanent'
  return 'Unknown'
}

/** Tailwind classes for a status pill. */
export function employmentStatusBadgeClass(status) {
  if (status === 'probationary') return 'bg-amber-100 text-amber-800'
  if (status === 'permanent') return 'bg-green-100 text-green-700'
  return 'bg-gray-100 text-gray-500'
}

/** Whether the displayed status came from an explicit override (vs. derived). */
export function isOverridden(staff = {}) {
  return staff.employment_status === 'probationary' || staff.employment_status === 'permanent'
}

/**
 * Persist an override (or pass null to clear and fall back to the hire-date rule).
 * Authorization is enforced server-side (admin/HR or the assigned evaluator).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} staffId
 * @param {'probationary'|'permanent'|null} status
 */
export async function setEmploymentStatus(supabase, staffId, status) {
  return supabase.rpc('set_employment_status', {
    p_staff_id: staffId,
    p_status: status,
  })
}
