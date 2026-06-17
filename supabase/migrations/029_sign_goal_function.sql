-- ============================================================
-- StaffTrak — 029_sign_goal_function.sql
-- Fix: staff could not sign their own goal once it left 'draft'.
--
-- Goal sign-off happens after a goal is finalized (submitted/approved), but the
-- staff UPDATE policies on `goals` only permit rows with
-- status IN ('draft','revision_requested'). So a staff member signing an
-- approved goal produced an UPDATE that matched zero rows, and the client's
-- .select().single() failed with "Cannot coerce the result to a single JSON
-- object". A plain RLS policy can't fix this safely, because a policy cannot
-- restrict WHICH columns change (it can't compare OLD vs NEW) — so loosening the
-- staff policy would also let staff edit a locked goal's content.
--
-- Instead, this SECURITY DEFINER function stamps ONLY the signature column,
-- choosing the column by the caller's identity:
--   • the goal's staff member  -> staff_signed_at
--   • the staff member's evaluator, or HR/admin -> evaluator_signed_at
-- p_unsign = true clears the caller's own signature (the "Undo" action).
-- It runs as the definer (bypassing RLS) but enforces its own authorization,
-- so goal content stays locked while either party can still sign.
--
-- Idempotent. Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

CREATE OR REPLACE FUNCTION sign_goal(p_goal_id UUID, p_unsign BOOLEAN DEFAULT FALSE)
RETURNS goals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g    goals;
  uid  UUID := auth.uid();
  ts   TIMESTAMPTZ := CASE WHEN p_unsign THEN NULL ELSE now() END;
BEGIN
  SELECT * INTO g FROM goals WHERE id = p_goal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found';
  END IF;

  IF g.staff_id = uid THEN
    UPDATE goals SET staff_signed_at = ts WHERE id = p_goal_id RETURNING * INTO g;
  ELSIF is_admin_hr()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = g.staff_id AND evaluator_id = uid) THEN
    UPDATE goals SET evaluator_signed_at = ts WHERE id = p_goal_id RETURNING * INTO g;
  ELSE
    RAISE EXCEPTION 'Not authorized to sign this goal';
  END IF;

  RETURN g;
END;
$$;

REVOKE ALL ON FUNCTION sign_goal(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sign_goal(UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- END 029_sign_goal_function.sql
-- ============================================================
