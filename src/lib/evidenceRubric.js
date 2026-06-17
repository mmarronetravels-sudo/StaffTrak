import { supabase } from '../supabaseClient'
import { licensedRubricFragment } from './rubricRouting'

// ============================================================
// Load the rubric (domains + indicators) for a staff member.
// Mirrors SummativeEvaluation.fetchRubric:
//   1. staff.assigned_rubric_id, if set
//   2. fallback to staff_type + position_type name match
// Returns { rubric, domains, standards } (empty arrays if none found).
// ============================================================
export async function loadRubricForStaff(staff) {
  if (!staff) return { rubric: null, domains: [], standards: [] }

  let rubric = null

  if (staff.assigned_rubric_id) {
    const { data } = await supabase
      .from('rubrics')
      .select('id, name, staff_type')
      .eq('id', staff.assigned_rubric_id)
      .single()
    if (data) rubric = data
  }

  if (!rubric) {
    let q = supabase
      .from('rubrics')
      .select('id, name, staff_type')
      .eq('staff_type', staff.staff_type)
      .eq('is_active', true)

    // Detect counselors/admins robustly from position_type (e.g.
    // 'school_counselor'); null for classified leaves their lookup unchanged.
    const frag = licensedRubricFragment(staff)
    if (frag) q = q.ilike('name', `%${frag}%`)

    const { data } = await q.limit(1).maybeSingle()
    rubric = data
  }

  if (!rubric) return { rubric: null, domains: [], standards: [] }

  const { data: domains } = await supabase
    .from('rubric_domains')
    .select('id, name, sort_order')
    .eq('rubric_id', rubric.id)
    .order('sort_order')

  const domainIds = (domains || []).map((d) => d.id)
  let standards = []
  if (domainIds.length) {
    const { data: s } = await supabase
      .from('rubric_standards')
      .select('id, domain_id, code, name, sort_order')
      .in('domain_id', domainIds)
      .order('sort_order')
    standards = s || []
  }

  return { rubric, domains: domains || [], standards }
}
