-- ============================================================
-- StaffTrak — 037_profiles_self_link_by_email.sql
-- Fix: imported staff stay UNLINKED on first Google login -> locked out.
--
-- On first login AuthCallback links the imported profile by email:
--   UPDATE profiles SET id = auth.uid() WHERE email = <login email>
-- 033 lets them SELECT that row by email, but the ONLY update policy was
-- "Users can update own profile" (USING id = auth.uid()). Pre-link the row's
-- id is the import placeholder, not auth.uid(), so the row is invisible to the
-- UPDATE: 0 rows changed, NO error. The user lands authenticated but unlinked
-- (profiles.id != auth.uid()), so get_my_tenant_id()/own-profile reads return
-- nothing and the app treats them as having no account.
-- (Symptom seen live: nallen-wriggle@summitlc.org — clean Google auth user,
--  but profiles.id still the placeholder.)
--
-- This adds a narrow UPDATE policy so an authenticated user may update the
-- single row whose email matches their JWT email, and only such that the
-- resulting row is owned by them (id = auth.uid()) and keeps that same email.
-- Mirrors the 033 SELECT-by-email policy; OR'd with existing policies, so it
-- only widens the first-login self-link and loosens nothing else. Idempotent.
--
-- Run in the Supabase SQL Editor (project fgbigyffgzqzvksrkqxv).
-- ============================================================

DROP POLICY IF EXISTS "profiles_link_own_email" ON profiles;

CREATE POLICY "profiles_link_own_email" ON profiles
  FOR UPDATE
  TO authenticated
  USING ( lower(email) = lower(auth.jwt() ->> 'email') )
  WITH CHECK (
    id = auth.uid()
    AND lower(email) = lower(auth.jwt() ->> 'email')
  );

-- ============================================================
-- END 037_profiles_self_link_by_email.sql
-- ============================================================
