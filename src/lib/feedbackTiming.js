// ============================================================
// Fast-feedback turnaround (#12).
// Turnaround = time from the observation ending to feedback being delivered.
// Baseline falls back ended_at → started_at → scheduled_at.
// ============================================================

export function feedbackTurnaround(obs) {
  if (!obs?.feedback_delivered_at) return null
  const base = obs.ended_at || obs.started_at || obs.scheduled_at
  if (!base) return null
  const hrs = Math.max(0, (new Date(obs.feedback_delivered_at) - new Date(base)) / 3_600_000)
  const label = hrs < 1 ? '<1h' : hrs < 48 ? `${Math.round(hrs)}h` : `${Math.round(hrs / 24)}d`
  return { hrs, within24: hrs <= 24, label, deliveredAt: obs.feedback_delivered_at }
}
