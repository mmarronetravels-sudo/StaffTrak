import { supabase } from '../supabaseClient'

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

    if (staff.position_type === 'teacher') q = q.ilike('name', '%teacher%')
    else if (staff.position_type === 'counselor') q = q.ilike('name', '%counselor%')
    else if (staff.position_type === 'administrator') q = q.ilike('name', '%administrator%')

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
