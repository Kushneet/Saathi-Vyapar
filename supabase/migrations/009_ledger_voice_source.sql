-- ============================================================
-- Migration: 009_ledger_voice_source.sql
-- Description: Allow 'voice' as a ledger entry source.
--
-- Entries can now be dictated as well as photographed, so ledger_entries.source
-- has to accept 'voice'. The two lineages disagree on this column:
--
--   001_init.sql  CHECK (source IN ('manual', 'ocr', 'whatsapp'))
--   schema.sql    CHECK (source IN ('manual','whatsapp','sms','ocr','voice'))
--
-- A database built from 001_init would reject every dictated entry. This sets
-- both to the same, wider set, and is safe to run on either.
-- ============================================================

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'ledger_entries'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%source%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ledger_entries DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_source_check
  CHECK (source IN ('manual', 'ocr', 'voice', 'whatsapp', 'sms'));

DO $$
BEGIN
  RAISE NOTICE 'ledger_entries.source now accepts manual, ocr, voice, whatsapp, sms.';
END $$;
