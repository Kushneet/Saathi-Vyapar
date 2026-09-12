/**
 * src/app/api/plan/generate/route.ts
 * POST /api/plan/generate
 *
 * Generates a complete financial plan for an entrepreneur:
 * 1. Validates request body (user_id)
 * 2. Fetches business profile from Supabase
 * 3. Computes financial metrics (break-even, margin, risk)
 * 4. Matches eligible government schemes
 * 5. Uses Groq LLM to rephrase explanation in user's language
 * 6. Saves plan to financial_plans table
 * 7. Returns the full plan as JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { generateText } from '@/lib/llm/provider';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';
import { generateFinancialSummary } from '@/lib/engines/financialEngine';
import { matchSchemes, SchemeRecord, BusinessProfile } from '@/lib/engines/schemeMatcher';

// ── Request validation schema ─────────────────────────────────────────────────
// `user_id` is optional and no longer authoritative: the caller's identity
// comes from the session cookie. Supplying it only means "act on this
// entrepreneur's behalf", which is honoured for linked facilitators.
const GeneratePlanSchema = z.object({
  user_id: z.string().uuid('user_id must be a valid UUID').optional(),
});

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

export async function POST(request: NextRequest) {
  try {
    // ── 0. Authenticate ────────────────────────────────────────────────────
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    // ── 1. Parse & validate request body ───────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const parsed = GeneratePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user_id = await resolveTargetUserId(auth.user, parsed.data.user_id);
    if (!user_id) return forbidden();

    // ── 2. Fetch user (for language preference) ────────────────────────────
    const { data: user, error: userError } = await supabaseServer
      .from('users')
      .select('id, language, name')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
      return NextResponse.json(
        { error: 'Business profile not found. Please complete onboarding first.' },
        { status: 404 }
      );
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
    }));

    const businessProfile: BusinessProfile = {
      monthly_revenue_est: Number(profile.monthly_revenue_est) || 0,
      monthly_expense_est: Number(profile.monthly_expense_est) || 0,
      existing_loans: Boolean(profile.existing_loans),
      category: profile.category,
      sector: profile.sector,
      gender: profile.gender,
      state: profile.state,
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

    let llmSummaryText = financialSummary.explanation; // deterministic fallback

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
      return NextResponse.json(
        { error: 'Failed to save financial plan', details: planSaveError.message },
        { status: 500 }
      );
    }

    // ── 8. Return the full plan ────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      plan: {
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
      },
    });
  } catch (error) {
    console.error('Plan generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
