// ============================================================
// Observation types — single source of truth (Phase 2b #10)
// ------------------------------------------------------------
// The `observations.observation_type` column is free text; these are the
// values the app produces and knows how to render. Two "summative" types
// (formal, informal) can contribute to the year-end summative score; the
// three lightweight types (walk-through, mini-observation, learning walk)
// default to FORMATIVE ONLY — evidence for growth, NOT counted toward the
// summative score (peer / learning walks are formative-only per Oregon law).
// The default is just a default: each observation carries its own
// `is_formative_only` flag the evaluator can override at scheduling time.
// ============================================================

export const OBSERVATION_TYPES = {
  formal: {
    label: 'Formal',
    dot: '#2c3e7e',
    formativeOnlyDefault: false,
    blurb: 'Full observation with pre- and post-observation forms. Counts toward the summative.',
  },
  informal: {
    label: 'Informal',
    dot: '#477fc1',
    formativeOnlyDefault: false,
    blurb: 'Shorter drop-in visit. Can contribute to the summative.',
  },
  walkthrough: {
    label: 'Walk-through',
    dot: '#5fa8d3',
    formativeOnlyDefault: true,
    blurb: 'Brief walk-through. Formative by default — not counted toward the summative score.',
  },
  mini_observation: {
    label: 'Mini-Observation',
    dot: '#6ba6d6',
    formativeOnlyDefault: true,
    blurb: 'Short focused look at a slice of practice. Formative by default.',
  },
  learning_walk: {
    label: 'Learning Walk',
    dot: '#8fbedd',
    formativeOnlyDefault: true,
    blurb: 'Peer / learning walk. Formative only — excluded from the summative score.',
  },
}

// Display + scheduling order.
export const OBSERVATION_TYPE_ORDER = [
  'formal',
  'informal',
  'walkthrough',
  'mini_observation',
  'learning_walk',
]

// Human label for any type value (falls back to a Title-Cased key).
export function obsTypeLabel(type) {
  if (OBSERVATION_TYPES[type]) return OBSERVATION_TYPES[type].label
  if (!type) return 'Observation'
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ')
}

// Dot/legend color for any type value.
export function obsTypeDot(type) {
  return OBSERVATION_TYPES[type]?.dot || '#999999'
}

// Default formative-only flag for a newly scheduled observation of this type.
export function formativeOnlyDefault(type) {
  return OBSERVATION_TYPES[type]?.formativeOnlyDefault ?? false
}
