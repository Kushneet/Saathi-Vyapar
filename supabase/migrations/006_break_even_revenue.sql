-- ============================================================
-- Migration: 006_break_even_revenue.sql
-- Description: Store the break-even figure under an honest name and unit.
--
-- `financial_plans.break_even_units` never held units. The engine computed it
-- as calculateBreakEven(expenses, revenue, 0), which reduces to
-- expenses / revenue — a dimensionless ratio (0.67 for a business with
-- ₹20k costs against ₹30k sales). Meanwhile the plan's own explanation text
-- quoted a rupee figure, and the dashboard displayed monthly expenses. Three
-- different numbers under one label.
--
-- The engine now reports break-even in rupees of monthly sales
-- (see calculateBreakEvenRevenue in src/lib/engines/financialEngine.ts), and
-- that value is written here.
--
-- Existing break_even_units values are NOT backfilled: the stored ratios
-- cannot be converted back into rupees, because the expense figure they were
-- derived from is not recorded alongside them. The column is left in place so
-- old plans still load; new plans populate break_even_revenue, and any plan
-- regenerated from /api/plan/generate fills it in.
-- ============================================================

ALTER TABLE public.financial_plans
  ADD COLUMN IF NOT EXISTS break_even_revenue NUMERIC(12,2);

COMMENT ON COLUMN public.financial_plans.break_even_revenue IS
  'Monthly sales needed to cover costs, in rupees.';

COMMENT ON COLUMN public.financial_plans.break_even_units IS
  'DEPRECATED. Never contained units: held expenses/revenue, a ratio, due to a '
  'bug in generateFinancialSummary. Superseded by break_even_revenue. Retained '
  'for historical rows only — do not write to it.';
