-- ⚠️ DEPRECATED — DO NOT APPLY THIS FILE.
--
-- This snapshot disagrees with supabase/migrations/ (it has no `conversations`
-- and no `facilitators_entrepreneurs`, and defines an unused `facilitators`
-- table instead). Applying it is what left the deployed database unable to
-- serve the WhatsApp/SMS orchestrator.
--
-- Source of truth: supabase/migrations/, applied in order, ending with
-- 005_reconcile_schema.sql. Kept only as a record of what was pushed on
-- 2026-09 (commit 45e0edb).

-- ============================================================
--  Saathi Vyapar — Complete Supabase Database Schema
--  Project: Saathi-Vyapar
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT,
  phone       TEXT UNIQUE,
  email       TEXT UNIQUE,
  language    TEXT DEFAULT 'en' CHECK (language IN ('en', 'hi')),
  role        TEXT DEFAULT 'entrepreneur' CHECK (role IN ('entrepreneur', 'facilitator', 'admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.users IS 'App users — entrepreneurs, facilitators, and admins';

-- ============================================================
-- 2. BUSINESS PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.business_profiles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  business_name         TEXT,
  sector                TEXT,
  district              TEXT,
  state                 TEXT DEFAULT 'Uttar Pradesh',
  monthly_revenue_est   NUMERIC(12,2) DEFAULT 0,
  monthly_expense_est   NUMERIC(12,2) DEFAULT 0,
  existing_loans        BOOLEAN DEFAULT FALSE,
  loan_amount           NUMERIC(12,2),
  category              TEXT DEFAULT 'general' CHECK (category IN ('general','obc','sc','st','minority')),
  gender                TEXT DEFAULT 'male' CHECK (gender IN ('male','female','other')),
  workers_count         INTEGER DEFAULT 1,
  years_in_business     INTEGER DEFAULT 0,
  shg_membership        TEXT DEFAULT 'none',
  is_shg_member         BOOLEAN DEFAULT FALSE,
  shg_relation          TEXT DEFAULT 'none',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.business_profiles IS 'Business profiles collected during onboarding';
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON public.business_profiles(user_id);

-- ============================================================
-- 3. FINANCIAL PLANS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.financial_plans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  margin_percent   NUMERIC(6,2),
  break_even_units NUMERIC(12,2),
  summary_text     TEXT,
  plan_json        JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.financial_plans IS 'AI-generated financial analysis plans per user';
CREATE INDEX IF NOT EXISTS idx_financial_plans_user_id ON public.financial_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_plans_created_at ON public.financial_plans(created_at DESC);

-- ============================================================
-- 4. LEDGER ENTRIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  entry_type  TEXT NOT NULL CHECK (entry_type IN ('income', 'expense')),
  description TEXT,
  category    TEXT DEFAULT 'general',
  source      TEXT DEFAULT 'manual' CHECK (source IN ('manual','whatsapp','sms','ocr','voice')),
  confirmed   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.ledger_entries IS 'Daily income and expense entries per entrepreneur';
CREATE INDEX IF NOT EXISTS idx_ledger_entries_user_id ON public.ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at ON public.ledger_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_type ON public.ledger_entries(entry_type);

-- ============================================================
-- 5. GOVERNMENT SCHEMES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.schemes (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  benefit_summary   TEXT,
  sponsoring_body   TEXT DEFAULT 'Government of India',
  application_link  TEXT,
  eligibility_rules JSONB DEFAULT '{}',
  active            BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.schemes IS 'Government schemes catalogue for eligibility matching';

-- ============================================================
-- 6. BUSINESS GUIDES TABLE (AI roadmap outputs)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.business_guides (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  input_text    TEXT,
  roadmap_json  JSONB DEFAULT '[]',
  model_used    TEXT DEFAULT 'gemini-2.0-flash',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.business_guides IS 'AI-generated 5-stage business transformation roadmaps';
CREATE INDEX IF NOT EXISTS idx_business_guides_user_id ON public.business_guides(user_id);
CREATE INDEX IF NOT EXISTS idx_business_guides_created_at ON public.business_guides(created_at DESC);

-- ============================================================
-- 7. FACILITATORS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.facilitators (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT,
  district        TEXT,
  state           TEXT DEFAULT 'Uttar Pradesh',
  assigned_count  INTEGER DEFAULT 0,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.facilitators IS 'Field assistants who register and monitor entrepreneurs';
CREATE INDEX IF NOT EXISTS idx_facilitators_user_id ON public.facilitators(user_id);

-- ============================================================
-- 8. KHATA CUSTOMERS & TRANSACTIONS (Khata Mitra credit/debit book)
-- ============================================================
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_khata_customers_user_name ON public.khata_customers(user_id, lower(name));

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

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_users ON public.users;
CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON public.users FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.business_profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.business_profiles FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_schemes ON public.schemes;
CREATE TRIGGER set_updated_at_schemes
  BEFORE UPDATE ON public.schemes FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_khata_customers ON public.khata_customers;
CREATE TRIGGER set_updated_at_khata_customers
  BEFORE UPDATE ON public.khata_customers FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilitators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.khata_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.khata_transactions ENABLE ROW LEVEL SECURITY;

-- Users
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile" ON public.users FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- Business Profiles
DROP POLICY IF EXISTS "Own business profiles" ON public.business_profiles;
CREATE POLICY "Own business profiles" ON public.business_profiles FOR ALL USING (auth.uid() = user_id);

-- Financial Plans
DROP POLICY IF EXISTS "Own financial plans" ON public.financial_plans;
CREATE POLICY "Own financial plans" ON public.financial_plans FOR ALL USING (auth.uid() = user_id);

-- Ledger Entries
DROP POLICY IF EXISTS "Own ledger entries" ON public.ledger_entries;
CREATE POLICY "Own ledger entries" ON public.ledger_entries FOR ALL USING (auth.uid() = user_id);

-- Schemes — public read for authenticated users
DROP POLICY IF EXISTS "Schemes are publicly readable" ON public.schemes;
CREATE POLICY "Schemes are publicly readable" ON public.schemes FOR SELECT TO authenticated USING (active = TRUE);

-- Business Guides
DROP POLICY IF EXISTS "Own business guides" ON public.business_guides;
CREATE POLICY "Own business guides" ON public.business_guides FOR ALL USING (auth.uid() = user_id);

-- Facilitators
DROP POLICY IF EXISTS "Facilitators readable" ON public.facilitators;
CREATE POLICY "Facilitators readable" ON public.facilitators FOR SELECT TO authenticated USING (TRUE);

-- Khata Customers & Transactions
DROP POLICY IF EXISTS "Own khata customers" ON public.khata_customers;
CREATE POLICY "Own khata customers" ON public.khata_customers FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Own khata transactions" ON public.khata_transactions;
CREATE POLICY "Own khata transactions" ON public.khata_transactions FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- SEED DATA — 15 Government Schemes
-- ============================================================
INSERT INTO public.schemes (id, name, description, benefit_summary, sponsoring_body, application_link, eligibility_rules, active) VALUES
('mudra-shishu','Mudra Shishu Loan (PMMY)','Collateral-free micro-loans for small village shops and micro-enterprises.','Zero collateral, loans up to ₹50,000 at nominal interest via partner banks.','Ministry of Finance — MUDRA','https://www.mudra.org.in/','{"income_max":2500000,"loan_amount_max":50000}',true),
('mudra-kishor','Mudra Kishor Loan (PMMY)','Next-stage funding for businesses seeking scale and equipment.','Loans ₹50,001–₹5 Lakh, collateral-free via scheduled banks.','Ministry of Finance — MUDRA','https://www.mudra.org.in/','{"income_max":5000000,"loan_amount_min":50001,"loan_amount_max":500000}',true),
('mudra-tarun','Mudra Tarun Loan (PMMY)','Expansion capital for established businesses with track record.','Loans ₹5 Lakh–₹10 Lakh for business expansion.','Ministry of Finance — MUDRA','https://www.mudra.org.in/','{"income_max":10000000,"loan_amount_min":500001,"loan_amount_max":1000000}',true),
('pmegp','PMEGP — PM Employment Generation Programme','Credit-linked subsidy for micro-enterprises in manufacturing & services.','15–35% project cost subsidy (up to ₹25 Lakh loan) via KVIC.','KVIC / Ministry of MSME','https://www.kviconline.gov.in/pmegpeportal/pmegphome/index.jsp','{"income_max":10000000,"sector":["manufacturing","services","retail","food_processing"],"loan_amount_max":2500000}',true),
('pm-svanidhi','PM SVANidhi — Street Vendor Credit','Affordable credit for street vendors to formalize and grow trade.','Staged loans ₹10K→₹20K→₹50K with 7% interest subsidy cashback.','Ministry of Housing & Urban Affairs','https://pmsvanidhi.mohua.gov.in/','{"income_max":1200000,"sector":["retail","services"],"loan_amount_max":50000}',true),
('stand-up-india','Stand-Up India — SC/ST & Women','Greenfield project funding for SC, ST, or women entrepreneurs.','Loans ₹10 Lakh–₹1 Crore for Greenfield projects via scheduled banks.','Ministry of Finance — SIDBI','https://www.standupmitra.in/','{"category":["sc","st"],"gender":"female","loan_amount_min":1000000,"loan_amount_max":10000000}',true),
('wdc-mahila','WDC — Women Development Corporation','Subsidized training and micro-credit for women-led rural self-employment.','Training grants + ₹50K–₹2 Lakh micro-loans at 4% for women.','Ministry of Women & Child Development','https://wcd.nic.in/','{"gender":"female","income_max":1500000}',true),
('nrlm-sjsry','NRLM — Deendayal Antyodaya Yojana','National Rural Livelihoods Mission for BPL rural households via SHGs.','Revolving fund ₹15,000/SHG + capital subsidy for income activities.','Ministry of Rural Development','https://aajeevika.gov.in/','{"income_max":300000,"sector":["farming","dairy","crafts","general"]}',true),
('dairy-nabard','NABARD Dairy Entrepreneurship Development Scheme','Subsidy-backed loans for dairy farms and milk processing units.','25% back-end capital subsidy (33% for SC/ST) up to ₹10 Lakh project.','NABARD','https://www.nabard.org/','{"sector":["dairy"],"income_max":5000000}',true),
('pm-kisan-samman','PM Kisan Samman Nidhi','Direct income support for small/marginal farmers owning <2 hectares.','₹6,000/year direct transfer in 3 instalments to farmer bank accounts.','Ministry of Agriculture & Farmers Welfare','https://pmkisan.gov.in/','{"sector":["farming"],"income_max":1500000}',true),
('agriculture-kcc','Kisan Credit Card (KCC)','Revolving credit for farmers to cover crop inputs and post-harvest expenses.','Flexible credit up to ₹3 Lakh at effective 4% interest (2% subsidy).','Ministry of Agriculture / RBI / NABARD','https://agricoop.nic.in/en/kcc','{"sector":["farming","dairy"],"income_max":5000000}',true),
('sfurti','SFURTI — Traditional Industries Fund','Cluster-based development for artisans in khadi, village, and coir industries.','Soft loans + equipment grants for artisan clusters, up to ₹1 Crore/cluster.','Ministry of MSME / KVIC','https://sfurti.msme.gov.in/','{"sector":["crafts","tailoring"]}',true),
('pmkvy','PMKVY — PM Kaushal Vikas Yojana','Free short-term skill training linked to job placement and self-employment.','Free certified training in 300+ trades + ₹8,000 post-placement recognition.','Ministry of Skill Development','https://pmkvyofficial.org/','{"income_max":5000000}',true),
('uam-msme','Udyam Registration (MSME)','Free formal registration for micro/small enterprises to access benefits.','Access to priority lending, government tenders, and subsidy schemes.','Ministry of MSME','https://udyamregistration.gov.in/','{"income_max":50000000}',true),
('cgtmse','CGTMSE — Credit Guarantee for MSE','Collateral-free credit to micro and small enterprises via guarantee.','Credit guarantee up to 85% of loan (₹10 Lakh–₹2 Crore).','Ministry of MSME / SIDBI','https://www.cgtmse.in/','{"income_max":20000000,"loan_amount_min":100000,"loan_amount_max":20000000}',true),
('svep-nrlm','Start-up Village Entrepreneurship Programme (SVEP)','A sub-scheme of DAY-NRLM supporting Self-Help Group (SHG) members and their family members to set up non-farm rural enterprises. Unlike a one-time cash subsidy, SVEP provides ongoing support through training, mentoring, and access to a community-managed revolving loan fund (Community Enterprise Fund). It is implemented block-by-block, not nationwide — availability depends on whether SVEP has been rolled out in the user''s specific block.','Access to a community-managed revolving loan fund (Community Enterprise Fund) plus business training and ongoing mentoring support — not a one-time cash grant.','Ministry of Rural Development (DAY-NRLM)','https://svep.nrlm.gov.in/','{"requires_shg_membership":true,"eligible_relation":["shg_member","shg_member_family"],"sector":["non_farm","retail","tailoring","food_processing","handicraft","dairy_processing"],"area_type":"rural","implementation_note":"block_specific_not_nationwide","priority_groups":["women","youth"]}',true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  benefit_summary = EXCLUDED.benefit_summary, application_link = EXCLUDED.application_link,
  eligibility_rules = EXCLUDED.eligibility_rules, active = EXCLUDED.active, updated_at = NOW();

-- ============================================================
-- HELPFUL VIEWS
-- ============================================================
CREATE OR REPLACE VIEW public.entrepreneur_summary AS
SELECT
  u.id, u.name, u.phone, bp.sector, bp.district,
  bp.monthly_revenue_est, bp.monthly_expense_est,
  fp.margin_percent,
  (fp.plan_json->'financialMetrics'->>'cashFlowRisk') AS cash_flow_risk,
  fp.created_at AS last_plan_date
FROM public.users u
LEFT JOIN public.business_profiles bp ON bp.user_id = u.id
LEFT JOIN LATERAL (
  SELECT * FROM public.financial_plans WHERE user_id = u.id
  ORDER BY created_at DESC LIMIT 1
) fp ON TRUE
WHERE u.role = 'entrepreneur';

CREATE OR REPLACE VIEW public.monthly_pnl AS
SELECT
  user_id,
  DATE_TRUNC('month', created_at) AS month,
  SUM(CASE WHEN entry_type = 'income' THEN amount ELSE 0 END) AS total_income,
  SUM(CASE WHEN entry_type = 'expense' THEN amount ELSE 0 END) AS total_expense,
  SUM(CASE WHEN entry_type = 'income' THEN amount ELSE -amount END) AS net_profit,
  COUNT(*) AS entry_count
FROM public.ledger_entries
WHERE confirmed = TRUE
GROUP BY user_id, DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- ============================================================
-- VERIFY
-- ============================================================
SELECT 'Saathi Vyapar DB Setup Complete' AS status,
  (SELECT COUNT(*) FROM public.schemes) AS schemes_loaded;
