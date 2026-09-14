-- ============================================================
-- ⚠️  DO NOT APPLY THIS FILE TO A DATABASE.
--
-- It is a proposed redesign of the schemes table kept as the SOURCE of the
-- 62-scheme seed list, and it recreates the whole schema in the lineage
-- (facilitators table, no conversations) that already broke the deployed
-- project once. Nothing in src/ reads its column names.
--
-- The seed rows were carried into the live table's shape by
-- migrations/011_more_schemes.sql — run that instead.
-- ============================================================

-- ============================================================
--  Saathi Vyapar — Complete Supabase Database Schema (v2)
--  Project: Saathi-Vyapar
--  Run this in: Supabase Dashboard → SQL Editor → New Query
--
--  CHANGES FROM v1:
--   - schemes table rebuilt: UUID id, structured amount/category/state
--     columns, multi-language name/description, how_to_apply,
--     documents_required, full-text search index
--   - new user_scheme_status table to track saved/applied/eligible
--     schemes per user
--
--  CHANGES IN v2.1:
--   - schemes.launched_on / schemes.valid_until columns added
--   - catalogue expanded from 16 to 62 programmes (SIH Top-30 PDF
--     plus the official source-link list); see NEEDS VERIFICATION
--     block at the end of the seed section
--   - everything else (users, business_profiles, financial_plans,
--     ledger_entries, business_guides, facilitators, khata_*) is
--     unchanged from your existing schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

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
-- 5. GOVERNMENT SCHEMES TABLE (v2 — improved)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.schemes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                TEXT UNIQUE NOT NULL,              -- readable id, e.g. 'mudra-shishu'

  -- multi-language content
  name_en             TEXT NOT NULL,
  name_hi             TEXT,
  description_en      TEXT,
  description_hi      TEXT,
  benefit_summary_en  TEXT,
  benefit_summary_hi  TEXT,

  -- classification
  scheme_type         TEXT CHECK (scheme_type IN ('loan','subsidy','training','direct_benefit','credit_guarantee','registration','other')) DEFAULT 'other',
  sector              TEXT[] DEFAULT '{}',               -- e.g. {'dairy','retail'}

  -- who runs it / where
  sponsoring_body     TEXT DEFAULT 'Government of India',
  state               TEXT DEFAULT 'all',                -- 'all' = central/nationwide, else specific state
  area_type           TEXT CHECK (area_type IN ('rural','urban','both')) DEFAULT 'both',

  -- money, as real numeric columns (filterable/sortable)
  min_loan_amount     NUMERIC(12,2),
  max_loan_amount     NUMERIC(12,2),
  benefit_amount      NUMERIC(12,2),                     -- for flat/fixed benefits e.g. PM-Kisan ₹6000/yr
  interest_subsidy_pct NUMERIC(5,2),

  -- eligibility
  income_max          NUMERIC(12,2),
  category            TEXT[] DEFAULT '{}',               -- {'sc','st','obc','general','minority'}
  gender              TEXT CHECK (gender IN ('male','female','other','any')) DEFAULT 'any',
  requires_shg_membership BOOLEAN DEFAULT FALSE,
  eligible_relation   TEXT[] DEFAULT '{}',                -- {'shg_member','shg_member_family'}
  priority_groups     TEXT[] DEFAULT '{}',                -- {'women','youth'}
  eligibility_rules   JSONB DEFAULT '{}',                 -- overflow for anything non-standard

  -- application
  application_link    TEXT,
  how_to_apply_en     TEXT,
  how_to_apply_hi     TEXT,
  documents_required  TEXT[] DEFAULT '{}',

  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.schemes IS 'Government schemes catalogue for eligibility matching';

CREATE INDEX IF NOT EXISTS idx_schemes_sector ON public.schemes USING GIN (sector);
CREATE INDEX IF NOT EXISTS idx_schemes_category ON public.schemes USING GIN (category);
CREATE INDEX IF NOT EXISTS idx_schemes_state ON public.schemes(state);
CREATE INDEX IF NOT EXISTS idx_schemes_active ON public.schemes(active);
CREATE INDEX IF NOT EXISTS idx_schemes_name_search ON public.schemes USING GIN (name_en gin_trgm_ops);

-- ============================================================
-- 6. USER SCHEME STATUS TABLE (new — tracks user <-> scheme)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_scheme_status (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scheme_id    UUID NOT NULL REFERENCES public.schemes(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('matched','saved','applied','approved','rejected')) DEFAULT 'matched',
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, scheme_id)
);
COMMENT ON TABLE public.user_scheme_status IS 'Tracks which schemes a user has been matched to, saved, or applied for';
CREATE INDEX IF NOT EXISTS idx_user_scheme_status_user_id ON public.user_scheme_status(user_id);
CREATE INDEX IF NOT EXISTS idx_user_scheme_status_scheme_id ON public.user_scheme_status(scheme_id);

-- ============================================================
-- 7. BUSINESS GUIDES TABLE (AI roadmap outputs)
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
-- 8. FACILITATORS TABLE
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
-- 9. KHATA CUSTOMERS & TRANSACTIONS (Khata Mitra credit/debit book)
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

DROP TRIGGER IF EXISTS set_updated_at_user_scheme_status ON public.user_scheme_status;
CREATE TRIGGER set_updated_at_user_scheme_status
  BEFORE UPDATE ON public.user_scheme_status FOR EACH ROW
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
ALTER TABLE public.user_scheme_status ENABLE ROW LEVEL SECURITY;
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

-- User Scheme Status
DROP POLICY IF EXISTS "Own scheme status" ON public.user_scheme_status;
CREATE POLICY "Own scheme status" ON public.user_scheme_status FOR ALL USING (auth.uid() = user_id);

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
-- SEED DATA — 15 Government Schemes (v2 structured format)
-- ============================================================
INSERT INTO public.schemes (
  slug, name_en, description_en, benefit_summary_en, scheme_type, sector,
  sponsoring_body, state, area_type, min_loan_amount, max_loan_amount,
  benefit_amount, interest_subsidy_pct, income_max, category, gender,
  requires_shg_membership, eligible_relation, priority_groups,
  application_link, active
) VALUES
('mudra-shishu','Mudra Shishu Loan (PMMY)','Collateral-free micro-loans for small village shops and micro-enterprises.','Zero collateral, loans up to ₹50,000 at nominal interest via partner banks.','loan','{}','Ministry of Finance — MUDRA','all','both',NULL,50000,NULL,NULL,2500000,'{}','any',false,'{}','{}','https://www.mudra.org.in/',true),
('mudra-kishor','Mudra Kishor Loan (PMMY)','Next-stage funding for businesses seeking scale and equipment.','Loans ₹50,001–₹5 Lakh, collateral-free via scheduled banks.','loan','{}','Ministry of Finance — MUDRA','all','both',50001,500000,NULL,NULL,5000000,'{}','any',false,'{}','{}','https://www.mudra.org.in/',true),
('mudra-tarun','Mudra Tarun Loan (PMMY)','Expansion capital for established businesses with track record.','Loans ₹5 Lakh–₹10 Lakh for business expansion.','loan','{}','Ministry of Finance — MUDRA','all','both',500001,1000000,NULL,NULL,10000000,'{}','any',false,'{}','{}','https://www.mudra.org.in/',true),
('pmegp','PMEGP — PM Employment Generation Programme','Credit-linked subsidy for micro-enterprises in manufacturing & services.','15–35% project cost subsidy (up to ₹25 Lakh loan) via KVIC.','subsidy','{manufacturing,services,retail,food_processing}','KVIC / Ministry of MSME','all','both',NULL,2500000,NULL,NULL,10000000,'{}','any',false,'{}','{}','https://www.kviconline.gov.in/pmegpeportal/pmegphome/index.jsp',true),
('pm-svanidhi','PM SVANidhi — Street Vendor Credit','Affordable credit for street vendors to formalize and grow trade.','Staged loans ₹10K→₹20K→₹50K with 7% interest subsidy cashback.','loan','{retail,services}','Ministry of Housing & Urban Affairs','all','urban',NULL,50000,NULL,7,1200000,'{}','any',false,'{}','{}','https://pmsvanidhi.mohua.gov.in/',true),
('stand-up-india','Stand-Up India — SC/ST & Women','Greenfield project funding for SC, ST, or women entrepreneurs.','Loans ₹10 Lakh–₹1 Crore for Greenfield projects via scheduled banks.','loan','{}','Ministry of Finance — SIDBI','all','both',1000000,10000000,NULL,NULL,NULL,'{sc,st}','female',false,'{}','{}','https://www.standupmitra.in/',true),
('wdc-mahila','WDC — Women Development Corporation','Subsidized training and micro-credit for women-led rural self-employment.','Training grants + ₹50K–₹2 Lakh micro-loans at 4% for women.','loan','{}','Ministry of Women & Child Development','all','both',50000,200000,NULL,4,1500000,'{}','female',false,'{}','{}','https://wcd.nic.in/',true),
('nrlm-sjsry','NRLM — Deendayal Antyodaya Yojana','National Rural Livelihoods Mission for BPL rural households via SHGs.','Revolving fund ₹15,000/SHG + capital subsidy for income activities.','subsidy','{farming,dairy,crafts,general}','Ministry of Rural Development','all','rural',NULL,NULL,15000,NULL,300000,'{}','any',true,'{shg_member}','{}','https://aajeevika.gov.in/',true),
('dairy-nabard','NABARD Dairy Entrepreneurship Development Scheme','Subsidy-backed loans for dairy farms and milk processing units.','25% back-end capital subsidy (33% for SC/ST) up to ₹10 Lakh project.','subsidy','{dairy}','NABARD','all','both',NULL,1000000,NULL,25,5000000,'{}','any',false,'{}','{}','https://www.nabard.org/',true),
('pm-kisan-samman','PM Kisan Samman Nidhi','Direct income support for small/marginal farmers owning <2 hectares.','₹6,000/year direct transfer in 3 instalments to farmer bank accounts.','direct_benefit','{farming}','Ministry of Agriculture & Farmers Welfare','all','rural',NULL,NULL,6000,NULL,1500000,'{}','any',false,'{}','{}','https://pmkisan.gov.in/',true),
('agriculture-kcc','Kisan Credit Card (KCC)','Revolving credit for farmers to cover crop inputs and post-harvest expenses.','Flexible credit up to ₹3 Lakh at effective 4% interest (2% subsidy).','loan','{farming,dairy}','Ministry of Agriculture / RBI / NABARD','all','rural',NULL,300000,NULL,2,5000000,'{}','any',false,'{}','{}','https://agricoop.nic.in/en/kcc',true),
('sfurti','SFURTI — Traditional Industries Fund','Cluster-based development for artisans in khadi, village, and coir industries.','Soft loans + equipment grants for artisan clusters, up to ₹1 Crore/cluster.','subsidy','{crafts,tailoring}','Ministry of MSME / KVIC','all','both',NULL,10000000,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://sfurti.msme.gov.in/',true),
('pmkvy','PMKVY — PM Kaushal Vikas Yojana','Free short-term skill training linked to job placement and self-employment.','Free certified training in 300+ trades + ₹8,000 post-placement recognition.','training','{}','Ministry of Skill Development','all','both',NULL,NULL,8000,NULL,5000000,'{}','any',false,'{}','{}','https://pmkvyofficial.org/',true),
('uam-msme','Udyam Registration (MSME)','Free formal registration for micro/small enterprises to access benefits.','Access to priority lending, government tenders, and subsidy schemes.','registration','{}','Ministry of MSME','all','both',NULL,NULL,NULL,NULL,50000000,'{}','any',false,'{}','{}','https://udyamregistration.gov.in/',true),
('cgtmse','CGTMSE — Credit Guarantee for MSE','Collateral-free credit to micro and small enterprises via guarantee.','Credit guarantee up to 85% of loan (₹10 Lakh–₹2 Crore).','credit_guarantee','{}','Ministry of MSME / SIDBI','all','both',100000,20000000,NULL,NULL,20000000,'{}','any',false,'{}','{}','https://www.cgtmse.in/',true),
('svep-nrlm','Start-up Village Entrepreneurship Programme (SVEP)','A sub-scheme of DAY-NRLM supporting Self-Help Group (SHG) members and their family members to set up non-farm rural enterprises. Provides ongoing support through training, mentoring, and access to a community-managed revolving loan fund (Community Enterprise Fund). Implemented block-by-block, not nationwide — availability depends on whether SVEP has been rolled out in the user''s specific block.','Access to a community-managed revolving loan fund (Community Enterprise Fund) plus business training and ongoing mentoring support — not a one-time cash grant.','subsidy','{non_farm,retail,tailoring,food_processing,handicraft,dairy_processing}','Ministry of Rural Development (DAY-NRLM)','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',true,'{shg_member,shg_member_family}','{women,youth}','https://svep.nrlm.gov.in/',true)
ON CONFLICT (slug) DO UPDATE SET
  name_en = EXCLUDED.name_en, description_en = EXCLUDED.description_en,
  benefit_summary_en = EXCLUDED.benefit_summary_en, application_link = EXCLUDED.application_link,
  scheme_type = EXCLUDED.scheme_type, sector = EXCLUDED.sector,
  min_loan_amount = EXCLUDED.min_loan_amount, max_loan_amount = EXCLUDED.max_loan_amount,
  benefit_amount = EXCLUDED.benefit_amount, income_max = EXCLUDED.income_max,
  category = EXCLUDED.category, gender = EXCLUDED.gender,
  requires_shg_membership = EXCLUDED.requires_shg_membership,
  eligible_relation = EXCLUDED.eligible_relation, priority_groups = EXCLUDED.priority_groups,
  active = EXCLUDED.active, updated_at = NOW();


-- ============================================================
-- SEED DATA — CATALOGUE EXPANSION (v2.1)
--   Sources: "SIH Top 30 Government Schemes — Official Links" PDF
--            + the WhatsApp source-link list
--   46 additional programmes. Existing 16 rows above are untouched.
--
--   launched_on / valid_until are populated ONLY where a date was
--   supplied in the source list. NULL means "not given", never "none".
--   Dates flagged below under NEEDS VERIFICATION are stored as supplied
--   but conflict with the commonly published launch date.
-- ============================================================

ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS launched_on DATE;
ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS valid_until DATE;
COMMENT ON COLUMN public.schemes.launched_on IS 'Official launch / notification date, where known';
COMMENT ON COLUMN public.schemes.valid_until IS 'Scheme validity end date, where the scheme is time-bound';

INSERT INTO public.schemes (
  slug, name_en, description_en, benefit_summary_en, scheme_type, sector,
  sponsoring_body, state, area_type, min_loan_amount, max_loan_amount,
  benefit_amount, interest_subsidy_pct, income_max, category, gender,
  requires_shg_membership, eligible_relation, priority_groups,
  application_link, active, launched_on, valid_until
) VALUES

-- ---------- MSME: credit, formalisation, certification ----------
('pm-vishwakarma','PM Vishwakarma','Support for artisans and craftspeople working with their hands and tools — carpenters, blacksmiths, potters, cobblers, tailors, barbers and 12 other traditional trades. Combines recognition, skill training, a toolkit grant and collateral-free staged credit.','Free skill training with ₹500/day stipend, ₹15,000 toolkit grant, then collateral-free loans ₹1 Lakh → ₹2 Lakh at 5% interest.','loan','{crafts,tailoring,handicraft,services}','Ministry of MSME','all','both',100000,300000,15000,5,NULL,'{}','any',false,'{}','{women,youth}','https://pmvishwakarma.gov.in/',true,'2023-09-17','2028-03-31'),
('pmfme','PMFME — Formalisation of Micro Food Processing Enterprises','Credit-linked subsidy to help existing unorganised micro food processing units formalise, upgrade equipment and meet FSSAI standards. Includes a separate seed-capital route for SHG members.','35% credit-linked capital subsidy up to ₹10 Lakh per unit; ₹40,000 seed capital per SHG member for working capital.','subsidy','{food_processing,farming,dairy_processing}','Ministry of Food Processing Industries','all','both',NULL,1000000,40000,NULL,NULL,'{}','any',false,'{shg_member}','{women}','https://pmfme.mofpi.gov.in/sitesubsite/',true,'2020-06-29','2026-03-31'),
('zed','MSME Sustainable (ZED) Certification','Zero Defect Zero Effect certification for micro and small manufacturers — a graded quality and sustainability standard that unlocks buyer confidence and cheaper credit.','50–80% subsidy on certification cost, plus additional subsidy for women-owned and SC/ST-owned units; ₹3 Lakh handholding support.','registration','{manufacturing,food_processing,crafts}','Ministry of MSME','all','both',NULL,NULL,300000,NULL,NULL,'{sc,st}','any',false,'{}','{women}','https://zed.msme.gov.in/',true,'2022-04-28',NULL),
('lean-msme','MSME Competitive (Lean) Scheme','Government-funded lean manufacturing consultants who work inside small units to cut waste, rework and inventory cost.','Up to 90% of consultant cost borne by government; extra 5% for women-owned/SC-ST units.','training','{manufacturing,food_processing}','Ministry of MSME','all','both',NULL,NULL,NULL,NULL,NULL,'{sc,st}','any',false,'{}','{women}','https://lean.msme.gov.in/',true,NULL,NULL),
('ramp','RAMP — Raising and Accelerating MSME Performance','World Bank-supported programme strengthening state-level MSME delivery — market access, credit access, technology upgradation and greening of small firms.','Access to state-run MSME support projects, market linkage and technology adoption funding.','other','{manufacturing,services,retail,food_processing}','Ministry of MSME','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://ramp.msme.gov.in/',true,'2022-03-30',NULL),
('msme-team','MSME TEAM — Trade Enablement & Marketing','Onboards small and micro enterprises onto ONDC and other digital commerce networks, including cataloguing, digital marketing and account management support.','Free onboarding to ONDC with cataloguing and digital marketing support; priority for women-owned and SC/ST-owned units.','other','{retail,handicraft,food_processing,tailoring}','Ministry of MSME / NSIC / ONDC','all','both',NULL,NULL,NULL,NULL,NULL,'{sc,st}','any',false,'{}','{women}','https://ramp.msme.gov.in/ramp/RAMP-initiative/msme-team-initiative/msme-team-initiative',true,NULL,NULL),
('mse-spice','MSE SPICE — Circular Economy','Supports micro and small enterprises adopting circular-economy practices — waste recovery, reuse and resource-efficient production.','Project support for circular-economy investments in small manufacturing units.','subsidy','{manufacturing}','Ministry of MSME / RAMP','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://ramp.msme.gov.in/ramp/RAMP-initiative/mse-spice/mse-spice',true,NULL,NULL),
('msme-innovative','MSME Innovative Scheme','Single umbrella for incubation, design intervention and IPR protection for small enterprises with a new product or process idea.','Up to ₹15 Lakh per idea for incubation; design project support; reimbursement of patent and trademark costs.','subsidy','{manufacturing,services,crafts}','Ministry of MSME','all','both',NULL,1500000,NULL,NULL,NULL,'{}','any',false,'{}','{youth}','https://innovative.msme.gov.in/Home/About',true,NULL,NULL),
('mse-cdp','MSE-CDP — Cluster Development Programme','Builds shared infrastructure for clusters of small units — common facility centres, testing labs, effluent treatment and upgraded industrial estates.','Up to 70–80% government grant for Common Facility Centres; infrastructure development support per cluster.','subsidy','{manufacturing,food_processing,crafts,tailoring}','Ministry of MSME','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://msme.gov.in/',true,NULL,NULL),
('aspire','ASPIRE — Innovation, Rural Industry and Entrepreneurship','Sets up Livelihood Business Incubators in rural areas to turn traditional rural skills into running enterprises.','Incubation support, equipment and training through Livelihood Business Incubators; up to ₹1 Crore per incubator.','training','{crafts,food_processing,farming,handicraft}','Ministry of MSME','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{youth,women}','https://msme.gov.in/',true,'2015-03-18',NULL),
('pms-msme','PMS — Procurement and Marketing Support','Reimburses small enterprises for participating in trade fairs, exhibitions and vendor development programmes, and for building marketing capability.','Reimbursement of stall charges and travel for domestic trade fairs; higher rates for women and SC/ST entrepreneurs.','subsidy','{retail,handicraft,manufacturing,food_processing}','Ministry of MSME','all','both',NULL,NULL,NULL,NULL,NULL,'{sc,st}','any',false,'{}','{women}','https://msme.gov.in/',true,NULL,NULL),
('nssh','NSSH — National SC-ST Hub','Dedicated support so SC and ST owned enterprises can meet the 4% mandatory public procurement target — mentoring, certification and subsidised plant.','25% subsidy on plant and machinery (max ₹25 Lakh), free Udyam/ZED/GeM onboarding, tender and testing fee reimbursement.','subsidy','{manufacturing,services,retail}','Ministry of MSME','all','both',NULL,NULL,2500000,NULL,NULL,'{sc,st}','any',false,'{}','{}','https://dashboard.msme.gov.in/scsthub.aspx',true,NULL,NULL),
('kgvy','KGVY — Khadi Gramodyog Vikas Yojana','Support for khadi institutions and village industry artisans — workshed, equipment, raw material banks and marketing assistance.','Workshed and equipment support for khadi artisans, plus marketing and raw-material assistance through KVIC.','subsidy','{crafts,tailoring,handicraft}','Ministry of MSME / KVIC','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{women}','https://my.msme.gov.in/mymsme/Scheme.aspx',true,NULL,NULL),
('cgtmse-hybrid','CGTMSE Hybrid Security Product','A CGTMSE variant letting a bank take partial collateral on part of the loan while the uncovered portion still carries the credit guarantee — useful when a borrower has some security but not enough.','Guarantee cover on the unsecured portion of a partly-secured loan, up to ₹5 Crore.','credit_guarantee','{}','Ministry of MSME / SIDBI — CGTMSE','all','both',NULL,50000000,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://pcg.cgtmse.in/',true,'2023-04-01',NULL),
('nsic-sprs','SPRS — Single Point Registration Scheme','NSIC registration that lets micro and small enterprises bid for government tenders without paying tender fees or earnest money deposit.','Free tender documents, EMD exemption, and 358 items reserved for exclusive MSE purchase.','registration','{manufacturing,services}','NSIC — Ministry of MSME','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://www.nsic.co.in/',true,'2021-02-25',NULL),
('udyam-assist','Udyam Assist Platform','Brings informal micro enterprises — those without GST registration — into the formal MSME fold so they can access priority sector lending.','Free formalisation certificate for informal micro units, unlocking priority sector lending and scheme eligibility.','registration','{retail,services,crafts,food_processing}','Ministry of MSME','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{women}','https://udyamassist.gov.in/',true,'2023-01-11',NULL),
('champions-portal','CHAMPIONS Portal','Single-window grievance redressal and handholding portal for MSMEs — finance, raw material, permissions and complaints against delayed payments.','Free grievance redressal, handholding and escalation for MSME issues including delayed payments.','other','{}','Ministry of MSME','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://champions.gov.in/',true,'2020-06-01',NULL),
('eclgs','ECLGS — Emergency Credit Line Guarantee Scheme','COVID-era 100% guaranteed emergency credit line for MSMEs and small borrowers. CLOSED to fresh guarantees since 31 March 2023 — retained for historical reference only.','100% government-guaranteed additional working capital term loan. No longer accepting new applications.','credit_guarantee','{}','Ministry of Finance / NCGTC','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://www.eclgs.com/',false,'2020-05-23','2023-03-31'),

-- ---------- Agriculture, horticulture, allied ----------
('aif','AIF — Agriculture Infrastructure Fund','Long-term financing for post-harvest infrastructure — warehouses, cold storage, grading and sorting units, primary processing — built by farmers, FPOs, SHGs and agri-entrepreneurs.','3% annual interest subvention on loans up to ₹2 Crore for up to 7 years, plus CGTMSE credit guarantee cover.','loan','{farming,food_processing,dairy}','Department of Agriculture & Farmers Welfare','all','rural',NULL,20000000,NULL,3,NULL,'{}','any',false,'{shg_member}','{}','https://agriinfra.dac.gov.in/',true,'2020-07-08','2033-03-31'),
('nlm-edp','NLM-EDP — National Livestock Mission Entrepreneurship','Capital subsidy for setting up poultry, sheep, goat, piggery and fodder enterprises — aimed at first-generation livestock entrepreneurs.','50% capital subsidy up to ₹50 Lakh for livestock entrepreneurship projects, released in two instalments.','subsidy','{dairy,farming}','Department of Animal Husbandry and Dairying','all','rural',NULL,5000000,NULL,NULL,NULL,'{}','any',false,'{shg_member}','{women,youth}','https://www.dahd.gov.in/schemes/programmes/national_livestock_mission',true,NULL,NULL),
('ahidf','AHIDF — Animal Husbandry Infrastructure Development Fund','Credit-linked support for dairy and meat processing, animal feed plants and breed improvement infrastructure.','3% interest subvention on loans, with credit guarantee cover for MSME borrowers.','loan','{dairy,food_processing}','Department of Animal Husbandry and Dairying','all','both',NULL,NULL,NULL,3,NULL,'{}','any',false,'{}','{}','https://www.dahd.gov.in/schemes/programmes/ahidf',true,NULL,NULL),
('pmmsy','PMMSY — PM Matsya Sampada Yojana','Support across the fisheries value chain — ponds, hatcheries, fish transport, cold chain, ornamental fisheries and seaweed cultivation.','40% subsidy for general category and 60% for SC/ST/women on approved fisheries projects.','subsidy','{farming,food_processing}','Department of Fisheries','all','both',NULL,NULL,NULL,NULL,NULL,'{sc,st}','any',false,'{shg_member}','{women}','https://pmmsy.dof.gov.in/',true,'2019-03-08','2026-03-31'),
('acabc','ACABC — Agri-Clinics and Agri-Business Centres','Free residential training plus subsidised credit for agriculture graduates and trained rural youth to set up agri-input shops, soil testing labs and advisory ventures.','Free 45-day training, then NABARD-backed composite subsidy of 36% (44% for SC/ST and women) on the project loan.','training','{farming,services}','Ministry of Agriculture & Farmers Welfare / MANAGE','all','rural',NULL,2000000,NULL,NULL,NULL,'{sc,st}','any',false,'{}','{youth,women}','https://www.agriclinics.net/',true,'2002-04-09',NULL),
('enam','e-NAM — National Agriculture Market','Online trading platform linking APMC mandis nationwide so farmers and FPOs can sell beyond their local mandi and see transparent price discovery.','Free online mandi trading across states, with assaying, e-payment and transparent price discovery.','other','{farming}','Ministry of Agriculture & Farmers Welfare','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://www.enam.gov.in/web/',true,'2016-04-14',NULL),
('enam-pop','e-NAM Platform of Platforms (PoP)','Extension of e-NAM that plugs private service platforms — logistics, quality assaying, fintech, warehousing — into the national mandi network.','Access to composite trade, logistics, assaying and finance service providers through the e-NAM network.','other','{farming,food_processing}','Ministry of Agriculture & Farmers Welfare','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://www.enam.gov.in/web/',true,'2023-07-15',NULL),
('fpo-10000','Formation and Promotion of 10,000 FPOs','Forms and supports Farmer Producer Organisations with management cost support, equity grant and a dedicated credit guarantee — collective buying and selling power for small farmers.','Up to ₹18 Lakh management support per FPO over 3 years, ₹2,000 matching equity grant per member, and credit guarantee up to ₹2 Crore.','subsidy','{farming,food_processing,dairy}','Ministry of Agriculture & Farmers Welfare / SFAC / NABARD','all','rural',NULL,20000000,1800000,NULL,NULL,'{}','any',false,'{}','{women}','https://sfacindia.com/',true,'2020-02-29','2028-03-31'),
('sfac-vca','VCA — Venture Capital Assistance (SFAC)','Interest-free venture capital to bridge the equity gap for agribusiness projects that are bankable but short of promoter contribution.','Interest-free venture capital of up to ₹50 Lakh (higher in NE and hilly states) as a soft loan repayable after the project stabilises.','loan','{farming,food_processing,dairy}','Small Farmers Agribusiness Consortium (SFAC)','all','rural',NULL,5000000,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://sfacindia.com/',true,'2014-01-01',NULL),
('pdmc','PDMC — Per Drop More Crop','Micro-irrigation support under PMKSY — drip and sprinkler systems that cut water use and raise yield per acre.','55% subsidy for small and marginal farmers and 45% for others on drip and sprinkler irrigation systems.','subsidy','{farming}','Ministry of Agriculture & Farmers Welfare — PMKSY','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://pmksy.gov.in/',true,'2021-12-17','2026-03-31'),
('midh','MIDH — Mission for Integrated Development of Horticulture','Covers the horticulture value chain — nurseries, orchards, protected cultivation, cold storage and post-harvest handling for fruits, vegetables, spices and flowers.','40–50% subsidy on horticulture components including polyhouses, orchards, pack houses and cold storage.','subsidy','{farming,food_processing}','Ministry of Agriculture & Farmers Welfare','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{shg_member}','{women}','https://midh.gov.in/',true,'2014-04-01','2026-03-31'),
('nmnf','NMNF — National Mission on Natural Farming','Promotes chemical-free farming using on-farm biomass and livestock-based inputs, with cluster formation, training and a farmer incentive.','₹15,000 per hectare over 3 years for conversion, plus cluster training and bio-input resource centre support.','subsidy','{farming}','Ministry of Agriculture & Farmers Welfare','all','rural',NULL,NULL,15000,NULL,NULL,'{}','any',false,'{shg_member}','{}','https://naturalfarming.dac.gov.in/',true,'2021-10-25',NULL),
('pkvy','PKVY — Paramparagat Krishi Vikas Yojana','Cluster-based organic farming support covering conversion, certification and marketing for groups of 50 farmers or more.','₹31,500 per hectare over 3 years, of which ₹15,000 goes directly to the farmer for on-farm inputs.','subsidy','{farming}','Ministry of Agriculture & Farmers Welfare','all','rural',NULL,NULL,31500,NULL,NULL,'{}','any',false,'{shg_member}','{}','https://pgsindia-ncof.gov.in/',true,'2015-04-01',NULL),
('nmeo-op','NMEO-OP — National Mission on Edible Oils (Oil Palm)','Raises domestic edible oil output by expanding oil palm cultivation, with assured price support and planting material assistance.','Viability price assurance for fresh fruit bunches, plus subsidy on planting material, inputs and maintenance for 4 years.','subsidy','{farming}','Ministry of Agriculture & Farmers Welfare','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://nmeo.dac.gov.in/',true,'2021-08-18','2026-03-31'),
('soil-health-card','Soil Health Card Scheme','Free soil testing and a card telling each farmer their soil nutrient status and exactly which fertiliser doses to apply — cuts input spend and raises yield.','Free soil testing and a crop-wise fertiliser recommendation card issued every two years.','direct_benefit','{farming}','Ministry of Agriculture & Farmers Welfare','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://soilhealth.dac.gov.in/',true,'2015-02-19',NULL),
('pm-pranam','PM-PRANAM','Rewards states that reduce chemical fertiliser use by returning a share of the subsidy saved, funding alternative fertiliser and natural farming assets at village level.','State-level incentive grants funding bio-fertiliser units, organic input centres and farmer awareness at village level.','other','{farming}','Ministry of Chemicals and Fertilizers','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://www.india.gov.in/',true,'2023-06-28',NULL),
('krishonnati','Krishonnati Yojana','Umbrella agriculture development programme bundling crop development, extension, mechanisation, marketing and horticulture sub-missions under one head.','Access to the bundled sub-missions — seeds, mechanisation, extension, marketing and horticulture support.','subsidy','{farming,food_processing}','Ministry of Agriculture & Farmers Welfare','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://agriwelfare.gov.in/',true,'2015-07-01',NULL),
('bharat-vistaar','Bharat-VISTAAR — Digital Agri Advisory','AI-backed digital extension platform giving farmers crop advisory, scheme information and agri-input guidance in their own language. A service platform, not a funded scheme.','Free AI-assisted crop and scheme advisory in regional languages.','other','{farming}','Ministry of Agriculture & Farmers Welfare','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://vikaspedia.in/agriculture',true,'2025-02-01',NULL),

-- ---------- Rural livelihoods, handloom, handicraft ----------
('nabard-ledp','LEDP — Livelihood and Enterprise Development Programme (NABARD)','NABARD programme taking mature SHG members from savings into actual enterprise — skill training, tools, backward and forward market linkage in one package.','Full-cost skill training, tools and market linkage support for SHG members entering livelihood enterprises.','training','{dairy,tailoring,handicraft,food_processing,farming}','NABARD','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',true,'{shg_member,shg_member_family}','{women}','https://www.nabard.org/',true,'2015-04-01',NULL),
('nhdp-handlooms','NHDP — National Handloom Development Programme','Support for individual weavers and weaver groups — yarn at subsidised rates, looms and accessories, worksheds, and concessional credit through the Weaver MUDRA route.','Yarn supply at subsidised rates, loom and workshed grants, and concessional weaver credit at 6% interest.','subsidy','{handicraft,tailoring,crafts}','Ministry of Textiles — Development Commissioner (Handlooms)','all','rural',NULL,200000,NULL,6,NULL,'{}','any',false,'{shg_member}','{women}','https://handlooms.nic.in/',true,NULL,NULL),
('nhdp-handicrafts','NHDP — National Handicrafts Development Programme','Support for artisans — Pehchan artisan cards, design and technical upgradation, marketing events, toolkits and cluster infrastructure.','Artisan identity card, toolkit distribution, design workshops and subsidised participation in marketing events.','subsidy','{handicraft,crafts}','Ministry of Textiles — Development Commissioner (Handicrafts)','all','rural',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{shg_member}','{women}','https://indian.handicrafts.gov.in/',true,NULL,NULL),
('womaniya-gem','Womaniya on GeM','Dedicated storefront on the Government e-Marketplace letting women entrepreneurs and women-led SHGs sell directly to government buyers without a middleman.','Direct access to government procurement demand for women sellers, with no intermediary and free onboarding.','other','{handicraft,tailoring,crafts,food_processing}','Government e-Marketplace (GeM)','all','both',NULL,NULL,NULL,NULL,NULL,'{}','female',false,'{shg_member}','{women}','https://gem.gov.in/',true,'2019-01-16',NULL),

-- ---------- Startup, finance, registration, discovery portals ----------
('startup-india','Startup India','The national startup programme — DPIIT recognition unlocking tax benefits, self-certification, easier public procurement and faster exit.','DPIIT recognition giving 3-year income tax exemption, self-certification on labour and environment laws, and tender relaxations.','registration','{services,manufacturing}','DPIIT — Ministry of Commerce and Industry','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{youth,women}','https://www.startupindia.gov.in/',true,'2016-01-16',NULL),
('sisfs','SISFS — Startup India Seed Fund Scheme','Early-stage capital for DPIIT-recognised startups, routed through approved incubators, for proof of concept, prototype and market entry.','Up to ₹20 Lakh grant for proof of concept or prototype, and up to ₹50 Lakh as convertible debt for commercialisation.','subsidy','{services,manufacturing,food_processing}','DPIIT — Ministry of Commerce and Industry','all','both',NULL,5000000,2000000,NULL,NULL,'{}','any',false,'{}','{youth,women}','https://seedfund.startupindia.gov.in/',true,'2021-01-28',NULL),
('treds','TReDS — Trade Receivables Discounting System','RBI-regulated electronic platform where MSMEs auction their unpaid invoices to financiers and get paid immediately instead of waiting 60–90 days.','Immediate cash against approved invoices at competitive discount rates, without collateral and without recourse.','other','{manufacturing,services,retail}','Reserve Bank of India','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://www.tradereceivables.in/',true,'2017-03-01',NULL),
('spice-plus','SPICe+ — Company Incorporation','Single integrated web form for incorporating a company — name reservation, DIN, PAN, TAN, GSTIN, EPFO, ESIC and bank account in one application.','One-form company incorporation bundling 10+ registrations, with zero fee on authorised capital up to ₹15 Lakh.','registration','{services,manufacturing,retail}','Ministry of Corporate Affairs','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://www.mca.gov.in/',true,'2020-02-05',NULL),
('nsws','NSWS — National Single Window System','One portal to identify and apply for the central and state approvals a business needs, replacing separate visits to each department.','Single application point for central and state clearances, with a Know Your Approvals tool and unified status tracking.','registration','{manufacturing,services,food_processing}','DPIIT — Ministry of Commerce and Industry','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://www.nsws.gov.in/',true,'2021-09-22',NULL),
('myscheme-portal','myScheme — National Scheme Discovery Portal','Government portal that matches a citizen to the central and state schemes they are actually eligible for, based on a short profile — a discovery layer rather than a scheme itself.','Personalised eligibility-based discovery across 3,000+ central and state schemes, with direct links to each application.','other','{}','Digital India Corporation — MeitY','all','both',NULL,NULL,NULL,NULL,NULL,'{}','any',false,'{}','{}','https://www.myscheme.gov.in/',true,'2022-07-26',NULL)

ON CONFLICT (slug) DO UPDATE SET
  name_en = EXCLUDED.name_en, description_en = EXCLUDED.description_en,
  benefit_summary_en = EXCLUDED.benefit_summary_en, application_link = EXCLUDED.application_link,
  scheme_type = EXCLUDED.scheme_type, sector = EXCLUDED.sector,
  sponsoring_body = EXCLUDED.sponsoring_body, area_type = EXCLUDED.area_type,
  min_loan_amount = EXCLUDED.min_loan_amount, max_loan_amount = EXCLUDED.max_loan_amount,
  benefit_amount = EXCLUDED.benefit_amount, interest_subsidy_pct = EXCLUDED.interest_subsidy_pct,
  income_max = EXCLUDED.income_max, category = EXCLUDED.category, gender = EXCLUDED.gender,
  requires_shg_membership = EXCLUDED.requires_shg_membership,
  eligible_relation = EXCLUDED.eligible_relation, priority_groups = EXCLUDED.priority_groups,
  active = EXCLUDED.active, launched_on = EXCLUDED.launched_on,
  valid_until = EXCLUDED.valid_until, updated_at = NOW();

-- ============================================================
-- NEEDS VERIFICATION — dates/links taken from the source list that
-- conflict with the commonly published record. Stored as supplied;
-- confirm before the demo and correct with a one-line UPDATE.
--
--   pmmsy        launched_on 2019-03-08 as supplied. PMMSY is usually
--                dated to May 2020. Source list also gave dmsme.gov.in
--                as the link; the official portal is pmmsy.dof.gov.in
--                (per the Top-30 PDF), which is what is stored here.
--   nsic-sprs    launched_on 2021-02-25 as supplied. SPRS long predates
--                this; 2021 is likely a portal-revision date.
--   nmnf         launched_on 2021-10-25 as supplied. NMNF ran as a BPKP
--                sub-scheme from 2020 and became a standalone national
--                mission in Nov 2024. Link corrected to the official
--                naturalfarming.dac.gov.in.
--   nsws         source list gave myscheme.gov.in; corrected to the
--                actual NSWS portal nsws.gov.in.
--   nmeo-op      source list gave nfsm.gov.in; corrected to nmeo.dac.gov.in.
--   eclgs        seeded with active = FALSE. Closed to fresh guarantees
--                on 31 Mar 2023 — kept for history, must not be matched.
--   bharat-vistaar  an advisory platform, not a funded scheme. Seeded as
--                scheme_type 'other' so it never shows as a benefit.
--
-- NOT SEEDED (agencies/portals, not schemes): sidbi.in, nabard.org,
-- standupmitra.in (already the application route for stand-up-india),
-- msme.gov.in/about-us/attached-organizations, letsaspire.in (folded
-- into aspire), eudyogaadhaar.org (third-party, not a government site).
-- ============================================================

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
SELECT 'Saathi Vyapar DB Setup Complete (v2.1)' AS status,
  (SELECT COUNT(*) FROM public.schemes) AS schemes_loaded,
  (SELECT COUNT(*) FROM public.schemes WHERE active) AS schemes_active;
