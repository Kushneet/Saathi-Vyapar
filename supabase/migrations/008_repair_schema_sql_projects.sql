-- ============================================================
-- Migration: 008_repair_schema_sql_projects.sql
-- Description: Fix what 005 missed on databases created from schema.sql.
--
-- 005 reconciled tables but assumed financial_plans matched the shape in
-- 001_init.sql. A project built from schema.sql instead has:
--
--   * no financial_plans.matched_scheme_ids column at all — the code writes
--     it on every plan, so /api/plan/generate returns 500 and the plan saved
--     during onboarding fails silently
--   * schemes.id as TEXT, not UUID, so the UUID[] type 001_init declares for
--     matched_scheme_ids would not accept those ids anyway
--
-- The column type is therefore derived from the actual type of schemes.id
-- rather than assumed, so this works on both lineages.
--
-- Also drops two views carried over from schema.sql. Views run with the
-- privileges of their owner and bypass the RLS on the tables beneath them,
-- and Supabase exposes everything in the public schema over PostgREST — so
-- `GET /rest/v1/entrepreneur_summary` with nothing but the anon key returned
-- every entrepreneur's name, phone, revenue and expenses. monthly_pnl did the
-- same for income and expense totals. Nothing in the application reads either
-- view; both were leftovers.
-- ============================================================

-- ── 1. Drop the RLS-bypassing views ─────────────────────────────────────
DROP VIEW IF EXISTS public.entrepreneur_summary;
DROP VIEW IF EXISTS public.monthly_pnl;

-- ── 2. matched_scheme_ids, typed to match schemes.id ────────────────────
DO $$
DECLARE
  scheme_id_type TEXT;
BEGIN
  SELECT data_type INTO scheme_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'schemes' AND column_name = 'id';

  IF scheme_id_type IS NULL THEN
    RAISE EXCEPTION 'public.schemes.id not found — run the earlier migrations first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'financial_plans'
      AND column_name = 'matched_scheme_ids'
  ) THEN
    IF scheme_id_type = 'uuid' THEN
      ALTER TABLE public.financial_plans ADD COLUMN matched_scheme_ids UUID[];
    ELSE
      ALTER TABLE public.financial_plans ADD COLUMN matched_scheme_ids TEXT[];
    END IF;
    RAISE NOTICE 'Added financial_plans.matched_scheme_ids as %[]', scheme_id_type;
  END IF;
END $$;

-- ── 3. Columns the newer code writes, in case 005/006/007 have not run ──
ALTER TABLE public.financial_plans ADD COLUMN IF NOT EXISTS break_even_revenue NUMERIC(12,2);
ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS sponsoring_body TEXT;
ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS required_documents JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;

-- ── 4. facilitators_entrepreneurs, which schema.sql never created ───────
-- schema.sql defines an unrelated `facilitators` table instead, so the
-- delegated-access checks in src/lib/auth/requireUser.ts had nothing to read.
CREATE TABLE IF NOT EXISTS public.facilitators_entrepreneurs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facilitator_id  UUID REFERENCES public.users(id) ON DELETE CASCADE,
  entrepreneur_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(facilitator_id, entrepreneur_id)
);

ALTER TABLE public.facilitators_entrepreneurs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Facilitators and entrepreneurs can view links" ON public.facilitators_entrepreneurs;
CREATE POLICY "Facilitators and entrepreneurs can view links"
  ON public.facilitators_entrepreneurs FOR SELECT TO authenticated
  USING (auth.uid() = facilitator_id OR auth.uid() = entrepreneur_id);

DROP POLICY IF EXISTS "Facilitators can add entrepreneur links" ON public.facilitators_entrepreneurs;
CREATE POLICY "Facilitators can add entrepreneur links"
  ON public.facilitators_entrepreneurs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = facilitator_id);

-- ── 5. Report ───────────────────────────────────────────────────────────
DO $$
DECLARE missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financial_plans' AND column_name='matched_scheme_ids')
    THEN missing := array_append(missing, 'financial_plans.matched_scheme_ids'); END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financial_plans' AND column_name='break_even_revenue')
    THEN missing := array_append(missing, 'financial_plans.break_even_revenue'); END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='facilitators_entrepreneurs')
    THEN missing := array_append(missing, 'facilitators_entrepreneurs'); END IF;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'Repair incomplete: %', missing;
  END IF;

  RAISE NOTICE 'Repair complete. Views dropped, columns and link table present.';
END $$;
