-- ============================================================
-- Migration: 010_khata_customers.sql
-- Description: Per-customer credit/debit account book ("khata") for
-- Khata Mitra. Lets an entrepreneur track running balances with named
-- customers (e.g. "Raaj owes ₹500"), distinct from the entrepreneur's
-- own income/expense ledger_entries table.
-- ============================================================

-- 1. Customer accounts, scoped to the entrepreneur who created them
CREATE TABLE IF NOT EXISTS public.khata_customers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  balance     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.khata_customers IS 'Named customer accounts (khata) an entrepreneur tracks credit/debit against';
CREATE INDEX IF NOT EXISTS idx_khata_customers_user_id ON public.khata_customers(user_id);
-- One account per (entrepreneur, customer name) — case-insensitive
CREATE UNIQUE INDEX IF NOT EXISTS idx_khata_customers_user_name ON public.khata_customers(user_id, lower(name));

-- 2. Credit/debit transactions against a customer account
CREATE TABLE IF NOT EXISTS public.khata_transactions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id  UUID NOT NULL REFERENCES public.khata_customers(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.khata_transactions IS 'Credit (udhaar given / customer owes more) and debit (payment received) entries per customer';
CREATE INDEX IF NOT EXISTS idx_khata_transactions_customer_id ON public.khata_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_khata_transactions_user_id ON public.khata_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_khata_transactions_created_at ON public.khata_transactions(created_at DESC);

-- 3. Keep khata_customers.balance in sync automatically on every transaction —
--    credit increases what the customer owes, debit reduces it.
CREATE OR REPLACE FUNCTION public.handle_khata_transaction()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.khata_customers
  SET balance = balance + (CASE WHEN NEW.type = 'credit' THEN NEW.amount ELSE -NEW.amount END),
      updated_at = NOW()
  WHERE id = NEW.customer_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_khata_transaction_insert ON public.khata_transactions;
CREATE TRIGGER on_khata_transaction_insert
  AFTER INSERT ON public.khata_transactions FOR EACH ROW
  EXECUTE FUNCTION public.handle_khata_transaction();

DROP TRIGGER IF EXISTS set_updated_at_khata_customers ON public.khata_customers;
CREATE TRIGGER set_updated_at_khata_customers
  BEFORE UPDATE ON public.khata_customers FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. Row Level Security — an entrepreneur only sees their own customers/transactions
ALTER TABLE public.khata_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.khata_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own khata customers" ON public.khata_customers;
CREATE POLICY "Own khata customers" ON public.khata_customers FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own khata transactions" ON public.khata_transactions;
CREATE POLICY "Own khata transactions" ON public.khata_transactions FOR ALL USING (auth.uid() = user_id);
