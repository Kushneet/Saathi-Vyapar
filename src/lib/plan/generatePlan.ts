/**
 * src/lib/plan/generatePlan.ts
 *
 * Build and save a financial plan for one entrepreneur.
 *
 * This used to live inside POST /api/plan/generate, and the WhatsApp
 * orchestrator reached it by making an HTTP request to its own server.
 * Once that route required a session cookie, the internal request had none
 * and every "PLAN" sent over WhatsApp failed with 401. Both callers now use
 * this function directly; the route only adds request parsing and identity.
 */

import { supabaseServer } from '@/lib/supabase/server';
import { generateText } from '@/lib/llm/provider';
import { generateFinancialSummary, explainPlain } from '@/lib/engines/financialEngine';
import { matchSchemes, SchemeRecord, BusinessProfile } from '@/lib/engines/schemeMatcher';

// ── Language display names for system prompt ──────────────────────────────────
const LANGUAGE_NAMES: Record<string, string> = {
  hi: 'Hindi',
  en: 'English',
  ta: 'Tamil',
  te: 'Telugu',
  mr: 'Marathi',
  bn: 'Bengali',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Punjabi',
  or: 'Odia',
};

export class PlanError extends Error {
  constructor(
    message: string,
    /** HTTP status the route should answer with. */
    public readonly status: 404 | 500,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'PlanError';
  }
}

export interface GeneratedPlan {
  id: string;
  breakEvenRevenue: number | null;
  marginPercent: number;
  cashFlowRisk: string;
  summaryText: string;
  eligibleSchemes: Array<{
    id: string;
    name: string;
    benefitSummary?: string;
    reasons: string[];
    applicationLink?: string;
  }>;
  allSchemeResults: Array<{
    schemeId: string;
    schemeName: string;
    eligible: boolean;
    reasons: string[];
    benefitSummary?: string;
    applicationLink?: string;
  }>;
  createdAt: string;
}

export async function generatePlanForUser(user_id: string): Promise<GeneratedPlan> {
  // ── 2. Fetch user (for language preference) ────────────────────────────
  const { data: user, error: userError } = await supabaseServer
    .from('users')
    .select('id, language, name')
    .eq('id', user_id)
    .single();

  if (userError || !user) {
    throw new PlanError('User not found', 404);
  }

  // ── 3. Fetch business profile ──────────────────────────────────────────
  const { data: profile, error: profileError } = await supabaseServer
    .from('business_profiles')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (profileError || !profile) {
    throw new PlanError('Business profile not found. Please complete onboarding first.', 404);
  }

  // ── 4. Calculate financial metrics ─────────────────────────────────────
  const financialSummary = generateFinancialSummary({
    monthlyRevenueEst: Number(profile.monthly_revenue_est) || 0,
    monthlyExpenseEst: Number(profile.monthly_expense_est) || 0,
    existingLoans: Boolean(profile.existing_loans),
  });

  // ── 5. Fetch all schemes & match eligibility ───────────────────────────
  const { data: schemesData, error: schemesError } = await supabaseServer
    .from('schemes')
    .select('*');

  if (schemesError) {
    console.error('Failed to fetch schemes:', schemesError);
  }

  const schemes: SchemeRecord[] = (schemesData || []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    benefit_summary: s.benefit_summary,
    eligibility_rules: s.eligibility_rules || {},
    application_link: s.application_link,
    sponsoring_body: s.sponsoring_body,
    required_documents: s.required_documents || [],
    scheme_type: s.scheme_type ?? null,
  }));

  const businessProfile: BusinessProfile = {
    monthly_revenue_est: Number(profile.monthly_revenue_est) || 0,
    monthly_expense_est: Number(profile.monthly_expense_est) || 0,
    existing_loans: Boolean(profile.existing_loans),
    category: profile.category,
    sector: profile.sector,
    gender: profile.gender,
    state: profile.state,
    shg_membership: profile.shg_membership ?? profile.is_shg_member,
    is_shg_member: Boolean(profile.is_shg_member || profile.shg_membership === 'shg_member' || profile.shg_membership === true),
    shg_relation: profile.shg_relation,
  };

  const matchResults = matchSchemes(businessProfile, schemes);
  const eligibleSchemes = matchResults.filter((r) => r.eligible);
  const matchedSchemeIds = eligibleSchemes.map((r) => r.scheme.id);

  // ── 6. LLM phrasing via Gemini — only rephrases, NEVER changes numbers ──
  // PRIVACY / DATA-MINIMIZATION:
  // We pass ONLY:
  // - Numeric financial summary
  // - Scheme names that matched
  // We DO NOT pass: user's name, phone, exact address, or social category.
  const userLanguage = user.language || 'hi';
  const languageName = LANGUAGE_NAMES[userLanguage] || 'Hindi';

  // Deterministic fallback, in the user's own language rather than the
  // engine's English template.
  let llmSummaryText = explainPlain(financialSummary, userLanguage === 'hi' ? 'hi' : 'en', Boolean(profile.existing_loans));

  const matchedSchemeNames = eligibleSchemes
    .map((s) => s.scheme.name)
    .slice(0, 3)
    .join(', ');

  try {
    {
      const promptContent = `Here is the financial summary for a business:
- Monthly Revenue: ₹${profile.monthly_revenue_est}
- Monthly Expenses: ₹${profile.monthly_expense_est}
- Profit Margin: ${financialSummary.marginPercent}%
- Cash Flow Risk: ${financialSummary.cashFlowRisk}
- Break-Even Monthly Sales Target: ₹${isFinite(financialSummary.breakEvenRevenue) ? financialSummary.breakEvenRevenue : 'N/A'}
- Matched Schemes: ${matchedSchemeNames || 'General Microfinance Schemes'}

Please translate and summarize this into 2-3 short, encouraging sentences in ${languageName} for the entrepreneur.`;

      const text = await generateText({
        prompt: promptContent,
        temperature: 0.3,
        systemInstruction: `You are a warm, encouraging financial advisor for rural micro-entrepreneurs in India.
Your task is to phrase the provided financial summary and matched government schemes into 2-3 short plain-language sentences in ${languageName}.
STRICT RULES:
- Do NOT change any numbers (amounts in ₹, percentages, units) — keep them exactly as given.
- Never output PII or fabricate new numbers.
- Keep the response to 2-3 simple sentences.
- Return only the plain text response without markdown formatting or introductory fluff.`,
      });

      // null means no model configured, or the call failed or timed out.
      // The deterministic explanation is already in llmSummaryText.
      if (text) {
        llmSummaryText = text;
      }
    }
  } catch (llmError) {
    console.error('LLM phrasing failed, using deterministic fallback:', llmError);
  }

  // ── 7. Save plan to database ───────────────────────────────────────────
  const planJson = {
    financialMetrics: {
      breakEvenRevenue: isFinite(financialSummary.breakEvenRevenue)
        ? financialSummary.breakEvenRevenue
        : null,
      marginPercent: financialSummary.marginPercent,
      cashFlowRisk: financialSummary.cashFlowRisk,
    },
    matchedSchemes: matchResults.map((r) => ({
      schemeId: r.scheme.id,
      schemeName: r.scheme.name,
      eligible: r.eligible,
      reasons: r.reasons,
      benefitSummary: r.scheme.benefit_summary,
      applicationLink: r.scheme.application_link,
    })),
    profile: {
      sector: profile.sector,
      district: profile.district,
      state: profile.state,
      category: profile.category,
      gender: profile.gender,
    },
    generatedAt: new Date().toISOString(),
  };

  const { data: savedPlan, error: planSaveError } = await supabaseServer
    .from('financial_plans')
    .insert({
      user_id,
      break_even_revenue: isFinite(financialSummary.breakEvenRevenue)
        ? financialSummary.breakEvenRevenue
        : null,
      margin_percent: financialSummary.marginPercent,
      plan_json: planJson,
      matched_scheme_ids: matchedSchemeIds,
      summary_text: llmSummaryText,
    })
    .select()
    .single();

  if (planSaveError) {
    console.error('Failed to save plan:', planSaveError);
    throw new PlanError('Failed to save financial plan', 500, planSaveError.message);
  }

  return {
    id: savedPlan.id,
    breakEvenRevenue: isFinite(financialSummary.breakEvenRevenue)
      ? financialSummary.breakEvenRevenue
      : null,
    marginPercent: financialSummary.marginPercent,
    cashFlowRisk: financialSummary.cashFlowRisk,
    summaryText: llmSummaryText,
    eligibleSchemes: eligibleSchemes.map((r) => ({
      id: r.scheme.id,
      name: r.scheme.name,
      benefitSummary: r.scheme.benefit_summary,
      reasons: r.reasons,
      applicationLink: r.scheme.application_link,
    })),
    allSchemeResults: planJson.matchedSchemes,
    createdAt: savedPlan.created_at,
  };
}
