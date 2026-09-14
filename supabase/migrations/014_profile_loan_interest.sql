-- ============================================================
-- Migration: 014_profile_loan_interest.sql
-- Description: yearly interest rate of the entrepreneur's loan.
--
-- Rural loans are often quoted per month ("₹2 per ₹100 a month" = 24% a
-- year); the form asks for the yearly figure and explains the conversion.
-- ============================================================

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS loan_interest_rate NUMERIC(5,2);

COMMENT ON COLUMN public.business_profiles.loan_interest_rate IS
  'Percent per year; NULL when existing_loans is false';
