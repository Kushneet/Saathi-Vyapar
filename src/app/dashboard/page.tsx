/**
 * src/app/dashboard/page.tsx
 *
 * Entrepreneur Financial Dashboard
 * Optimized for high-contrast visibility on mobile screens in direct sunlight.
 * Displays:
 * - Key financial metrics (Margin %, Break-even, Cash flow risk)
 * - Plain language summary (AI generated)
 * - 30-Day Ledger SVG Line Chart (Income vs Expenses)
 * - Matched Government Schemes with eligibility criteria & application links
 * - Recent Ledger Entries
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { requirePageUser, resolveTargetUserId } from '@/lib/auth/requireUser';
import { calculateMarginPercent, assessCashFlowRisk } from '@/lib/engines/financialEngine';
import { matchSchemes, SchemeRecord } from '@/lib/engines/schemeMatcher';
import { getServerT } from '@/lib/i18n.server';
import LogoutButton from './LogoutButton';
import LanguageToggleButton from '@/components/LanguageToggleButton';
import LedgerPhotoUpload from '@/components/LedgerPhotoUpload';
import ChatPanel from '@/components/ChatPanel';

interface PageProps {
  searchParams: Promise<{ user_id?: string }>;
}

interface SchemeItem {
  schemeId: string;
  schemeName: string;
  eligible: boolean;
  reasons: string[];
  benefitSummary?: string;
  applicationLink?: string;
}

interface LedgerRow {
  id: string;
  amount: number;
  entry_type: 'income' | 'expense';
  description: string;
  source: string;
  confirmed: boolean;
  created_at: string;
}

const FALLBACK_SCHEMES: SchemeRecord[] = [
  {
    id: 'pmegp',
    name: "PMEGP - Prime Minister's Employment Generation Programme",
    description: 'Credit-linked subsidy programme for micro-enterprises in non-farm sector.',
    benefit_summary: '15% to 35% project cost subsidy (up to ₹25 Lakh loan) via KVIC & partner banks.',
    application_link: 'https://www.kviconline.gov.in/pmegpeportal/pmegphome/index.jsp',
    eligibility_rules: {
      income_max: 10000000,
      sector: ['manufacturing', 'services', 'retail', 'food_processing'],
      loan_amount_min: 100000,
      loan_amount_max: 2500000,
    },
  },
  {
    id: 'mudra-shishu',
    name: 'Mudra Shishu Loan (PMMY)',
    description: 'Collateral-free micro-loans for starting or running small village shops.',
    benefit_summary: 'Zero collateral, loans up to ₹50,000 with nominal interest rates.',
    application_link: 'https://www.mudra.org.in/',
    eligibility_rules: {
      income_max: 2500000,
      loan_amount_min: 1000,
      loan_amount_max: 50000,
    },
  },
  {
    id: 'pm-svanidhi',
    name: 'PM SVANidhi (Street Vendors Scheme)',
    description: 'Affordable working capital credit to formalize and grow small local trade.',
    benefit_summary: 'Staged loans from ₹10,000 to ₹50,000 with 7% interest subsidy cashback.',
    application_link: 'https://pmsvanidhi.mohua.gov.in/',
    eligibility_rules: {
      income_max: 1200000,
      sector: ['retail', 'services'],
      loan_amount_min: 10000,
      loan_amount_max: 50000,
    },
  },
  {
    id: 'stand-up-india',
    name: 'Stand-Up India Scheme',
    description: 'Bank loan facility facilitating enterprises led by SC, ST or Women.',
    benefit_summary: 'Greenfield project funding between ₹10 Lakh and ₹1 Crore.',
    application_link: 'https://www.standupmitra.in/',
    eligibility_rules: {
      category: ['sc', 'st'],
      gender: 'female',
      loan_amount_min: 1000000,
      loan_amount_max: 10000000,
    },
  },
  {
    id: 'mudra-kishor',
    name: 'Mudra Kishor Loan (PMMY)',
    description: 'Next-stage funding for businesses seeking scale and equipment.',
    benefit_summary: 'Collateral-free capital between ₹50,000 and ₹5 Lakh.',
    application_link: 'https://www.mudra.org.in/',
    eligibility_rules: {
      income_max: 5000000,
      loan_amount_min: 50001,
      loan_amount_max: 500000,
    },
  },
  {
    id: 'svep-nrlm',
    name: 'Start-up Village Entrepreneurship Programme (SVEP)',
    description:
      'A sub-scheme of DAY-NRLM supporting Self-Help Group (SHG) members and their family members to set up non-farm rural enterprises. Unlike a one-time cash subsidy, SVEP provides ongoing support through training, mentoring, and access to a community-managed revolving loan fund (Community Enterprise Fund). It is implemented block-by-block, not nationwide — availability depends on whether SVEP has been rolled out in the user\'s specific block.',
    benefit_summary:
      'Access to a community-managed revolving loan fund (Community Enterprise Fund) plus business training and ongoing mentoring support — not a one-time cash grant.',
    application_link: 'https://svep.nrlm.gov.in/',
    eligibility_rules: {
      requires_shg_membership: true,
      eligible_relation: ['shg_member', 'shg_member_family'],
      sector: ['non_farm', 'retail', 'tailoring', 'food_processing', 'handicraft', 'dairy_processing'],
      area_type: 'rural',
      implementation_note: 'block_specific_not_nationwide',
      priority_groups: ['women', 'youth'],
    },
  },
];

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;

  // Identity comes from the session cookie. This page previously accepted
  // `?user_id=` from anyone, then fell back to "the most recently registered
  // user in the database", then to a hard-coded demo entrepreneur — so a
  // logged-out visitor was shown a real person's finances.
  const sessionUser = await requirePageUser('/dashboard');

  // Server components can't use the client language hook, so the language
  // comes from the cookie the toggle writes. LanguageProvider calls
  // router.refresh() on switch, which re-renders this page in the new one.
  const { t } = await getServerT();

  // A `user_id` in the URL is a facilitator viewing a linked entrepreneur.
  // Anyone else asking for someone else's id is sent back to their own view.
  const targetUserId = await resolveTargetUserId(sessionUser, resolvedParams.user_id);
  if (!targetUserId) {
    redirect('/dashboard');
  }

  let user: { id: string; name: string | null; phone: string; language: string } | null = null;

  try {
    const { data: dbUser } = await supabaseServer
      .from('users')
      .select('id, name, phone, language')
      .eq('id', targetUserId)
      .maybeSingle();

    user = dbUser;
  } catch (dbErr) {
    console.warn('Dashboard user lookup warning:', dbErr);
  }

  // First visit for this account: public.users has no row yet (auth.users
  // does). Create it, but only ever for the signed-in user themselves.
  if (!user && targetUserId === sessionUser.id) {
    const fallbackName = sessionUser.email?.split('@')[0] || 'Entrepreneur';

    const { data: newUser } = await supabaseServer
      .from('users')
      .upsert(
        {
          id: sessionUser.id,
          name: fallbackName,
          email: sessionUser.email || undefined,
          language: 'hi',
          role: 'entrepreneur',
        },
        { onConflict: 'id' }
      )
      .select('id, name, phone, language')
      .maybeSingle();

    user = newUser ?? {
      id: sessionUser.id,
      name: fallbackName,
      phone: '',
      language: 'hi',
    };
  }

  // A linked entrepreneur with no row is a genuine 404 for the facilitator.
  if (!user) {
    redirect('/dashboard');
  }

  // ── 1. Fetch latest business profile ─────────────────────────────
  let profileData = null;
  try {
    const { data } = await supabaseServer
      .from('business_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    profileData = data;
  } catch (err) {
    console.warn('Dashboard profile fetch warning:', err);
  }

  // No profile means we have nothing to compute from. This used to fall back
  // to an invented business in Varanasi earning ₹45,000 against ₹28,000 of
  // costs — figures that looked like the user's own analysis, drove the
  // margin, risk and scheme-matching cards, and belonged to nobody.
  if (!profileData) {
    return (
      <div className="min-h-screen bg-[#F5F1E6] text-[#0B1E33] p-4 sm:p-6 flex items-center justify-center font-['Open_Sans',sans-serif]">
        <div className="max-w-md w-full bg-white border border-[#C9A24B]/20 rounded-[32px] p-7 shadow-[0_16px_40px_rgba(11,30,51,0.07)] space-y-4 text-center">
          <div className="text-4xl">📋</div>
          <h1 className="font-['Roboto',sans-serif] text-xl font-bold text-[#0B1E33]">
            {t('empty_profile_title')}
          </h1>
          <p className="text-sm text-[#0B1E33]/60 leading-relaxed">{t('empty_profile_sub')}</p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Link
              href="/onboarding"
              className="px-6 py-3 bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] font-bold text-xs rounded-full transition-all shadow-sm"
            >
              {t('empty_profile_cta')} →
            </Link>
            <LanguageToggleButton />
          </div>
          <div className="pt-2">
            <LogoutButton />
          </div>
        </div>

        {/* Also here, not only on the full dashboard. Someone who has not
            finished their profile is the person most likely to have a
            question, and this early return used to skip the panel entirely. */}
        <ChatPanel />
      </div>
    );
  }

  const profile = profileData;

  // ── 2. Fetch latest financial plan ───────────────────────────────
  let planData = null;
  try {
    const { data } = await supabaseServer
      .from('financial_plans')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    planData = data;
  } catch (err) {
    console.warn('Dashboard plan fetch warning:', err);
  }

  // If no stored plan, dynamically calculate using deterministic engines
  let latestPlan = planData;
  if (!latestPlan) {
    const rev = Number(profile.monthly_revenue_est) || 0;
    const exp = Number(profile.monthly_expense_est) || 0;
    const margin = calculateMarginPercent(rev, exp);
    const cashRisk = assessCashFlowRisk(rev, exp, Boolean(profile.existing_loans));

    // Match against schemes
    let dbSchemes = null;
    try {
      const { data } = await supabaseServer.from('schemes').select('*');
      dbSchemes = data;
    } catch { /* fallback */ }

    const schemesToMatch: SchemeRecord[] =
      dbSchemes && dbSchemes.length > 0 ? (dbSchemes as SchemeRecord[]) : FALLBACK_SCHEMES;

    const matched = matchSchemes(
      {
        monthly_revenue_est: rev,
        monthly_expense_est: exp,
        existing_loans: Boolean(profile.existing_loans),
        // Undefined rather than invented: an unstated social category or
        // gender must not silently qualify someone for a reserved scheme.
        sector: profile.sector || undefined,
        category: profile.category || undefined,
        gender: profile.gender || undefined,
        state: profile.state || undefined,
        shg_membership: (profile as Record<string, unknown>).shg_membership as string | boolean | undefined,
        is_shg_member: Boolean((profile as Record<string, unknown>).is_shg_member),
        shg_relation: (profile as Record<string, unknown>).shg_relation as string | undefined,
      },
      schemesToMatch
    );

    const schemeItems: SchemeItem[] = matched.map((m) => ({
      schemeId: m.scheme.id,
      schemeName: m.scheme.name,
      eligible: m.eligible,
      reasons: m.reasons,
      benefitSummary: m.scheme.benefit_summary,
      applicationLink: m.scheme.application_link,
    }));

    latestPlan = {
      id: 'dynamic-plan',
      user_id: user.id,
      margin_percent: margin,
      break_even_revenue: exp,
      summary_text: `Your net profit margin is ${margin.toFixed(1)}%. After monthly expenses (₹${exp.toLocaleString("en-IN")}), your cash flow is ${cashRisk === "low" ? "strong" : "stable"}. Explore government loan & subsidy options below.`,
      created_at: new Date().toISOString(),
      plan_json: {
        financialMetrics: {
          breakEvenRevenue: exp,
          marginPercent: margin,
          cashFlowRisk: cashRisk,
        },
        matchedSchemes: schemeItems,
      },
    };
  }

  // ── 3. Fetch last 30 days of ledger entries ──────────────────────
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let ledgerEntriesRaw = null;
  try {
    const { data } = await supabaseServer
      .from('ledger_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });
    ledgerEntriesRaw = data;
  } catch (err) {
    console.warn('Dashboard ledger fetch warning:', err);
  }

  // Previously four invented transactions ("Daily Sales", "Stock Purchase" …)
  // stood in whenever the ledger was empty, and they were indistinguishable
  // from real ones. An empty ledger now reads as empty.
  const rawEntries = ledgerEntriesRaw || [];

  const ledgerEntries: LedgerRow[] = rawEntries.map((e) => ({
    id: e.id,
    amount: Number(e.amount),
    entry_type: e.entry_type as 'income' | 'expense',
    description: e.description || 'General Entry',
    source: e.source || 'manual',
    confirmed: Boolean(e.confirmed),
    created_at: e.created_at,
  }));

  // Aggregate totals
  const totalIncome = ledgerEntries
    .filter((e) => e.entry_type === 'income')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalExpense = ledgerEntries
    .filter((e) => e.entry_type === 'expense')
    .reduce((sum, e) => sum + e.amount, 0);

  // Parse plan schemes
  const planJson = latestPlan?.plan_json as {
    financialMetrics?: {
      breakEvenRevenue?: number | null;
      marginPercent?: number;
      cashFlowRisk?: 'low' | 'medium' | 'high';
    };
    matchedSchemes?: SchemeItem[];
  } | null;

  const matchedSchemes: SchemeItem[] = planJson?.matchedSchemes || [];

  // Monthly sales needed to cover costs. Prefer the stored plan value; fall
  // back to current expenses, which is the same quantity the engine computes.
  // `break_even_units` is deliberately not consulted: it held a ratio.
  // Net profit in rupees — the figure the deck calls the "profit picture".
  const netProfit =
    (Number(profile.monthly_revenue_est) || 0) - (Number(profile.monthly_expense_est) || 0);

  const storedBreakEven = Number(latestPlan?.break_even_revenue);
  const breakEvenRevenue = isFinite(storedBreakEven) && storedBreakEven > 0
    ? storedBreakEven
    : Number(profile.monthly_expense_est) || null;
  const eligibleCount = matchedSchemes.filter((s) => s.eligible).length;

  // ── Chart series, computed from the ledger ───────────────────────
  // The SVG below used to draw two hard-coded polylines: the same rising
  // "trend" for every user, on every visit, whatever their transactions said.
  // These are the real daily totals for the last 30 days.
  const CHART_BUCKETS = 15; // one point per two days across the window

  const buckets = Array.from({ length: CHART_BUCKETS }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (CHART_BUCKETS - 1 - i) * 2);
    date.setHours(0, 0, 0, 0);
    return { date, income: 0, expense: 0 };
  });

  // Bucket relative to the window's own start rather than a fresh clock read,
  // so this stays a pure function of `buckets` and the entries.
  const windowStart = buckets[0].date.getTime();
  const bucketSpanMs = 2 * 86400000;

  for (const entry of ledgerEntries) {
    const index = Math.floor(
      (new Date(entry.created_at).getTime() - windowStart) / bucketSpanMs
    );
    if (index < 0 || index >= CHART_BUCKETS) continue;

    if (entry.entry_type === 'income') buckets[index].income += entry.amount;
    else buckets[index].expense += entry.amount;
  }

  const days = buckets.map((b) =>
    b.date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
  );

  // Scale to the SVG's 0–500 × 20–120 plot area, with a floor so a single
  // small transaction does not stretch to fill the whole chart.
  const peak = Math.max(1000, ...buckets.map((b) => Math.max(b.income, b.expense)));

  function toPoints(series: 'income' | 'expense'): string {
    return buckets
      .map((bucket, i) => {
        const x = 40 + (i * 420) / (CHART_BUCKETS - 1);
        const y = 120 - (bucket[series] / peak) * 100;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  const incomePoints = toPoints('income');
  const expensePoints = toPoints('expense');
  const lastBucket = buckets[CHART_BUCKETS - 1];
  const hasLedgerData = ledgerEntries.length > 0;

  // Risk styling helper
  const risk = planJson?.financialMetrics?.cashFlowRisk || 'low';
  const riskConfig = {
    low: { bg: 'bg-white/95', border: 'border-emerald-200', text: 'text-emerald-700', label: t('common_risk_low') },
    medium: { bg: 'bg-white/95', border: 'border-amber-200', text: 'text-amber-700', label: t('common_risk_medium') },
    high: { bg: 'bg-white/95', border: 'border-rose-200', text: 'text-rose-700', label: t('common_risk_high') },
  }[risk];

  return (
    <div className="min-h-screen bg-[#F5F1E6] text-[#0B1E33] p-3 sm:p-6 pb-24 font-['Open_Sans',sans-serif] relative overflow-hidden">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(201,162,75,0.07),transparent_70%)] blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[radial-gradient(circle_at_center,rgba(11,30,51,0.04),transparent_70%)] blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto space-y-6">
        {/* ── Top Header ────────────────────────────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#C9A24B]/20 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Link href="/" className="hover:opacity-80 transition-opacity">
                <img src="/Logo.png" alt="Saathi Vyapar Logo" className="h-10 sm:h-12 w-auto object-contain" />
              </Link>
            </div>
            <p className="text-[#0B1E33]/50 text-sm mt-0.5">
              {user.name || 'Entrepreneur'} • {user.phone} {profile?.sector ? `(${profile.sector})` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LanguageToggleButton />
            <Link
              href={`/dashboard/schemes?user_id=${user.id}`}
              className="px-4 py-2 bg-white hover:bg-[#F5F1E6] text-[#0B1E33] text-xs font-semibold rounded-full border border-[#C9A24B]/30 transition-all"
            >
              🏛️ {t('dashboard_yojana')}
            </Link>
            <Link
              href={`/dashboard/business-guide?user_id=${user.id}`}
              className="px-4 py-2 bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] text-xs font-bold rounded-full shadow-sm transition-all"
            >
              🧭 {t('dashboard_business_guide')}
            </Link>
            <Link
              href={`/dashboard/khata-mitr?user_id=${user.id}`}
              className="px-4 py-2 bg-[#C9A24B] hover:bg-[#B8912A] text-white text-xs font-bold rounded-full shadow-sm transition-all"
            >
              🎙️ Khata Mitra
            </Link>
            <Link
              href="/facilitator"
              className="px-4 py-2 bg-white hover:bg-[#F5F1E6] text-[#0B1E33] text-xs font-semibold rounded-full border border-[#C9A24B]/30 transition-colors"
            >
              {t('dashboard_facilitator')}
            </Link>
            <LogoutButton />
          </div>
        </header>

        <main className="space-y-6">
          {/* ── Plain Language AI Advisory Banner ─────────────────────── */}
          <section className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-5 sm:p-6 shadow-[0_16px_40px_rgba(11,30,51,0.07)] relative overflow-hidden">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-[#F5F1E6] border border-[#C9A24B]/20 rounded-2xl text-2xl shrink-0">
                💡
              </div>
              <div className="space-y-1.5 flex-1">
                <h2 className="text-xs sm:text-sm font-bold text-[#C9A24B] uppercase tracking-wider">
                  {t('dashboard_advisory_label')}
                </h2>
                <p className="text-[#0B1E33] text-base sm:text-lg leading-relaxed font-semibold">
                  {latestPlan?.summary_text ||
                    'Your financial analysis is ready. View your profit margins and government schemes below.'}
                </p>
                {latestPlan?.created_at && (
                  <p className="text-xs text-[#0B1E33]/50 pt-1">
                    Updated: {new Date(latestPlan.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </p>
                )}
                <div className="pt-2">
                  <Link
                    href={`/dashboard/business-guide?user_id=${user.id}`}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#C9A24B] hover:bg-[#B8912A] text-white font-bold text-xs rounded-full transition-all shadow-sm"
                  >
                    <span>🧭 Build 5-Stage Business Roadmap</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* ── Key Metrics Cards (High Contrast Grid) ───────────────── */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1: Profit Margin */}
            <div className="bg-white border border-[#C9A24B]/20 rounded-2xl p-5 shadow-[0_8px_24px_rgba(11,30,51,0.05)] flex flex-col justify-between">
              <span className="text-[#0B1E33]/60 text-sm font-bold">
                {t('dashboard_profit')}
              </span>
              <div className="my-2">
                {/* Rupees first: a shopkeeper checks what is left at month end,
                    not a percentage. The margin stays visible underneath. */}
                <span className={`text-4xl font-bold ${netProfit >= 0 ? 'text-[#0B1E33]' : 'text-rose-600'}`}>
                  {netProfit >= 0
                    ? `₹${netProfit.toLocaleString('en-IN')}`
                    : `−₹${Math.abs(netProfit).toLocaleString('en-IN')}`}
                </span>
                <span className="block text-xs font-semibold text-[#0B1E33]/60 mt-1">
                  {t('dashboard_profit_margin_note', {
                    margin: Number(latestPlan?.margin_percent ?? 0).toFixed(1),
                  })}
                </span>
              </div>
              <p className="text-xs text-[#0B1E33]/50">
                {netProfit >= 0 ? t('dashboard_profit_ok') : t('dashboard_profit_loss')}
              </p>
              <p className="text-[11px] text-[#0B1E33]/45 leading-snug mt-2 pt-2 border-t border-[#C9A24B]/15">{t('help_profit')}</p>
            </div>

            {/* Card 2: Break-even target */}
            <div className="bg-white border border-[#C9A24B]/20 rounded-2xl p-5 shadow-[0_8px_24px_rgba(11,30,51,0.05)] flex flex-col justify-between">
              <span className="text-[#0B1E33]/60 text-sm font-bold">
                {t('dashboard_break_even')}
              </span>
              <div className="my-2">
                <span className="text-3xl sm:text-4xl font-bold text-[#0B1E33]">
                  {breakEvenRevenue !== null ? `₹${breakEvenRevenue.toLocaleString('en-IN')}` : '—'}
                </span>
              </div>
              <p className="text-xs text-[#0B1E33]/50">{t('dashboard_break_even_sub')}</p>
              <p className="text-[11px] text-[#0B1E33]/45 leading-snug mt-2 pt-2 border-t border-[#C9A24B]/15">{t('help_break_even')}</p>
            </div>

            {/* Card 3: Cash Flow Risk */}
            <div className={`${riskConfig.bg} border ${riskConfig.border} rounded-2xl p-5 shadow-[0_8px_24px_rgba(27,27,27,0.04)] flex flex-col justify-between`}>
              <span className="text-[#0B1E33]/60 text-sm font-bold">
                {t('dashboard_cash_risk')}
              </span>
              <div className="my-2">
                <span className={`text-2xl sm:text-3xl font-extrabold ${riskConfig.text}`}>
                  {riskConfig.label}
                </span>
              </div>
              <p className="text-xs text-[#0B1E33]/50">
                {profile?.existing_loans
                  ? [
                      t('dashboard_loan_active'),
                      Number(profile.loan_amount) > 0 ? `₹${Number(profile.loan_amount).toLocaleString('en-IN')}` : null,
                      Number(profile.loan_monthly_payment) > 0
                        ? `₹${Number(profile.loan_monthly_payment).toLocaleString('en-IN')}${t('per_month_short')}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : t('dashboard_no_loan')}
              </p>
              <p className="text-[11px] text-[#0B1E33]/45 leading-snug mt-2 pt-2 border-t border-[#C9A24B]/15">{t('help_risk')}</p>
            </div>
          </section>

          {/* ── 30-Day Ledger Trend Chart ─────────────────────────────── */}
          <section className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-5 sm:p-6 shadow-[0_16px_40px_rgba(11,30,51,0.07)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-['Roboto',sans-serif] text-lg font-bold text-[#0B1E33] flex items-center gap-2">
                  📊 {t('dashboard_chart_title')}
                </h3>
                <p className="text-xs text-[#0B1E33]/50">{t('dashboard_chart_sub')}</p>
                <p className="text-[11px] text-[#0B1E33]/45 mt-1">{t('help_chart')}</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#151515] inline-block"></span>
                  <span className="text-[#0B1E33]">{t('dashboard_income_label')}: ₹{totalIncome.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#FF416C] inline-block"></span>
                  <span className="text-[#C9A24B]">{t('dashboard_expense_label')}: ₹{totalExpense.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Visual SVG Line Chart — plotted from real ledger entries */}
            {hasLedgerData ? (
              <div className="w-full bg-[#F5F1E6] rounded-2xl p-4 border border-[#C9A24B]/15">
                <svg
                  viewBox="0 0 500 160"
                  className="w-full h-40 overflow-visible"
                  role="img"
                  aria-label={`${t('dashboard_chart_title')}: ${t('dashboard_income_label')} ₹${totalIncome.toLocaleString('en-IN')}, ${t('dashboard_expense_label')} ₹${totalExpense.toLocaleString('en-IN')}`}
                >
                  {/* Grid lines */}
                  <line x1="40" y1="20" x2="480" y2="20" stroke="#C9A24B" strokeOpacity="0.2" strokeDasharray="3 3" />
                  <line x1="40" y1="70" x2="480" y2="70" stroke="#C9A24B" strokeOpacity="0.2" strokeDasharray="3 3" />
                  <line x1="40" y1="120" x2="480" y2="120" stroke="#C9A24B" strokeOpacity="0.2" strokeDasharray="3 3" />

                  {/* Income */}
                  <polyline fill="none" stroke="#0B1E33" strokeWidth="3.5" points={incomePoints} />

                  {/* Expenses */}
                  <polyline fill="none" stroke="#C9A24B" strokeWidth="3.5" points={expensePoints} />

                  {/* Latest data points */}
                  <circle cx="460" cy={120 - (lastBucket.income / peak) * 100} r="5" fill="#0B1E33" />
                  <circle cx="460" cy={120 - (lastBucket.expense / peak) * 100} r="5" fill="#C9A24B" />
                </svg>
                <div className="flex justify-between text-[10px] text-[#0B1E33]/40 mt-2 px-2">
                  {days.filter((_, i) => i % 2 === 0).map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="w-full bg-[#F5F1E6] rounded-2xl p-6 border border-[#C9A24B]/15 text-sm text-[#0B1E33]/55 text-center">
                {t('empty_chart')}
              </p>
            )}
          </section>

          {/* ── Matched Government Schemes ───────────────────────────── */}
          <section className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-5 sm:p-6 shadow-[0_16px_40px_rgba(11,30,51,0.07)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-['Roboto',sans-serif] text-lg font-bold text-[#0B1E33] flex items-center gap-2">
                  🏛️ {t('dashboard_schemes_title')}
                </h3>
                <p className="text-xs text-[#0B1E33]/50">
                  {eligibleCount} {t('dashboard_schemes_sub')}
                </p>
                <p className="text-[11px] text-[#0B1E33]/45 mt-1 max-w-md">{t('help_schemes')}</p>
              </div>
              <span className="px-3 py-1 bg-[#F0EFEB] border border-[#E5E2E1] text-[#0B1E33] text-xs font-bold rounded-full">
                {eligibleCount} {t('dashboard_eligible')}
              </span>
            </div>

            <div className="space-y-3">
              {matchedSchemes.length === 0 ? (
                <p className="text-sm text-[#8C8880]">No scheme data available.</p>
              ) : (
                matchedSchemes.slice(0, 6).map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border transition-all ${
                      item.eligible
                        ? 'bg-white border-[#C9A24B]/20'
                        : 'bg-[#F5F1E6] border-[#C9A24B]/10 opacity-75'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{item.eligible ? '✅' : 'ℹ️'}</span>
                          <h4 className="text-base font-bold text-[#0B1E33]">{item.schemeName}</h4>
                        </div>
                        {item.benefitSummary && (
                          <p className="text-xs text-[#0B1E33]/50 font-medium">
                            {item.benefitSummary}
                          </p>
                        )}
                      </div>
                      {item.applicationLink && (
                        <a
                          href={item.applicationLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] text-xs font-semibold rounded-full shrink-0 text-center transition-all"
                        >
                          Apply ↗
                        </a>
                      )}
                    </div>
                    {item.reasons && item.reasons.length > 0 && (
                      <div className="mt-2 text-xs text-[#0B1E33]/50 space-y-0.5 border-t border-[#E5E2E1] pt-2">
                        {item.reasons.slice(0, 2).map((r, i) => (
                          <p key={i}>{r}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 flex justify-center">
              <Link
                href={`/dashboard/schemes?user_id=${user.id}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] font-bold text-xs sm:text-sm rounded-full transition-all shadow-sm"
              >
                <span>{t('dashboard_open_yojana')}</span>
              </Link>
            </div>
          </section>

          {/* ── Bahi-Khata Photo → Ledger ─────────────────────────────── */}
          <LedgerPhotoUpload userId={user.id === sessionUser.id ? undefined : user.id} />

          {/* ── Recent Ledger Entries ─────────────────────────────────── */}
          <section className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-5 sm:p-6 shadow-[0_16px_40px_rgba(11,30,51,0.07)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-['Roboto',sans-serif] text-lg font-bold text-[#0B1E33] flex items-center gap-2">
                📝 {t('dashboard_ledger_title')}
              </h3>
              <span className="text-xs text-[#0B1E33]/50 font-mono">
                {ledgerEntries.length} Records
              </span>
            </div>

            <div className="space-y-2">
              {ledgerEntries.length === 0 && (
                <div className="p-5 bg-[#F5F1E6] rounded-2xl border border-[#C9A24B]/15 text-center space-y-1">
                  <p className="text-sm font-bold text-[#0B1E33]">{t('empty_ledger_title')}</p>
                  <p className="text-xs text-[#0B1E33]/55">{t('empty_ledger_sub')}</p>
                </div>
              )}
              {ledgerEntries.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-3.5 bg-[#F5F1E6] rounded-2xl border border-[#C9A24B]/15"
                >
                  <div>
                    <p className="text-sm font-bold text-[#0B1E33]">{entry.description}</p>
                    <p className="text-xs text-[#0B1E33]/50">
                      {new Date(entry.created_at).toLocaleDateString('en-IN')} • {entry.source.toUpperCase()}
                    </p>
                  </div>
                  <span
                    className={`text-base font-extrabold ${
                      entry.entry_type === 'income' ? 'text-emerald-700' : 'text-[#C9A24B]'
                    }`}
                  >
                    {entry.entry_type === 'income' ? '+' : '-'}₹{entry.amount.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      {/* Asking is easier than navigating for someone who finds a dashboard
          hard to read, and every figure it quotes comes from the same engines
          these cards use. */}
      <ChatPanel userId={user.id === sessionUser.id ? undefined : user.id} />
    </div>
  );
}
