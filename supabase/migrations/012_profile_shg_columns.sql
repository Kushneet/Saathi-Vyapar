-- ============================================================
-- Migration: 012_profile_shg_columns.sql
-- Description: SHG membership columns on business_profiles.
--
-- The onboarding route started writing shg_membership, is_shg_member and
-- shg_relation (used by the SVEP / NRLM scheme rules), and the columns were
-- added to 001_init.sql — a migration every existing database had already
-- run. On those databases the insert failed with "column does not exist",
-- which reached the user as "Failed to save business profile" on the last
-- onboarding step. Safe to run anywhere: every statement is IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS shg_membership TEXT DEFAULT 'none';

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS is_shg_member BOOLEAN DEFAULT FALSE;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS shg_relation TEXT DEFAULT 'none';

COMMENT ON COLUMN public.business_profiles.shg_membership IS
  'none | shg_member | shg_member_family — Self-Help Group affiliation for NRLM-family scheme rules';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'business_profiles' AND column_name = 'shg_relation'
  ) THEN
    RAISE EXCEPTION 'business_profiles.shg_relation still missing after 012';
  END IF;
  RAISE NOTICE 'business_profiles: SHG columns present';
END $$;
