// ============================================================
// Goal reviews — single source of truth (Phase 4b #6)
// ------------------------------------------------------------
// The `goal_reviews` table holds a staff-authored progress entry per goal per
// phase. Each goal (2 SLG + 1 PGG) carries forward into the Mid-Year Review and
// the End-of-Year (Summative) conference with its own status + note. Staff
// draft and submit these ahead of the meeting; the evaluator sees them there.
// ============================================================

export const REVIEW_PHASES = {
  mid_year: {
    label: 'Mid-Year',
    blurb: 'Progress at the Mid-Year Review.',
    meetingType: 'mid_year_review',
  },
  final: {
    label: 'Final',
    blurb: 'Outcome at the End-of-Year (Summative) conference.',
    meetingType: 'end_year_review',
  },
}

export const REVIEW_PHASE_ORDER = ['mid_year', 'final']

export const REVIEW_STATUSES = {
  on_track: { label: 'On track', badge: 'bg-blue-100 text-blue-800' },
  met:      { label: 'Met',       badge: 'bg-green-100 text-green-800' },
  not_met:  { label: 'Not met',   badge: 'bg-red-100 text-red-700' },
  revised:  { label: 'Revised',   badge: 'bg-amber-100 text-amber-800' },
}

export const REVIEW_STATUS_ORDER = ['on_track', 'met', 'not_met', 'revised']

export function reviewPhaseLabel(phase) {
  if (REVIEW_PHASES[phase]) return REVIEW_PHASES[phase].label
  if (!phase) return 'Review'
  return phase.charAt(0).toUpperCase() + phase.slice(1).replace(/_/g, ' ')
}

export function reviewStatusLabel(status) {
  return REVIEW_STATUSES[status]?.label || '—'
}

export function reviewStatusBadge(status) {
  return REVIEW_STATUSES[status]?.badge || 'bg-gray-200 text-gray-600'
}

// Map a meeting's `meeting_type` to its review phase (or null).
export function reviewPhaseForMeetingType(meetingType) {
  return REVIEW_PHASE_ORDER.find(
    (p) => REVIEW_PHASES[p].meetingType === meetingType
  ) || null
}
