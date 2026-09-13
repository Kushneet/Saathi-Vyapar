-- ============================================================
-- Migration: 007_scheme_documents.sql
-- Description: Move the sponsoring body and document checklist into the
-- schemes table, so adding a scheme really is a data change.
--
-- The pitch says the scheme dataset is "structured, admin-editable data — new
-- schemes or states can be added without redeploying code". That was only
-- true for eligibility_rules, benefit_summary and application_link. The
-- sponsoring body and the required-document checklist lived in a chain of
-- `if (name.toLowerCase().includes('pmegp'))` branches inside
-- src/app/dashboard/schemes/page.tsx, so a scheme inserted through Supabase
-- rendered with no documents and no sponsoring body until someone edited a
-- React component and redeployed.
--
-- Values below are migrated verbatim from that component.
-- ============================================================

ALTER TABLE public.schemes
  ADD COLUMN IF NOT EXISTS sponsoring_body TEXT,
  ADD COLUMN IF NOT EXISTS required_documents JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.schemes.sponsoring_body IS
  'Ministry or agency that runs the scheme, shown on the scheme card.';
COMMENT ON COLUMN public.schemes.required_documents IS
  'JSON array of document strings shown as the applicant checklist.';

-- ── Backfill, matching the rules the component used ─────────────────────

UPDATE public.schemes SET
  sponsoring_body = '🏛️ KVIC / Ministry of MSME, Govt. of India',
  required_documents = '[
    "आधार कार्ड (Aadhaar Card)",
    "प्रोजेक्ट रिपोर्ट / कार्य योजना (Project Proposal Report)",
    "जाति प्रमाण पत्र (Caste Certificate, if SC/ST/OBC)",
    "शैक्षणिक प्रमाण पत्र (8th Pass Marksheet for >₹10L)",
    "बैंक पासबुक एवं खाता विवरण (Bank Passbook Copy)",
    "पासपोर्ट साइज फोटो (Passport Photos)"
  ]'::jsonb
WHERE name ILIKE '%pmegp%';

UPDATE public.schemes SET
  sponsoring_body = '🏛️ Department of Financial Services, Ministry of Finance',
  required_documents = '[
    "पहचान पत्र (Aadhaar / Voter ID / PAN)",
    "निवास प्रमाण पत्र (Address Proof / Ration Card)",
    "दुकान या कार्यस्थल का प्रमाण (Shop/Business Address Proof)",
    "खरीदे जाने वाले उपकरण/सामग्री का कोटेशन (Machinery Quotation)",
    "पिछले 6 महीने का बैंक स्टेटमेंट (Last 6 Months Bank Statement)",
    "2 पासपोर्ट साइज फोटो (2 Passport Photos)"
  ]'::jsonb
WHERE name ILIKE '%mudra%';

UPDATE public.schemes SET
  sponsoring_body = '🏛️ SIDBI / Ministry of Finance',
  required_documents = '[
    "आधार कार्ड एवं पैन कार्ड (Aadhaar & PAN Card)",
    "जाति प्रमाण पत्र (SC/ST Certificate) या महिला स्वामित्व प्रमाण",
    "विस्तृत प्रोजेक्ट रिपोर्ट (Detailed Project Report)",
    "प्रदूषण नियंत्रण बोर्ड क्लीयरेंस (यदि लागू हो)",
    "कंपनी/फर्म पंजीकरण दस्तावेज (Partnership / Incorporation Proof)"
  ]'::jsonb
WHERE name ILIKE '%stand-up%' OR name ILIKE '%standup%';

UPDATE public.schemes SET
  sponsoring_body = '🏛️ Ministry of Housing and Urban Affairs (MoHUA)',
  required_documents = '[
    "आधार कार्ड (Aadhaar Card linked with Mobile)",
    "वेंडिंग प्रमाण पत्र / सिफ़ारिश पत्र (Vending Certificate / LoR from ULB/TVC)",
    "बैंक खाता पासबुक (Bank Account Passbook)"
  ]'::jsonb
WHERE name ILIKE '%svanidhi%';

UPDATE public.schemes SET
  sponsoring_body = '🏛️ Ministry of Social Justice & Empowerment',
  required_documents = '[
    "आधार कार्ड (Aadhaar Card)",
    "सक्षम प्राधिकारी द्वारा जारी जाति प्रमाण पत्र (Caste Certificate)",
    "पारिवारिक आय प्रमाण पत्र (Income Certificate - BPL/EWS)",
    "बैंक खाता पासबुक एवं फोटो"
  ]'::jsonb
WHERE name ILIKE '%ajay%' OR name ILIKE '%nsfdc%' OR name ILIKE '%samridhi%';

UPDATE public.schemes SET
  sponsoring_body = '🏛️ Ministry of Tribal Affairs',
  required_documents = '[
    "आधार कार्ड (Aadhaar Card)",
    "अनुसूचित जनजाति (ST) प्रमाण पत्र (Tribal Certificate)",
    "आय प्रमाण पत्र (Income Certificate)",
    "प्रस्तावित व्यवसाय का विवरण (Proposed Livelihood Activity Summary)"
  ]'::jsonb
WHERE name ILIKE '%nstfdc%';

UPDATE public.schemes SET
  sponsoring_body = '🏛️ Ministry of Rural Development / Ministry of MSME',
  required_documents = '[
    "महिला उद्यमी का आधार कार्ड (Aadhaar Card)",
    "स्वयं सहायता समूह (SHG) संबद्धता पत्र / पासबुक (SHG Passbook)",
    "निवास एवं आय प्रमाण पत्र (Residence & Income Proof)"
  ]'::jsonb
WHERE name ILIKE '%sakhi%' OR name ILIKE '%nrlm%';

-- Anything the component would have shown its generic fallback for.
--
-- The condition is "has no checklist", not "has no sponsoring body". Projects
-- created from schema.sql declare sponsoring_body with
-- DEFAULT 'Government of India', so every row is already non-null there and a
-- NULL test silently skips them — leaving 8 of 15 schemes with no documents.
UPDATE public.schemes SET
  sponsoring_body = COALESCE(
    NULLIF(sponsoring_body, 'Government of India'),
    '🏛️ Government of India / State Directorate of Industries'
  ),
  required_documents = '[
    "आधार कार्ड (Aadhaar Card)",
    "पैन कार्ड / फॉर्म 60 (PAN Card)",
    "बैंक खाता पासबुक (Bank Account Details)",
    "उद्यम आधार (Udyam MSME Registration, if available)"
  ]'::jsonb
WHERE required_documents IS NULL
   OR jsonb_array_length(required_documents) = 0;

DO $$
DECLARE missing INT;
BEGIN
  SELECT count(*) INTO missing FROM public.schemes
  WHERE sponsoring_body IS NULL
     OR required_documents IS NULL
     OR jsonb_array_length(required_documents) = 0;

  IF missing > 0 THEN
    RAISE WARNING '% scheme row(s) still have no document checklist.', missing;
  ELSE
    RAISE NOTICE 'All scheme rows carry a sponsoring body and document checklist.';
  END IF;
END $$;
