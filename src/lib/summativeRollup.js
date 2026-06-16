import { supabase } from '../supabaseClient'

// ============================================================
// Summative roll-up (#8): pull the body of evidence into per-domain
// suggestions for the summative.
//
// Only SCORED observations feed the suggested score — completed observations
// with is_formative_only = FALSE (formative walk-throughs / learning walks are
// excluded per Oregon law, matching observations.is_formative_only / 012).
// ============================================================

/** Per-indicator ratings from scored (non-formative, completed) observations. */
export async function fetchScoredIndicatorRatings(staffId) {
  const { data: obs } = await supabase
    .from('observations')
    .select('id')
    .eq('staff_id', staffId)
    .eq('status', 'completed')
    .eq('is_formative_only', false)
  const ids = (obs || []).map((o) => o.id)
  if (!ids.length) return []
  const { data } = await supabase
    .from('observation_indicator_ratings')
    .select('standard_id, rating, observation_id')
    .in('observation_id', ids)
  return data || []
}

/** Evidence items (with their indicator tags) for a staff member — for per-domain counts. */
export async function fetchEvidenceTagsForStaff(staffId) {
  const { data } = await supabase
    .from('evidence_items')
    .select('id, is_formative_only, tags:evidence_indicator_tags(standard_id)')
    .eq('staff_id', staffId)
  return data || []
}
