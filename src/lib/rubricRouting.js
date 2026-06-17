// ============================================================
// Rubric routing by staff position (counselor track + others)
// ------------------------------------------------------------
// position_type is stored with specific values — e.g. 'school_counselor',
// 'ec_counselor', 'principal', 'director' — so exact equality like
// `position_type === 'counselor'` silently fails and counselors (and most
// admins) fall through to the Teacher rubric. These helpers detect the rubric
// category from the stored value robustly (substring match). Classified staff
// don't use a position-based licensed rubric — they get the non-licensed one.
//
// Canonical rubric names (must match the rows in `rubrics`):
//   counselor      → 'School Counselor Rubric'
//   administrator  → 'Administrator/Educational Leader Rubric'
//   teacher        → 'Teacher Rubric (NSQOT-Based)'
//   non-licensed   → 'Non-Licensed 4-Domain Rubric'
// ============================================================

// Name fragment for matching a LICENSED rubric by name (ilike '%frag%').
// Returns null for non-licensed staff (no position-based licensed rubric), so
// callers leave classified staff on their existing rubric lookup.
export function licensedRubricFragment(staff) {
  if (!staff || staff.staff_type !== 'licensed') return null
  const p = (staff.position_type || '').toLowerCase()
  if (p.includes('counselor')) return 'counselor'
  if (
    p.includes('admin') ||
    p.includes('principal') ||
    p.includes('director') ||
    p.includes('leader')
  ) {
    return 'administrator'
  }
  return 'teacher'
}

// Exact canonical rubric name for a staff member (used where an exact-name
// match is needed, e.g. the self-reflection lookup).
export function rubricNameFor(staff) {
  if (!staff || staff.staff_type !== 'licensed') return 'Non-Licensed 4-Domain Rubric'
  switch (licensedRubricFragment(staff)) {
    case 'counselor':
      return 'School Counselor Rubric'
    case 'administrator':
      return 'Administrator/Educational Leader Rubric'
    default:
      return 'Teacher Rubric (NSQOT-Based)'
  }
}
