-- ============================================================
-- Migration: 011_more_schemes.sql
-- Description: 46 more government schemes, in the shape the app reads.
--
-- Source: supabase/schema_v2.sql (a proposed redesign of the schemes table
-- with structured columns). That file must NOT be applied: it recreates the
-- whole database in the lineage that broke the deployed project once
-- already, and nothing in src/ reads its column names. This migration
-- carries only its seed rows across, folded into eligibility_rules JSONB
-- exactly as schemeMatcher.ts expects them:
--
--   v2 column                     → eligibility_rules key
--   income_max                    → income_max
--   sector[]                      → sector
--   category[]                    → category
--   gender (unless 'any')         → gender
--   min_loan_amount               → loan_amount_min
--   max_loan_amount               → loan_amount_max
--   requires_shg_membership       → requires_shg_membership
--   eligible_relation[]           → eligible_relation
--   area_type (unless 'both')     → area_type
--   priority_groups[]             → priority_groups
--
-- Three v2 columns are kept as real columns because they are facts about
-- the scheme, not rules: scheme_type, launched_on, valid_until. Nothing
-- reads them yet.
--
-- The 15 schemes already in the table are left untouched (ON CONFLICT DO
-- NOTHING): their Hindi document checklists from 007 must survive.
--
-- Skipped: eclgs — marked inactive in the source
-- (closed 31 Mar 2023). No code filters on `active`, so an inactive row
-- would still be recommended; it is simply not inserted.
--
-- Every new row gets the generic document checklist 007 used for schemes
-- without one, so the dashboard never shows an empty list.
-- ============================================================

ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS scheme_type TEXT;
ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS launched_on DATE;
ALTER TABLE public.schemes ADD COLUMN IF NOT EXISTS valid_until DATE;

INSERT INTO public.schemes
  (id, name, description, benefit_summary, sponsoring_body, application_link,
   eligibility_rules, required_documents, active, scheme_type, launched_on, valid_until)
VALUES
  ('svep-nrlm', 'Start-up Village Entrepreneurship Programme (SVEP)', 'A sub-scheme of DAY-NRLM supporting Self-Help Group (SHG) members and their family members to set up non-farm rural enterprises. Provides ongoing support through training, mentoring, and access to a community-managed revolving loan fund (Community Enterprise Fund). Implemented block-by-block, not nationwide — availability depends on whether SVEP has been rolled out in the user''s specific block.', 'Access to a community-managed revolving loan fund (Community Enterprise Fund) plus business training and ongoing mentoring support — not a one-time cash grant.', 'Ministry of Rural Development (DAY-NRLM)', 'https://svep.nrlm.gov.in/', '{"sector": ["non_farm", "retail", "tailoring", "food_processing", "handicraft", "dairy_processing"], "requires_shg_membership": true, "eligible_relation": ["shg_member", "shg_member_family"], "area_type": "rural", "priority_groups": ["women", "youth"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', NULL, NULL),
  ('pm-vishwakarma', 'PM Vishwakarma', 'Support for artisans and craftspeople working with their hands and tools — carpenters, blacksmiths, potters, cobblers, tailors, barbers and 12 other traditional trades. Combines recognition, skill training, a toolkit grant and collateral-free staged credit.', 'Free skill training with ₹500/day stipend, ₹15,000 toolkit grant, then collateral-free loans ₹1 Lakh → ₹2 Lakh at 5% interest.', 'Ministry of MSME', 'https://pmvishwakarma.gov.in/', '{"sector": ["crafts", "tailoring", "handicraft", "services"], "loan_amount_min": 100000, "loan_amount_max": 300000, "priority_groups": ["women", "youth"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'loan', '2023-09-17', '2028-03-31'),
  ('pmfme', 'PMFME — Formalisation of Micro Food Processing Enterprises', 'Credit-linked subsidy to help existing unorganised micro food processing units formalise, upgrade equipment and meet FSSAI standards. Includes a separate seed-capital route for SHG members.', '35% credit-linked capital subsidy up to ₹10 Lakh per unit; ₹40,000 seed capital per SHG member for working capital.', 'Ministry of Food Processing Industries', 'https://pmfme.mofpi.gov.in/sitesubsite/', '{"sector": ["food_processing", "farming", "dairy_processing"], "loan_amount_max": 1000000, "eligible_relation": ["shg_member"], "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', '2020-06-29', '2026-03-31'),
  ('zed', 'MSME Sustainable (ZED) Certification', 'Zero Defect Zero Effect certification for micro and small manufacturers — a graded quality and sustainability standard that unlocks buyer confidence and cheaper credit.', '50–80% subsidy on certification cost, plus additional subsidy for women-owned and SC/ST-owned units; ₹3 Lakh handholding support.', 'Ministry of MSME', 'https://zed.msme.gov.in/', '{"sector": ["manufacturing", "food_processing", "crafts"], "category": ["sc", "st"], "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'registration', '2022-04-28', NULL),
  ('lean-msme', 'MSME Competitive (Lean) Scheme', 'Government-funded lean manufacturing consultants who work inside small units to cut waste, rework and inventory cost.', 'Up to 90% of consultant cost borne by government; extra 5% for women-owned/SC-ST units.', 'Ministry of MSME', 'https://lean.msme.gov.in/', '{"sector": ["manufacturing", "food_processing"], "category": ["sc", "st"], "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'training', NULL, NULL),
  ('ramp', 'RAMP — Raising and Accelerating MSME Performance', 'World Bank-supported programme strengthening state-level MSME delivery — market access, credit access, technology upgradation and greening of small firms.', 'Access to state-run MSME support projects, market linkage and technology adoption funding.', 'Ministry of MSME', 'https://ramp.msme.gov.in/', '{"sector": ["manufacturing", "services", "retail", "food_processing"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'other', '2022-03-30', NULL),
  ('msme-team', 'MSME TEAM — Trade Enablement & Marketing', 'Onboards small and micro enterprises onto ONDC and other digital commerce networks, including cataloguing, digital marketing and account management support.', 'Free onboarding to ONDC with cataloguing and digital marketing support; priority for women-owned and SC/ST-owned units.', 'Ministry of MSME / NSIC / ONDC', 'https://ramp.msme.gov.in/ramp/RAMP-initiative/msme-team-initiative/msme-team-initiative', '{"sector": ["retail", "handicraft", "food_processing", "tailoring"], "category": ["sc", "st"], "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'other', NULL, NULL),
  ('mse-spice', 'MSE SPICE — Circular Economy', 'Supports micro and small enterprises adopting circular-economy practices — waste recovery, reuse and resource-efficient production.', 'Project support for circular-economy investments in small manufacturing units.', 'Ministry of MSME / RAMP', 'https://ramp.msme.gov.in/ramp/RAMP-initiative/mse-spice/mse-spice', '{"sector": ["manufacturing"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', NULL, NULL),
  ('msme-innovative', 'MSME Innovative Scheme', 'Single umbrella for incubation, design intervention and IPR protection for small enterprises with a new product or process idea.', 'Up to ₹15 Lakh per idea for incubation; design project support; reimbursement of patent and trademark costs.', 'Ministry of MSME', 'https://innovative.msme.gov.in/Home/About', '{"sector": ["manufacturing", "services", "crafts"], "loan_amount_max": 1500000, "priority_groups": ["youth"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', NULL, NULL),
  ('mse-cdp', 'MSE-CDP — Cluster Development Programme', 'Builds shared infrastructure for clusters of small units — common facility centres, testing labs, effluent treatment and upgraded industrial estates.', 'Up to 70–80% government grant for Common Facility Centres; infrastructure development support per cluster.', 'Ministry of MSME', 'https://msme.gov.in/', '{"sector": ["manufacturing", "food_processing", "crafts", "tailoring"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', NULL, NULL),
  ('aspire', 'ASPIRE — Innovation, Rural Industry and Entrepreneurship', 'Sets up Livelihood Business Incubators in rural areas to turn traditional rural skills into running enterprises.', 'Incubation support, equipment and training through Livelihood Business Incubators; up to ₹1 Crore per incubator.', 'Ministry of MSME', 'https://msme.gov.in/', '{"sector": ["crafts", "food_processing", "farming", "handicraft"], "area_type": "rural", "priority_groups": ["youth", "women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'training', '2015-03-18', NULL),
  ('pms-msme', 'PMS — Procurement and Marketing Support', 'Reimburses small enterprises for participating in trade fairs, exhibitions and vendor development programmes, and for building marketing capability.', 'Reimbursement of stall charges and travel for domestic trade fairs; higher rates for women and SC/ST entrepreneurs.', 'Ministry of MSME', 'https://msme.gov.in/', '{"sector": ["retail", "handicraft", "manufacturing", "food_processing"], "category": ["sc", "st"], "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', NULL, NULL),
  ('nssh', 'NSSH — National SC-ST Hub', 'Dedicated support so SC and ST owned enterprises can meet the 4% mandatory public procurement target — mentoring, certification and subsidised plant.', '25% subsidy on plant and machinery (max ₹25 Lakh), free Udyam/ZED/GeM onboarding, tender and testing fee reimbursement.', 'Ministry of MSME', 'https://dashboard.msme.gov.in/scsthub.aspx', '{"sector": ["manufacturing", "services", "retail"], "category": ["sc", "st"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', NULL, NULL),
  ('kgvy', 'KGVY — Khadi Gramodyog Vikas Yojana', 'Support for khadi institutions and village industry artisans — workshed, equipment, raw material banks and marketing assistance.', 'Workshed and equipment support for khadi artisans, plus marketing and raw-material assistance through KVIC.', 'Ministry of MSME / KVIC', 'https://my.msme.gov.in/mymsme/Scheme.aspx', '{"sector": ["crafts", "tailoring", "handicraft"], "area_type": "rural", "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', NULL, NULL),
  ('cgtmse-hybrid', 'CGTMSE Hybrid Security Product', 'A CGTMSE variant letting a bank take partial collateral on part of the loan while the uncovered portion still carries the credit guarantee — useful when a borrower has some security but not enough.', 'Guarantee cover on the unsecured portion of a partly-secured loan, up to ₹5 Crore.', 'Ministry of MSME / SIDBI — CGTMSE', 'https://pcg.cgtmse.in/', '{"loan_amount_max": 50000000}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'credit_guarantee', '2023-04-01', NULL),
  ('nsic-sprs', 'SPRS — Single Point Registration Scheme', 'NSIC registration that lets micro and small enterprises bid for government tenders without paying tender fees or earnest money deposit.', 'Free tender documents, EMD exemption, and 358 items reserved for exclusive MSE purchase.', 'NSIC — Ministry of MSME', 'https://www.nsic.co.in/', '{"sector": ["manufacturing", "services"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'registration', '2021-02-25', NULL),
  ('udyam-assist', 'Udyam Assist Platform', 'Brings informal micro enterprises — those without GST registration — into the formal MSME fold so they can access priority sector lending.', 'Free formalisation certificate for informal micro units, unlocking priority sector lending and scheme eligibility.', 'Ministry of MSME', 'https://udyamassist.gov.in/', '{"sector": ["retail", "services", "crafts", "food_processing"], "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'registration', '2023-01-11', NULL),
  ('champions-portal', 'CHAMPIONS Portal', 'Single-window grievance redressal and handholding portal for MSMEs — finance, raw material, permissions and complaints against delayed payments.', 'Free grievance redressal, handholding and escalation for MSME issues including delayed payments.', 'Ministry of MSME', 'https://champions.gov.in/', '{}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'other', '2020-06-01', NULL),
  ('aif', 'AIF — Agriculture Infrastructure Fund', 'Long-term financing for post-harvest infrastructure — warehouses, cold storage, grading and sorting units, primary processing — built by farmers, FPOs, SHGs and agri-entrepreneurs.', '3% annual interest subvention on loans up to ₹2 Crore for up to 7 years, plus CGTMSE credit guarantee cover.', 'Department of Agriculture & Farmers Welfare', 'https://agriinfra.dac.gov.in/', '{"sector": ["farming", "food_processing", "dairy"], "loan_amount_max": 20000000, "eligible_relation": ["shg_member"], "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'loan', '2020-07-08', '2033-03-31'),
  ('nlm-edp', 'NLM-EDP — National Livestock Mission Entrepreneurship', 'Capital subsidy for setting up poultry, sheep, goat, piggery and fodder enterprises — aimed at first-generation livestock entrepreneurs.', '50% capital subsidy up to ₹50 Lakh for livestock entrepreneurship projects, released in two instalments.', 'Department of Animal Husbandry and Dairying', 'https://www.dahd.gov.in/schemes/programmes/national_livestock_mission', '{"sector": ["dairy", "farming"], "loan_amount_max": 5000000, "eligible_relation": ["shg_member"], "area_type": "rural", "priority_groups": ["women", "youth"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', NULL, NULL),
  ('ahidf', 'AHIDF — Animal Husbandry Infrastructure Development Fund', 'Credit-linked support for dairy and meat processing, animal feed plants and breed improvement infrastructure.', '3% interest subvention on loans, with credit guarantee cover for MSME borrowers.', 'Department of Animal Husbandry and Dairying', 'https://www.dahd.gov.in/schemes/programmes/ahidf', '{"sector": ["dairy", "food_processing"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'loan', NULL, NULL),
  ('pmmsy', 'PMMSY — PM Matsya Sampada Yojana', 'Support across the fisheries value chain — ponds, hatcheries, fish transport, cold chain, ornamental fisheries and seaweed cultivation.', '40% subsidy for general category and 60% for SC/ST/women on approved fisheries projects.', 'Department of Fisheries', 'https://pmmsy.dof.gov.in/', '{"sector": ["farming", "food_processing"], "category": ["sc", "st"], "eligible_relation": ["shg_member"], "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', '2019-03-08', '2026-03-31'),
  ('acabc', 'ACABC — Agri-Clinics and Agri-Business Centres', 'Free residential training plus subsidised credit for agriculture graduates and trained rural youth to set up agri-input shops, soil testing labs and advisory ventures.', 'Free 45-day training, then NABARD-backed composite subsidy of 36% (44% for SC/ST and women) on the project loan.', 'Ministry of Agriculture & Farmers Welfare / MANAGE', 'https://www.agriclinics.net/', '{"sector": ["farming", "services"], "category": ["sc", "st"], "loan_amount_max": 2000000, "area_type": "rural", "priority_groups": ["youth", "women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'training', '2002-04-09', NULL),
  ('enam', 'e-NAM — National Agriculture Market', 'Online trading platform linking APMC mandis nationwide so farmers and FPOs can sell beyond their local mandi and see transparent price discovery.', 'Free online mandi trading across states, with assaying, e-payment and transparent price discovery.', 'Ministry of Agriculture & Farmers Welfare', 'https://www.enam.gov.in/web/', '{"sector": ["farming"], "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'other', '2016-04-14', NULL),
  ('enam-pop', 'e-NAM Platform of Platforms (PoP)', 'Extension of e-NAM that plugs private service platforms — logistics, quality assaying, fintech, warehousing — into the national mandi network.', 'Access to composite trade, logistics, assaying and finance service providers through the e-NAM network.', 'Ministry of Agriculture & Farmers Welfare', 'https://www.enam.gov.in/web/', '{"sector": ["farming", "food_processing"], "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'other', '2023-07-15', NULL),
  ('fpo-10000', 'Formation and Promotion of 10,000 FPOs', 'Forms and supports Farmer Producer Organisations with management cost support, equity grant and a dedicated credit guarantee — collective buying and selling power for small farmers.', 'Up to ₹18 Lakh management support per FPO over 3 years, ₹2,000 matching equity grant per member, and credit guarantee up to ₹2 Crore.', 'Ministry of Agriculture & Farmers Welfare / SFAC / NABARD', 'https://sfacindia.com/', '{"sector": ["farming", "food_processing", "dairy"], "loan_amount_max": 20000000, "area_type": "rural", "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', '2020-02-29', '2028-03-31'),
  ('sfac-vca', 'VCA — Venture Capital Assistance (SFAC)', 'Interest-free venture capital to bridge the equity gap for agribusiness projects that are bankable but short of promoter contribution.', 'Interest-free venture capital of up to ₹50 Lakh (higher in NE and hilly states) as a soft loan repayable after the project stabilises.', 'Small Farmers Agribusiness Consortium (SFAC)', 'https://sfacindia.com/', '{"sector": ["farming", "food_processing", "dairy"], "loan_amount_max": 5000000, "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'loan', '2014-01-01', NULL),
  ('pdmc', 'PDMC — Per Drop More Crop', 'Micro-irrigation support under PMKSY — drip and sprinkler systems that cut water use and raise yield per acre.', '55% subsidy for small and marginal farmers and 45% for others on drip and sprinkler irrigation systems.', 'Ministry of Agriculture & Farmers Welfare — PMKSY', 'https://pmksy.gov.in/', '{"sector": ["farming"], "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', '2021-12-17', '2026-03-31'),
  ('midh', 'MIDH — Mission for Integrated Development of Horticulture', 'Covers the horticulture value chain — nurseries, orchards, protected cultivation, cold storage and post-harvest handling for fruits, vegetables, spices and flowers.', '40–50% subsidy on horticulture components including polyhouses, orchards, pack houses and cold storage.', 'Ministry of Agriculture & Farmers Welfare', 'https://midh.gov.in/', '{"sector": ["farming", "food_processing"], "eligible_relation": ["shg_member"], "area_type": "rural", "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', '2014-04-01', '2026-03-31'),
  ('nmnf', 'NMNF — National Mission on Natural Farming', 'Promotes chemical-free farming using on-farm biomass and livestock-based inputs, with cluster formation, training and a farmer incentive.', '₹15,000 per hectare over 3 years for conversion, plus cluster training and bio-input resource centre support.', 'Ministry of Agriculture & Farmers Welfare', 'https://naturalfarming.dac.gov.in/', '{"sector": ["farming"], "eligible_relation": ["shg_member"], "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', '2021-10-25', NULL),
  ('pkvy', 'PKVY — Paramparagat Krishi Vikas Yojana', 'Cluster-based organic farming support covering conversion, certification and marketing for groups of 50 farmers or more.', '₹31,500 per hectare over 3 years, of which ₹15,000 goes directly to the farmer for on-farm inputs.', 'Ministry of Agriculture & Farmers Welfare', 'https://pgsindia-ncof.gov.in/', '{"sector": ["farming"], "eligible_relation": ["shg_member"], "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', '2015-04-01', NULL),
  ('nmeo-op', 'NMEO-OP — National Mission on Edible Oils (Oil Palm)', 'Raises domestic edible oil output by expanding oil palm cultivation, with assured price support and planting material assistance.', 'Viability price assurance for fresh fruit bunches, plus subsidy on planting material, inputs and maintenance for 4 years.', 'Ministry of Agriculture & Farmers Welfare', 'https://nmeo.dac.gov.in/', '{"sector": ["farming"], "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', '2021-08-18', '2026-03-31'),
  ('soil-health-card', 'Soil Health Card Scheme', 'Free soil testing and a card telling each farmer their soil nutrient status and exactly which fertiliser doses to apply — cuts input spend and raises yield.', 'Free soil testing and a crop-wise fertiliser recommendation card issued every two years.', 'Ministry of Agriculture & Farmers Welfare', 'https://soilhealth.dac.gov.in/', '{"sector": ["farming"], "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'direct_benefit', '2015-02-19', NULL),
  ('pm-pranam', 'PM-PRANAM', 'Rewards states that reduce chemical fertiliser use by returning a share of the subsidy saved, funding alternative fertiliser and natural farming assets at village level.', 'State-level incentive grants funding bio-fertiliser units, organic input centres and farmer awareness at village level.', 'Ministry of Chemicals and Fertilizers', 'https://www.india.gov.in/', '{"sector": ["farming"], "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'other', '2023-06-28', NULL),
  ('krishonnati', 'Krishonnati Yojana', 'Umbrella agriculture development programme bundling crop development, extension, mechanisation, marketing and horticulture sub-missions under one head.', 'Access to the bundled sub-missions — seeds, mechanisation, extension, marketing and horticulture support.', 'Ministry of Agriculture & Farmers Welfare', 'https://agriwelfare.gov.in/', '{"sector": ["farming", "food_processing"], "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', '2015-07-01', NULL),
  ('bharat-vistaar', 'Bharat-VISTAAR — Digital Agri Advisory', 'AI-backed digital extension platform giving farmers crop advisory, scheme information and agri-input guidance in their own language. A service platform, not a funded scheme.', 'Free AI-assisted crop and scheme advisory in regional languages.', 'Ministry of Agriculture & Farmers Welfare', 'https://vikaspedia.in/agriculture', '{"sector": ["farming"], "area_type": "rural"}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'other', '2025-02-01', NULL),
  ('nabard-ledp', 'LEDP — Livelihood and Enterprise Development Programme (NABARD)', 'NABARD programme taking mature SHG members from savings into actual enterprise — skill training, tools, backward and forward market linkage in one package.', 'Full-cost skill training, tools and market linkage support for SHG members entering livelihood enterprises.', 'NABARD', 'https://www.nabard.org/', '{"sector": ["dairy", "tailoring", "handicraft", "food_processing", "farming"], "requires_shg_membership": true, "eligible_relation": ["shg_member", "shg_member_family"], "area_type": "rural", "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'training', '2015-04-01', NULL),
  ('nhdp-handlooms', 'NHDP — National Handloom Development Programme', 'Support for individual weavers and weaver groups — yarn at subsidised rates, looms and accessories, worksheds, and concessional credit through the Weaver MUDRA route.', 'Yarn supply at subsidised rates, loom and workshed grants, and concessional weaver credit at 6% interest.', 'Ministry of Textiles — Development Commissioner (Handlooms)', 'https://handlooms.nic.in/', '{"sector": ["handicraft", "tailoring", "crafts"], "loan_amount_max": 200000, "eligible_relation": ["shg_member"], "area_type": "rural", "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', NULL, NULL),
  ('nhdp-handicrafts', 'NHDP — National Handicrafts Development Programme', 'Support for artisans — Pehchan artisan cards, design and technical upgradation, marketing events, toolkits and cluster infrastructure.', 'Artisan identity card, toolkit distribution, design workshops and subsidised participation in marketing events.', 'Ministry of Textiles — Development Commissioner (Handicrafts)', 'https://indian.handicrafts.gov.in/', '{"sector": ["handicraft", "crafts"], "eligible_relation": ["shg_member"], "area_type": "rural", "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', NULL, NULL),
  ('womaniya-gem', 'Womaniya on GeM', 'Dedicated storefront on the Government e-Marketplace letting women entrepreneurs and women-led SHGs sell directly to government buyers without a middleman.', 'Direct access to government procurement demand for women sellers, with no intermediary and free onboarding.', 'Government e-Marketplace (GeM)', 'https://gem.gov.in/', '{"sector": ["handicraft", "tailoring", "crafts", "food_processing"], "gender": "female", "eligible_relation": ["shg_member"], "priority_groups": ["women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'other', '2019-01-16', NULL),
  ('startup-india', 'Startup India', 'The national startup programme — DPIIT recognition unlocking tax benefits, self-certification, easier public procurement and faster exit.', 'DPIIT recognition giving 3-year income tax exemption, self-certification on labour and environment laws, and tender relaxations.', 'DPIIT — Ministry of Commerce and Industry', 'https://www.startupindia.gov.in/', '{"sector": ["services", "manufacturing"], "priority_groups": ["youth", "women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'registration', '2016-01-16', NULL),
  ('sisfs', 'SISFS — Startup India Seed Fund Scheme', 'Early-stage capital for DPIIT-recognised startups, routed through approved incubators, for proof of concept, prototype and market entry.', 'Up to ₹20 Lakh grant for proof of concept or prototype, and up to ₹50 Lakh as convertible debt for commercialisation.', 'DPIIT — Ministry of Commerce and Industry', 'https://seedfund.startupindia.gov.in/', '{"sector": ["services", "manufacturing", "food_processing"], "loan_amount_max": 5000000, "priority_groups": ["youth", "women"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'subsidy', '2021-01-28', NULL),
  ('treds', 'TReDS — Trade Receivables Discounting System', 'RBI-regulated electronic platform where MSMEs auction their unpaid invoices to financiers and get paid immediately instead of waiting 60–90 days.', 'Immediate cash against approved invoices at competitive discount rates, without collateral and without recourse.', 'Reserve Bank of India', 'https://www.tradereceivables.in/', '{"sector": ["manufacturing", "services", "retail"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'other', '2017-03-01', NULL),
  ('spice-plus', 'SPICe+ — Company Incorporation', 'Single integrated web form for incorporating a company — name reservation, DIN, PAN, TAN, GSTIN, EPFO, ESIC and bank account in one application.', 'One-form company incorporation bundling 10+ registrations, with zero fee on authorised capital up to ₹15 Lakh.', 'Ministry of Corporate Affairs', 'https://www.mca.gov.in/', '{"sector": ["services", "manufacturing", "retail"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'registration', '2020-02-05', NULL),
  ('nsws', 'NSWS — National Single Window System', 'One portal to identify and apply for the central and state approvals a business needs, replacing separate visits to each department.', 'Single application point for central and state clearances, with a Know Your Approvals tool and unified status tracking.', 'DPIIT — Ministry of Commerce and Industry', 'https://www.nsws.gov.in/', '{"sector": ["manufacturing", "services", "food_processing"]}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'registration', '2021-09-22', NULL),
  ('myscheme-portal', 'myScheme — National Scheme Discovery Portal', 'Government portal that matches a citizen to the central and state schemes they are actually eligible for, based on a short profile — a discovery layer rather than a scheme itself.', 'Personalised eligibility-based discovery across 3,000+ central and state schemes, with direct links to each application.', 'Digital India Corporation — MeitY', 'https://www.myscheme.gov.in/', '{}'::jsonb, '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb, TRUE, 'other', '2022-07-26', NULL)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.schemes;
  RAISE NOTICE 'schemes after 011: % rows', n;
  IF n < 61 THEN
    RAISE EXCEPTION 'Expected at least 61 schemes, found %', n;
  END IF;
END $$;
