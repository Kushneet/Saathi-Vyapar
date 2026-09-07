'use client';

/**
 * src/app/dashboard/schemes/page.tsx
 *
 * Yojana Kendra (योजना केंद्र) — Full Scheme Matching & Advisory Portal
 *
 * Capabilities:
 * - Profile data inspection & "Update my details" flow
 * - Pure deterministic scheme matching using schemeMatcher.ts / matchSchemes
 * - Ranked cards for eligible schemes with sponsoring body, subsidy benefits, reasons, and document checklists
 * - Collapsible explainability section for ineligible schemes with transparent rejection reasons
 * - "Re-check my eligibility" button with real-time recalculation
 * - Strictly profile-anchored (no disconnected generic search boxes)
 */

import { useState, useEffect, useTransition, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase/client';
import {
  matchSchemes,
  MatchResult,
  BusinessProfile,
  SchemeRecord,
} from '@/lib/engines/schemeMatcher';

// ── Fallback 15 Real Government Schemes for offline/unseeded environments ─────
const SEED_SCHEMES_FALLBACK: SchemeRecord[] = [
  {
    id: 'pmegp-001',
    name: 'PMEGP - Prime Minister\'s Employment Generation Programme',
    description: 'Credit-linked subsidy programme for setting up new micro-enterprises in non-farm sector. Implemented by KVIC.',
    benefit_summary: 'Subsidy of 15% to 35% of project cost (max ₹25 lakh for manufacturing, ₹10 lakh for service).',
    eligibility_rules: {
      income_max: 10000000,
      sector: ['manufacturing', 'services', 'retail', 'food_processing', 'handicrafts', 'textile', 'tailoring', 'general'],
      loan_amount_max: 2500000,
      loan_amount_min: 100000,
    },
    application_link: 'https://www.kviconline.gov.in/pmegpeportal/pmegphome/index.jsp',
  },
  {
    id: 'mudra-shishu-002',
    name: 'Mudra Shishu Loan (PMMY)',
    description: 'Pradhan Mantri Mudra Yojana - Shishu category provides collateral-free loans up to ₹50,000 for small businesses.',
    benefit_summary: 'Collateral-free loans up to ₹50,000 for starting or growing micro-enterprises with low interest rate.',
    eligibility_rules: {
      income_max: 2500000,
      loan_amount_max: 50000,
      loan_amount_min: 1000,
    },
    application_link: 'https://www.mudra.org.in/',
  },
  {
    id: 'mudra-kishor-003',
    name: 'Mudra Kishor Loan (PMMY)',
    description: 'Pradhan Mantri Mudra Yojana - Kishor category provides collateral-free loans from ₹50,001 to ₹5 lakh for growing businesses.',
    benefit_summary: 'Collateral-free working capital and asset loans between ₹50,001 and ₹5 lakh.',
    eligibility_rules: {
      income_max: 5000000,
      loan_amount_max: 500000,
      loan_amount_min: 50001,
    },
    application_link: 'https://www.mudra.org.in/',
  },
  {
    id: 'mudra-tarun-004',
    name: 'Mudra Tarun Loan (PMMY)',
    description: 'Pradhan Mantri Mudra Yojana - Tarun category provides loans from ₹5 lakh to ₹10 lakh for established enterprises.',
    benefit_summary: 'Loans between ₹5 lakh and ₹10 lakh for business expansion and machinery purchase.',
    eligibility_rules: {
      income_max: 15000000,
      loan_amount_max: 1000000,
      loan_amount_min: 500001,
    },
    application_link: 'https://www.mudra.org.in/',
  },
  {
    id: 'standup-india-005',
    name: 'Stand-Up India Scheme',
    description: 'Provides bank loans between ₹10 lakh and ₹1 crore to SC/ST or woman borrowers for greenfield enterprises.',
    benefit_summary: 'Bank loans of ₹10 lakh to ₹1 crore for manufacturing, services, or trading enterprises.',
    eligibility_rules: {
      category: ['sc', 'st'],
      gender: 'female',
      loan_amount_max: 10000000,
      loan_amount_min: 1000000,
      sector: ['manufacturing', 'services', 'trading', 'retail'],
    },
    application_link: 'https://www.standupmitra.in/',
  },
  {
    id: 'pm-svanidhi-006',
    name: 'PM SVANidhi - PM Street Vendor\'s AtmaNirbhar Nidhi',
    description: 'Micro-credit scheme for street vendors to avail affordable working capital loans with 7% interest subsidy.',
    benefit_summary: 'Collateral-free working capital loans starting at ₹10,000, scaling to ₹20,000 and ₹50,000 upon timely repayment.',
    eligibility_rules: {
      sector: ['street_vending', 'retail', 'food_services', 'food', 'services'],
      loan_amount_max: 50000,
      loan_amount_min: 10000,
    },
    application_link: 'https://pmsvanidhi.mohua.gov.in/',
  },
  {
    id: 'pm-ajay-007',
    name: 'PM-AJAY - Pradhan Mantri Anusuchit Jaati Abhyuday Yojana',
    description: 'Comprehensive socio-economic development and skill training programme for SC communities.',
    benefit_summary: 'Skill training, livelihood grants, and income support for SC entrepreneurs.',
    eligibility_rules: {
      category: ['sc'],
      income_max: 2500000,
    },
    application_link: 'https://socialjustice.gov.in/',
  },
  {
    id: 'nsfdc-008',
    name: 'NSFDC - National Scheduled Castes Finance and Development Corporation',
    description: 'Concessional finance to SC persons living below double poverty line for income-generating activities.',
    benefit_summary: 'Term loans at 6% per annum for agriculture, small business, transport, and technical trade.',
    eligibility_rules: {
      category: ['sc'],
      income_max: 300000,
      loan_amount_max: 1500000,
      loan_amount_min: 10000,
    },
    application_link: 'https://nsfdc.nic.in/',
  },
  {
    id: 'nstfdc-009',
    name: 'NSTFDC - National Scheduled Tribes Finance and Development Corporation',
    description: 'Financial assistance for income-generating activities for ST tribal entrepreneurs.',
    benefit_summary: 'Concessional loans at 6-8% interest for tribal agriculture, forestry, handicrafts, and small enterprises.',
    eligibility_rules: {
      category: ['st'],
      income_max: 400000,
      loan_amount_max: 2000000,
      loan_amount_min: 10000,
      sector: ['agriculture', 'forestry', 'handicrafts', 'manufacturing', 'services'],
    },
    application_link: 'https://www.nstfdc.nic.in/',
  },
  {
    id: 'mahila-samridhi-010',
    name: 'Mahila Samridhi Yojana',
    description: 'Micro-finance scheme for women entrepreneurs from marginalized and SC communities through SHGs.',
    benefit_summary: 'Micro-credit up to ₹1.4 lakh at 4% interest rate for women entrepreneurs.',
    eligibility_rules: {
      gender: 'female',
      category: ['sc'],
      income_max: 300000,
      loan_amount_max: 140000,
      loan_amount_min: 5000,
    },
    application_link: 'https://socialjustice.gov.in/',
  },
  {
    id: 'udyam-sakhi-011',
    name: 'Udyam Sakhi - Women Entrepreneurship Portal',
    description: 'Ecosystem for women entrepreneurs providing mentorship, market access, and credit facilitation.',
    benefit_summary: 'Free mentorship, business incubation, and direct financial linkage for women-led enterprises.',
    eligibility_rules: {
      gender: 'female',
      income_max: 10000000,
    },
    application_link: 'https://udyamsakhi.org/',
  },
  {
    id: 'pmkvy-012',
    name: 'PMKVY - Pradhan Mantri Kaushal Vikas Yojana (Skill India)',
    description: 'Flagship scheme for industry-relevant skill development and certification with monetary reward.',
    benefit_summary: 'Free skill training & certification across 300+ job roles with ₹8,000 monetary award upon passing.',
    eligibility_rules: {
      income_max: 5000000,
    },
    application_link: 'https://www.pmkvyofficial.org/',
  },
  {
    id: 'day-nrlm-013',
    name: 'DAY-NRLM - National Rural Livelihoods Mission',
    description: 'Rural poverty alleviation through SHG federation, interest subvention, and revolving funds.',
    benefit_summary: 'Interest subvention on SHG loans (credit at 7% interest) and revolving capital grants.',
    eligibility_rules: {
      gender: 'female',
      income_max: 200000,
      sector: ['agriculture', 'handicrafts', 'food_processing', 'retail', 'services'],
    },
    application_link: 'https://aajeevika.gov.in/',
  },
  {
    id: 'cgtmse-014',
    name: 'CGTMSE - Credit Guarantee Scheme for Micro & Small Enterprises',
    description: 'Credit guarantee coverage to banks for lending to MSMEs without third-party collateral.',
    benefit_summary: 'Credit guarantee coverage of 75% to 85% for collateral-free bank loans up to ₹5 crore.',
    eligibility_rules: {
      sector: ['manufacturing', 'services', 'retail', 'food_processing', 'technology', 'tailoring'],
      loan_amount_max: 50000000,
      loan_amount_min: 10000,
    },
    application_link: 'https://www.cgtmse.in/',
  },
  {
    id: 'kvic-honey-015',
    name: 'KVIC Honey Mission - National Bee Board',
    description: 'Promotes scientific beekeeping, honey production, and market linkage for rural livelihood.',
    benefit_summary: 'Free training, 50 beehive colonies, extraction kits, and guaranteed market linkage for rural beekeepers.',
    eligibility_rules: {
      sector: ['agriculture', 'beekeeping', 'rural_livelihood', 'farming', 'food'],
      income_max: 1200000,
    },
    application_link: 'https://kvic.gov.in/kvicres/bee-keeping.php',
  },
];

// ── Sponsoring Body & Document Checklist Helper ───────────────────────────────
function getSchemeDetails(schemeName: string): {
  sponsoringBody: string;
  requiredDocuments: string[];
} {
  const lower = schemeName.toLowerCase();

  if (lower.includes('pmegp')) {
    return {
      sponsoringBody: '🏛️ KVIC / Ministry of MSME, Govt. of India',
      requiredDocuments: [
        'आधार कार्ड (Aadhaar Card)',
        'प्रोजेक्ट रिपोर्ट / कार्य योजना (Project Proposal Report)',
        'जाति प्रमाण पत्र (Caste Certificate, if SC/ST/OBC)',
        'शैक्षणिक प्रमाण पत्र (8th Pass Marksheet for >₹10L)',
        'बैंक पासबुक एवं खाता विवरण (Bank Passbook Copy)',
        'पासपोर्ट साइज फोटो (Passport Photos)',
      ],
    };
  }

  if (lower.includes('mudra')) {
    return {
      sponsoringBody: '🏛️ Department of Financial Services, Ministry of Finance',
      requiredDocuments: [
        'पहचान पत्र (Aadhaar / Voter ID / PAN)',
        'निवास प्रमाण पत्र (Address Proof / Ration Card)',
        'दुकान या कार्यस्थल का प्रमाण (Shop/Business Address Proof)',
        'खरीदे जाने वाले उपकरण/सामग्री का कोटेशन (Machinery Quotation)',
        'पिछले 6 महीने का बैंक स्टेटमेंट (Last 6 Months Bank Statement)',
        '2 पासपोर्ट साइज फोटो (2 Passport Photos)',
      ],
    };
  }

  if (lower.includes('stand-up') || lower.includes('standup')) {
    return {
      sponsoringBody: '🏛️ SIDBI / Ministry of Finance',
      requiredDocuments: [
        'आधार कार्ड एवं पैन कार्ड (Aadhaar & PAN Card)',
        'जाति प्रमाण पत्र (SC/ST Certificate) या महिला स्वामित्व प्रमाण',
        'विस्तृत प्रोजेक्ट रिपोर्ट (Detailed Project Report)',
        'प्रदूषण नियंत्रण बोर्ड क्लीयरेंस (यदि लागू हो)',
        'कंपनी/फर्म पंजीकरण दस्तावेज (Partnership / Incorporation Proof)',
      ],
    };
  }

  if (lower.includes('svanidhi')) {
    return {
      sponsoringBody: '🏛️ Ministry of Housing and Urban Affairs (MoHUA)',
      requiredDocuments: [
        'आधार कार्ड (Aadhaar Card linked with Mobile)',
        'वेंडिंग प्रमाण पत्र / सिफ़ारिश पत्र (Vending Certificate / LoR from ULB/TVC)',
        'बैंक खाता पासबुक (Bank Account Passbook)',
      ],
    };
  }

  if (lower.includes('ajay') || lower.includes('nsfdc') || lower.includes('samridhi')) {
    return {
      sponsoringBody: '🏛️ Ministry of Social Justice & Empowerment',
      requiredDocuments: [
        'आधार कार्ड (Aadhaar Card)',
        'सक्षम प्राधिकारी द्वारा जारी जाति प्रमाण पत्र (Caste Certificate)',
        'पारिवारिक आय प्रमाण पत्र (Income Certificate - BPL/EWS)',
        'बैंक खाता पासबुक एवं फोटो',
      ],
    };
  }

  if (lower.includes('nstfdc')) {
    return {
      sponsoringBody: '🏛️ Ministry of Tribal Affairs',
      requiredDocuments: [
        'आधार कार्ड (Aadhaar Card)',
        'अनुसूचित जनजाति (ST) प्रमाण पत्र (Tribal Certificate)',
        'आय प्रमाण पत्र (Income Certificate)',
        'प्रस्तावित व्यवसाय का विवरण (Proposed Livelihood Activity Summary)',
      ],
    };
  }

  if (lower.includes('sakhi') || lower.includes('nrlm')) {
    return {
      sponsoringBody: '🏛️ Ministry of Rural Development / Ministry of MSME',
      requiredDocuments: [
        'महिला उद्यमी का आधार कार्ड (Aadhaar Card)',
        'स्वयं सहायता समूह (SHG) संबद्धता पत्र / पासबुक (SHG Passbook)',
        'निवास एवं आय प्रमाण पत्र (Residence & Income Proof)',
      ],
    };
  }

  // Default
  return {
    sponsoringBody: '🏛️ Government of India / State Directorate of Industries',
    requiredDocuments: [
      'आधार कार्ड (Aadhaar Card)',
      'पैन कार्ड / फॉर्म 60 (PAN Card)',
      'बैंक खाता पासबुक (Bank Account Details)',
      'उद्यम आधार (Udyam MSME Registration, if available)',
    ],
  };
}

function YojanaKendraContent() {
  const searchParams = useSearchParams();
  const paramUserId = searchParams.get('user_id');

  const [userId, setUserId] = useState<string | null>(paramUserId);
  const [user, setUser] = useState<{ name: string | null; phone: string } | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRechecking, setIsRechecking] = useState(false);
  const [showIneligible, setShowIneligible] = useState(false);
  const [checkedDocs, setCheckedDocs] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Load User, Profile, and run Scheme Matcher
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        let activeId = paramUserId;

        if (!activeId) {
          const {
            data: { session },
          } = await supabaseClient.auth.getSession();
          if (session?.user) {
            activeId = session.user.id;
          }
        }

        // Fallback to most recent user if none in session
        if (!activeId) {
          const { data: latestUsers } = await supabaseClient
            .from('users')
            .select('id, name, phone')
            .order('created_at', { ascending: false })
            .limit(1);

          if (latestUsers && latestUsers.length > 0) {
            activeId = latestUsers[0].id;
            setUser({ name: latestUsers[0].name, phone: latestUsers[0].phone });
          }
        } else {
          const { data: userData } = await supabaseClient
            .from('users')
            .select('name, phone')
            .eq('id', activeId)
            .single();

          if (userData) {
            setUser(userData);
          }
        }

        setUserId(activeId);

        if (activeId) {
          // 1. Fetch business profile
          const { data: profileData } = await supabaseClient
            .from('business_profiles')
            .select('*')
            .eq('user_id', activeId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          const currentProfile: BusinessProfile = {
            monthly_revenue_est: Number(profileData?.monthly_revenue_est) || 25000,
            monthly_expense_est: Number(profileData?.monthly_expense_est) || 15000,
            existing_loans: Boolean(profileData?.existing_loans),
            category: profileData?.category || 'general',
            sector: profileData?.sector || 'retail',
            gender: profileData?.gender || 'any',
            state: profileData?.state || 'India',
          };

          setProfile(currentProfile);

          // 2. Fetch schemes from DB
          const { data: dbSchemes } = await supabaseClient.from('schemes').select('*');

          const schemeList: SchemeRecord[] =
            dbSchemes && dbSchemes.length > 0
              ? dbSchemes.map((s: Record<string, unknown>) => ({
                  id: String(s.id),
                  name: String(s.name),
                  description: String(s.description || ''),
                  benefit_summary: s.benefit_summary ? String(s.benefit_summary) : undefined,
                  eligibility_rules: (s.eligibility_rules as SchemeRecord['eligibility_rules']) || {},
                  application_link: s.application_link ? String(s.application_link) : undefined,
                }))
              : SEED_SCHEMES_FALLBACK;

          // 3. Deterministic Matching
          const results = matchSchemes(currentProfile, schemeList);
          setMatchResults(results);
        }
      } catch (err) {
        console.error('Error loading Yojana Kendra data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [paramUserId]);

  // Re-check Eligibility Handler
  function handleRecheck() {
    if (!profile) return;
    setIsRechecking(true);
    setNotification(null);

    startTransition(async () => {
      // Re-fetch latest schemes and run match
      try {
        const { data: dbSchemes } = await supabaseClient.from('schemes').select('*');
        const schemeList: SchemeRecord[] =
          dbSchemes && dbSchemes.length > 0
            ? dbSchemes.map((s: Record<string, unknown>) => ({
                id: String(s.id),
                name: String(s.name),
                description: String(s.description || ''),
                benefit_summary: s.benefit_summary ? String(s.benefit_summary) : undefined,
                eligibility_rules: (s.eligibility_rules as SchemeRecord['eligibility_rules']) || {},
                application_link: s.application_link ? String(s.application_link) : undefined,
              }))
            : SEED_SCHEMES_FALLBACK;

        const results = matchSchemes(profile, schemeList);
        setMatchResults(results);

        setNotification('✅ आपकी पात्रता का पुनः मिलान सफलतापूर्वक पूरा हुआ!');
        setTimeout(() => setNotification(null), 4000);
      } catch (err) {
        console.error('Recheck error:', err);
      } finally {
        setIsRechecking(false);
      }
    });
  }

  // Toggle document checkbox
  function toggleDocCheck(docId: string) {
    setCheckedDocs((prev) => ({ ...prev, [docId]: !prev[docId] }));
  }

  const eligibleResults = matchResults.filter((r) => r.eligible);
  const ineligibleResults = matchResults.filter((r) => !r.eligible);

  return (
    <div className="min-h-screen bg-[#F5F1E6] text-[#0B1E33] font-['Inter',sans-serif] p-3 sm:p-6 pb-24  relative overflow-hidden">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(201,162,75,0.07),transparent_70%)] blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[radial-gradient(circle_at_center,rgba(11,30,51,0.04),transparent_70%)] blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto space-y-6">
        {/* ── Header ────────────────────────────────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#C9A24B]/20 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/Logo.png" alt="Saathi Vyapar Logo" className="w-8 h-8 object-contain" />
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-[#0B1E33] flex items-center gap-2">
                  योजना केंद्र (Yojana Kendra)
                  <span className="text-xs font-bold bg-[#F5F1E6] text-[#0B1E33] border border-[#C9A24B]/20 px-2.5 py-0.5 rounded-full">
                    {eligibleResults.length} योजनाएं योग्य
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-[#0B1E33]/50 mt-0.5">
                  {user?.name || 'उद्यमी'} • आपके पंजीकृत व्यापार प्रोफाइल के आधार पर सरकारी योजनाओं का संपूर्ण मिलान
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href={`/dashboard${userId ? `?user_id=${userId}` : ''}`}
              className="px-4 py-2 bg-white hover:bg-[#F5F1E6] text-[#0B1E33] text-xs font-semibold rounded-full border border-[#C9A24B]/20 shadow-xs transition-all"
            >
              ← मुख्य डैशबोर्ड (Dashboard)
            </Link>
          </div>
        </header>

        <main className="space-y-6">
          {/* Notification Toast */}
          {notification && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-xs sm:text-sm text-emerald-900 font-bold flex items-center justify-between shadow-sm animate-in fade-in">
              <span>{notification}</span>
              <button
                onClick={() => setNotification(null)}
                className="text-emerald-700 hover:text-emerald-950 text-xs underline cursor-pointer"
              >
                हटाएं
              </button>
            </div>
          )}

          {/* ── 1. Current Business Profile Data Card (Anchoring Banner) ── */}
          <section className="bg-white/95 border border-[#C9A24B]/20 rounded-[32px] p-5 sm:p-6 shadow-[0_16px_40px_rgba(11,30,51,0.07)] backdrop-blur-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#C9A24B]/20 pb-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#0B1E33] flex items-center gap-2">
                  📋 आपका पंजीकृत व्यापार प्रोफाइल (Active Matching Profile)
                </h2>
                <p className="text-xs text-[#0B1E33]/50 mt-0.5">
                  सभी योजनाओं की पात्रता नीचे दिए गए आपके वास्तविक आंकड़ों पर आधारित है।
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/onboarding"
                  className="px-4 py-2 bg-[#F5F1E6] hover:bg-[#EDE9DA] text-[#0B1E33] text-xs font-semibold rounded-full border border-[#C9A24B]/20 transition-all"
                >
                  ✏️ विवरण बदलें (Update Details)
                </Link>

                <button
                  type="button"
                  onClick={handleRecheck}
                  disabled={isRechecking || isLoading}
                  className="px-5 py-2 bg-gradient-to-r bg-[#C9A24B] hover:opacity-95 text-white text-xs font-bold rounded-full shadow-xs active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>{isRechecking ? '⏳' : '🔄'}</span>
                  <span>{isRechecking ? 'जांच रहे हैं...' : 'पात्रता पुनः जांचें'}</span>
                </button>
              </div>
            </div>

            {/* Profile Snapshot Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-[#F5F1E6] p-3.5 rounded-2xl border border-[#C9A24B]/20">
                <span className="text-[#0B1E33]/50 block text-[11px]">व्यवसाय / Sector:</span>
                <strong className="text-[#0B1E33] text-sm capitalize">{profile?.sector || 'General'}</strong>
              </div>

              <div className="bg-[#F5F1E6] p-3.5 rounded-2xl border border-[#C9A24B]/20">
                <span className="text-[#0B1E33]/50 block text-[11px]">मासिक कमाई / Revenue:</span>
                <strong className="text-[#0B1E33] text-sm">
                  ₹{profile?.monthly_revenue_est ? Number(profile.monthly_revenue_est).toLocaleString('en-IN') : '—'}
                </strong>
              </div>

              <div className="bg-[#F5F1E6] p-3.5 rounded-2xl border border-[#C9A24B]/20">
                <span className="text-[#0B1E33]/50 block text-[11px]">मासिक खर्च / Expense:</span>
                <strong className="text-[#C9A24B] text-sm">
                  ₹{profile?.monthly_expense_est ? Number(profile.monthly_expense_est).toLocaleString('en-IN') : '—'}
                </strong>
              </div>

              <div className="bg-[#F5F1E6] p-3.5 rounded-2xl border border-[#C9A24B]/20">
                <span className="text-[#0B1E33]/50 block text-[11px]">सक्रिय ऋण / Loans:</span>
                <strong className={profile?.existing_loans ? 'text-[#C9A24B]' : 'text-emerald-700'}>
                  {profile?.existing_loans ? 'हाँ (Active Loan)' : 'कोई लोन नहीं'}
                </strong>
              </div>

              <div className="bg-[#F5F1E6] p-3.5 rounded-2xl border border-[#C9A24B]/20">
                <span className="text-[#0B1E33]/50 block text-[11px]">स्थान (जिला / राज्य):</span>
                <strong className="text-[#0B1E33]">{profile?.state || 'India'}</strong>
              </div>

              <div className="bg-[#F5F1E6] p-3.5 rounded-2xl border border-[#C9A24B]/20">
                <span className="text-[#0B1E33]/50 block text-[11px]">वर्ग / Category:</span>
                <strong className="text-[#0B1E33] uppercase">{profile?.category || 'General'}</strong>
              </div>

              <div className="bg-[#F5F1E6] p-3.5 rounded-2xl border border-[#C9A24B]/20">
                <span className="text-[#0B1E33]/50 block text-[11px]">लिंग / Gender:</span>
                <strong className="text-[#0B1E33] capitalize">{profile?.gender || 'Any'}</strong>
              </div>

              <div className="bg-[#F5F1E6] p-3.5 rounded-2xl border border-[#C9A24B]/20">
                <span className="text-[#0B1E33]/50 block text-[11px]">वार्षिक टर्नओवर (Est):</span>
                <strong className="text-[#0B1E33]">
                  ₹{profile?.monthly_revenue_est ? (Number(profile.monthly_revenue_est) * 12).toLocaleString('en-IN') : '—'}
                </strong>
              </div>
            </div>
          </section>

          {/* ── 2. Ranked Eligible Schemes Section ────────────────────── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-[#0B1E33] flex items-center gap-2">
                ⭐ योग्य सरकारी योजनाएं / Matched Eligible Schemes
              </h3>
              <span className="text-xs text-[#0B1E33]/50">
                {eligibleResults.length} योजनाएं आपके लिए उपयुक्त हैं
              </span>
            </div>

            {isLoading ? (
              <div className="text-center py-12 text-[#0B1E33] bg-white rounded-2xl border border-[#C9A24B]/20">
                <span className="text-2xl block mb-2 animate-spin">⏳</span>
                <p className="text-sm font-semibold">सरकारी योजनाओं का मिलान हो रहा है...</p>
              </div>
            ) : eligibleResults.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-[#C9A24B]/20 space-y-2">
                <span className="text-3xl">ℹ️</span>
                <h4 className="text-base font-bold text-[#0B1E33]">वर्तमान प्रोफाइल के अनुसार कोई सीधी योजना नहीं मिली।</h4>
                <p className="text-xs text-[#0B1E33]/50 max-w-md mx-auto">
                  कृपया &quot;विवरण बदलें&quot; पर क्लिक करके अपनी श्रेणी, वार्षिक कमाई या क्षेत्र की जानकारी अपडेट करें।
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {eligibleResults.map((item, idx) => {
                  const details = getSchemeDetails(item.scheme.name);
                  const rank = idx + 1;

                  return (
                    <div
                      key={item.scheme.id || idx}
                      className="bg-white/95 border border-[#C9A24B]/20 hover:border-[#151515] rounded-[32px] p-5 sm:p-7 shadow-[0_16px_40px_rgba(11,30,51,0.07)] transition-all space-y-4 relative overflow-hidden"
                    >
                      {/* Rank Badge */}
                      <div className="absolute top-0 right-0 bg-gradient-to-l bg-[#C9A24B] text-white font-bold text-xs px-4 py-1.5 rounded-bl-2xl shadow-xs flex items-center gap-1">
                        <span>#Rank {rank}</span>
                        <span>• योग्य (Eligible)</span>
                      </div>

                      {/* Scheme Header */}
                      <div className="space-y-1 pt-1">
                        <span className="text-xs font-semibold text-[#0B1E33]/50">
                          {details.sponsoringBody}
                        </span>
                        <h4 className="text-lg sm:text-xl font-bold text-[#0B1E33] leading-tight">
                          {item.scheme.name}
                        </h4>
                        {item.scheme.description && (
                          <p className="text-xs text-[#0B1E33]/60 leading-relaxed">
                            {item.scheme.description}
                          </p>
                        )}
                      </div>

                      {/* Benefit Highlight Box */}
                      {item.scheme.benefit_summary && (
                        <div className="p-4 rounded-2xl bg-[#FFF8F0] border border-[#FFE8D6] flex items-start gap-3 shadow-xs">
                          <span className="text-2xl shrink-0">💰</span>
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#A64200] block">
                              योजना का मुख्य लाभ (Financial Benefit):
                            </span>
                            <p className="text-sm font-bold text-[#803100] mt-0.5">
                              {item.scheme.benefit_summary}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Matched Reasons List */}
                      <div className="space-y-2 bg-[#F5F1E6] p-4 rounded-2xl border border-[#C9A24B]/20">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#0B1E33] block">
                          सटीक पात्रता के कारण (Why You Qualify):
                        </span>
                        <div className="space-y-1">
                          {item.reasons.map((reason, rIdx) => (
                            <div key={rIdx} className="flex items-start gap-2 text-xs text-[#0B1E33]">
                              <span className="text-emerald-700 font-bold shrink-0">✓</span>
                              <span>{reason.replace(/^✓\s*/, '')}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Required Documents Checklist */}
                      <div className="space-y-2 bg-[#F5F1E6] p-4 rounded-2xl border border-[#C9A24B]/20">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#0B1E33] flex items-center justify-between">
                          <span>आवश्यक दस्तावेज चेकलिस्ट (Required Documents):</span>
                          <span className="text-[10px] text-[#0B1E33]/50 font-normal">
                            तैयार दस्तावेजों पर टिक करें
                          </span>
                        </span>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {details.requiredDocuments.map((docName, docIdx) => {
                            const docKey = `${item.scheme.id}-${docIdx}`;
                            const isChecked = !!checkedDocs[docKey];

                            return (
                              <label
                                key={docIdx}
                                className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                                  isChecked
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                    : 'bg-white border-[#C9A24B]/20 text-[#0B1E33] hover:border-[#151515]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleDocCheck(docKey)}
                                  className="w-4 h-4 rounded text-[#0B1E33] focus:ring-[#151515]/20 border-[#C9A24B]/20 bg-white"
                                />
                                <span className={isChecked ? 'line-through text-emerald-800 font-medium' : ''}>
                                  {docName}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Official Portal Application Link */}
                      {item.scheme.application_link && (
                        <div className="pt-2 flex items-center justify-end">
                          <a
                            href={item.scheme.application_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#0B1E33] hover:bg-[#162D59] text-white font-bold text-xs sm:text-sm shadow-xs active:scale-95 transition-all"
                          >
                            <span>आधिकारिक पोर्टल पर आवेदन करें (Apply on Official Portal)</span>
                            <span>→</span>
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── 3. Explainability Section: Ineligible Schemes (Collapsible) ── */}
          <section className="bg-white/95 border border-[#C9A24B]/20 rounded-[32px] p-5 sm:p-6 shadow-[0_16px_40px_rgba(11,30,51,0.07)] space-y-4">
            <button
              type="button"
              onClick={() => setShowIneligible((prev) => !prev)}
              className="w-full flex items-center justify-between text-left group cursor-pointer"
            >
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#0B1E33] flex items-center gap-2">
                  <span>ℹ️ अन्य सरकारी योजनाएं (Ineligible Schemes — Explainability Log)</span>
                  <span className="text-xs bg-[#F5F1E6] text-[#0B1E33]/60 px-2.5 py-0.5 rounded-full border border-[#C9A24B]/20 font-normal">
                    {ineligibleResults.length} योजनाएं
                  </span>
                </h3>
                <p className="text-xs text-[#0B1E33]/50 mt-0.5">
                  पारदर्शिता हेतु: वे योजनाएं जिनमें आपका प्रोफाइल वर्तमान में क्यों मेल नहीं खाया।
                </p>
              </div>

              <span className="text-[#0B1E33]/50 group-hover:text-[#0B1E33] text-xl font-bold p-2 transition-transform duration-200">
                {showIneligible ? '▲' : '▼'}
              </span>
            </button>

            {showIneligible && (
              <div className="space-y-4 pt-3 border-t border-[#C9A24B]/20 animate-in fade-in duration-200">
                {ineligibleResults.map((item, idx) => {
                  const details = getSchemeDetails(item.scheme.name);

                  return (
                    <div
                      key={item.scheme.id || idx}
                      className="bg-[#F5F1E6] border border-[#C9A24B]/20 rounded-2xl p-4 sm:p-5 space-y-2 opacity-90 hover:opacity-100 transition-opacity"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div>
                          <span className="text-[11px] text-[#0B1E33]/50">{details.sponsoringBody}</span>
                          <h4 className="text-base font-bold text-[#0B1E33]">{item.scheme.name}</h4>
                        </div>
                        <span className="text-xs bg-rose-50 border border-rose-200 text-rose-800 font-bold px-2.5 py-1 rounded-full w-fit">
                          वर्तमान में अपात्र (Not Eligible)
                        </span>
                      </div>

                      {item.scheme.benefit_summary && (
                        <p className="text-xs text-[#0B1E33]/60">
                          लाभ: {item.scheme.benefit_summary}
                        </p>
                      )}

                      {/* Explicit Ineligibility Reasons */}
                      <div className="bg-white p-3.5 rounded-xl border border-[#C9A24B]/20 space-y-1 mt-2">
                        <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">
                          अपात्रता का कारण (Reason Not Matched):
                        </span>
                        {item.reasons.map((r, rIdx) => (
                          <p
                            key={rIdx}
                            className={`text-xs ${
                              r.startsWith('✗') ? 'text-rose-800 font-medium' : 'text-[#0B1E33]/60'
                            }`}
                          >
                            {r}
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

export default function YojanaKendraPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F5F1E6] flex items-center justify-center text-[#0B1E33]">
          <div className="text-center space-y-2">
            <span className="text-3xl animate-spin block">🏛️</span>
            <p className="text-sm font-bold text-[#0B1E33]">योजना केंद्र लोड हो रहा है...</p>
          </div>
        </div>
      }
    >
      <YojanaKendraContent />
    </Suspense>
  );
}

