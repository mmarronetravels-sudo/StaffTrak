// ============================================================
// Evaluation feedback phases — single source of truth (Phase 4a #5)
// ------------------------------------------------------------
// The `evaluation_feedback.phase` column is an enum: initial | mid_year | final.
// Each phase is one feedback exchange tied to the cycle — the evaluator writes
// and signs feedback; the staff member responds and acknowledges. The Mid-Year
// and Final phases map to their conference (`meetings.meeting_type`), so the
// feedback can be drafted before and finalized at the meeting, and the staff
// acknowledgment serves as the single sign-off shown in MeetingSession.
// ============================================================

export const FEEDBACK_PHASES = {
  initial: {
    label: 'Initial',
    blurb: 'Feedback at the Initial Goals meeting — expectations and goal sign-off.',
    meetingType: 'initial_goals',
  },
  mid_year: {
    label: 'Mid-Year',
    blurb: 'Feedback at the Mid-Year Conference — progress against goals and practice.',
    meetingType: 'mid_year_review',
  },
  final: {
    label: 'Final',
    blurb: 'Summative feedback at the End-of-Year Conference.',
    meetingType: 'end_year_review',
  },
}

// Display order for the three phases.
export const FEEDBACK_PHASE_ORDER = ['initial', 'mid_year', 'final']

// Human label for any phase value (falls back to a Title-Cased key).
export function phaseLabel(phase) {
  if (FEEDBACK_PHASES[phase]) return FEEDBACK_PHASES[phase].label
  if (!phase) return 'Feedback'
  return phase.charAt(0).toUpperCase() + phase.slice(1).replace(/_/g, ' ')
}

// Map a meeting's `meeting_type` to its feedback phase (or null if none).
export function phaseForMeetingType(meetingType) {
  return FEEDBACK_PHASE_ORDER.find(
    (p) => FEEDBACK_PHASES[p].meetingType === meetingType
  ) || null
}
