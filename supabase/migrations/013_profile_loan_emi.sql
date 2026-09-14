-- ============================================================
-- Migration: 013_profile_loan_emi.sql
-- Description: monthly loan repayment on business_profiles.
--
-- Onboarding asks how much of a loan is left (loan_amount, which existed)
-- and now also what goes out every month towards it. The monthly figure is
-- the one that matters for cash flow; the balance alone said nothing about
-- how heavy the loan is.
-- ============================================================

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS loan_monthly_payment NUMERIC(12,2);

COMMENT ON COLUMN public.business_profiles.loan_monthly_payment IS
  'Rupees paid towards loans each month (EMI); NULL when existing_loans is false';
