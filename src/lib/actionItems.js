// ============================================================
// Action items — single source of truth (Phase 4c #13)
// ------------------------------------------------------------
// Structured growth next-steps (`action_items`) that tie feedback to goals and
// professional learning and track open → in_progress → done. Generated from an
// observation or added at the cycle level; both the teacher and the evaluator
// track them.
// ============================================================

export const ACTION_STATUSES = {
  open:        { label: 'Open',        badge: 'bg-gray-200 text-gray-700' },
  in_progress: { label: 'In progress', badge: 'bg-blue-100 text-blue-800' },
  done:        { label: 'Done',        badge: 'bg-green-100 text-green-800' },
}

export const ACTION_STATUS_ORDER = ['open', 'in_progress', 'done']

export function actionStatusLabel(status) {
  return ACTION_STATUSES[status]?.label || '—'
}

export function actionStatusBadge(status) {
  return ACTION_STATUSES[status]?.badge || 'bg-gray-200 text-gray-600'
}

// The next status in the open → in_progress → done cycle (wraps back to open).
export function nextActionStatus(status) {
  const i = ACTION_STATUS_ORDER.indexOf(status)
  return ACTION_STATUS_ORDER[(i + 1) % ACTION_STATUS_ORDER.length]
}
