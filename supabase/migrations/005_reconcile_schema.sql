-- ============================================================
-- Migration: 005_reconcile_schema.sql
-- Description: Reconcile the three divergent schema definitions.
--
-- Before this migration the project carried three disagreeing sources:
--
--   * supabase/migrations/001_init.sql  — users, business_profiles, schemes,
--     financial_plans, ledger_entries, conversations,
--     facilitators_entrepreneurs. No business_guides, no users.email.
--   * schema.sql and supabase/schema.sql (byte-identical) — the pair actually
--     pushed to the hosted project. Adds business_guides and a `facilitators`
--     table, but has NO conversations and NO facilitators_entrepreneurs.
--   * supabase/migrations/002_rls_policies.sql — writes policies against
--     facilitators_entrepreneurs, which schema.sql never creates.
--
-- The visible symptom: every inbound WhatsApp/SMS message answers "System
-- error. Please try again.", because conversationOrchestrator.ts writes to
-- `conversations` on the first turn and that table does not exist in prod.
--
-- This migration is idempotent and converges a database created from EITHER
-- lineage onto the schema the application code actually expects.
--
-- supabase/migrations/ is the source of truth from here on; the two
-- schema.sql copies are deprecated (see the headers added to them).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- 1. users — columns the code writes that 001_init.sql lacks
-- ------------------------------------------------------------

-- onboarding/complete and the dashboard first-visit upsert both write `email`.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;

-- 001_init declared phone NOT NULL, but an email/Google sign-in has no phone.
-- That NOT NULL is what pushed onboarding into inventing random +91 numbers.
ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;

-- A unique email is desirable but must not fail the migration on pre-existing
-- duplicates, so attempt it and report rather than abort.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
    ON public.users (email) WHERE email IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'users.email has duplicates; unique index not created. Resolve them, then re-run this statement.';
END $$;

-- schema.sql capped language at ('en','hi') while the plan generator offers
-- eleven and i18n ships two. Widen the constraint to the set the code uses.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'users'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%language%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_language_check
  CHECK (language IN ('en','hi','ta','te','mr','bn','gu','kn','ml','pa','or'));

-- ------------------------------------------------------------
-- 2. conversations — missing from the deployed schema entirely
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES public.users(id) ON DELETE CASCADE,
  channel         VARCHAR(20) CHECK (channel IN ('whatsapp', 'sms')),
  state           VARCHAR(100) DEFAULT 'idle',
  context         JSONB DEFAULT '{}',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON public.conversations(user_id, channel);

-- ------------------------------------------------------------
-- 3. facilitators_entrepreneurs — referenced by 002 and 004 policies
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.facilitators_entrepreneurs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facilitator_id  UUID REFERENCES public.users(id) ON DELETE CASCADE,
  entrepreneur_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(facilitator_id, entrepreneur_id)
);

CREATE INDEX IF NOT EXISTS idx_fac_ent_facilitator ON public.facilitators_entrepreneurs(facilitator_id);
CREATE INDEX IF NOT EXISTS idx_fac_ent_entrepreneur ON public.facilitators_entrepreneurs(entrepreneur_id);

-- ------------------------------------------------------------
-- 4. business_guides — present in schema.sql, absent from 001_init
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_guides (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES public.users(id) ON DELETE CASCADE,
  input_text   TEXT NOT NULL,
  roadmap_json JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_guides_user_id ON public.business_guides(user_id);
CREATE INDEX IF NOT EXISTS idx_business_guides_created_at ON public.business_guides(created_at DESC);

-- ------------------------------------------------------------
-- 5. business_profiles — one profile per user
-- ------------------------------------------------------------
-- No lineage ever declared UNIQUE(user_id), so `.upsert({ onConflict:
-- 'user_id' })` failed every single time with "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification". Three call
-- sites carry a hand-rolled read-then-write workaround because of it.
--
-- Duplicates are moved to a backup table first — nothing is dropped outright.

CREATE TABLE IF NOT EXISTS public.business_profiles_duplicates_backup
  (LIKE public.business_profiles INCLUDING ALL);

-- This holds copies of real business profiles — revenue, expenses, district,
-- social category. Supabase publishes every public-schema table over
-- PostgREST, so without RLS the backup would be readable with nothing but the
-- anon key: the same leak the dropped views caused. RLS on with no policies
-- means only the service role can reach it, which is what a backup wants.
ALTER TABLE public.business_profiles_duplicates_backup ENABLE ROW LEVEL SECURITY;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
         ) AS rn
  FROM public.business_profiles
  WHERE user_id IS NOT NULL
)
INSERT INTO public.business_profiles_duplicates_backup
SELECT bp.* FROM public.business_profiles bp
JOIN ranked r ON r.id = bp.id
WHERE r.rn > 1
ON CONFLICT DO NOTHING;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
         ) AS rn
  FROM public.business_profiles
  WHERE user_id IS NOT NULL
)
DELETE FROM public.business_profiles bp
USING ranked r
WHERE r.id = bp.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS business_profiles_user_id_key
  ON public.business_profiles (user_id);

-- ------------------------------------------------------------
-- 6. RLS on the tables this migration may have just created
-- ------------------------------------------------------------
-- The application now calls Supabase with the session-bound anon client on
-- user-facing paths, so these policies are load-bearing rather than
-- decorative. Policies are dropped and recreated so this is re-runnable.

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilitators_entrepreneurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
CREATE POLICY "Users can view own conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own conversations" ON public.conversations;
CREATE POLICY "Users can insert own conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
CREATE POLICY "Users can update own conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Facilitators and entrepreneurs can view links" ON public.facilitators_entrepreneurs;
CREATE POLICY "Facilitators and entrepreneurs can view links"
  ON public.facilitators_entrepreneurs FOR SELECT TO authenticated
  USING (auth.uid() = facilitator_id OR auth.uid() = entrepreneur_id);

DROP POLICY IF EXISTS "Facilitators can add entrepreneur links" ON public.facilitators_entrepreneurs;
CREATE POLICY "Facilitators can add entrepreneur links"
  ON public.facilitators_entrepreneurs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = facilitator_id);

DROP POLICY IF EXISTS "Facilitators can delete entrepreneur links" ON public.facilitators_entrepreneurs;
CREATE POLICY "Facilitators can delete entrepreneur links"
  ON public.facilitators_entrepreneurs FOR DELETE TO authenticated
  USING (auth.uid() = facilitator_id);

DROP POLICY IF EXISTS "Users and facilitators can view business guides" ON public.business_guides;
CREATE POLICY "Users and facilitators can view business guides"
  ON public.business_guides FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR user_id IN (
      SELECT entrepreneur_id FROM public.facilitators_entrepreneurs
      WHERE facilitator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own business guides" ON public.business_guides;
CREATE POLICY "Users can insert own business guides"
  ON public.business_guides FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own business guides" ON public.business_guides;
CREATE POLICY "Users can update own business guides"
  ON public.business_guides FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own business guides" ON public.business_guides;
CREATE POLICY "Users can delete own business guides"
  ON public.business_guides FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 7. Post-migration check
-- ------------------------------------------------------------
DO $$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','business_profiles','schemes','financial_plans','ledger_entries',
    'conversations','facilitators_entrepreneurs','business_guides'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      missing := array_append(missing, t);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'Schema reconciliation incomplete. Missing tables: %', missing;
  END IF;

  RAISE NOTICE 'Schema reconciled: all 8 application tables present.';
END $$;
