/**
 * src/app/api/onboarding/complete/route.ts
 * POST /api/onboarding/complete
 *
 * Saves onboarding data to users and business_profiles,
 * ensures DPDP Act consent is verified before storage,
 * computes deterministic financial analytics & scheme matching,
 * and generates the initial financial plan.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';
import { generateFinancialSummary } from '@/lib/engines/financialEngine';
import { matchSchemes, SchemeRecord, BusinessProfile } from '@/lib/engines/schemeMatcher';

const OnboardingCompleteSchema = z.object({
  user_id: z.string().uuid().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  district: z.string().optional(),
  state: z.string().optional(),
  sector: z.string().min(1, 'Sector is required'),
  business_name: z.string().optional(),
  monthly_revenue_est: z.number().min(0, 'Monthly revenue must be positive'),
  monthly_expense_est: z.number().min(0, 'Monthly expense must be positive'),
  existing_loans: z.boolean().default(false),
  category: z.string().optional(),
  gender: z.string().optional(),
  consent_given: z.boolean().refine((val) => val === true, {
    message: 'Explicit DPDP Act consent is required before saving your information.',
  }),
});

export async function POST(request: NextRequest) {
  try {
    // Onboarding always runs after sign-in (the wizard signs the user up
    // first), so the profile owner is the session user — never a body field.
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = OnboardingCompleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // ── 1. Resolve the owning user ─────────────────────────────────────────
    // Previously this route would create a brand-new user for an anonymous
    // caller, inventing a random +91 phone number when none was supplied.
    // Those rows were unreachable by their supposed owner and could later
    // collide with the real holder of that number against UNIQUE(phone).
    const userId = await resolveTargetUserId(auth.user, data.user_id);
    if (!userId) return forbidden();

    // public.users may not have a row yet — auth.users does, but this table is
    // only ever populated here or by the dashboard's first-visit upsert, and
    // business_profiles has an FK to it.
    const normalizedPhone = data.phone?.replace(/[^\d+]/g, '') || undefined;

    const { error: userUpsertError } = await supabaseServer.from('users').upsert(
      {
        id: userId,
        name: data.name,
        phone: normalizedPhone,
        email: data.email || auth.user.email || undefined,
        language: 'hi',
        role: 'entrepreneur',
      },
      { onConflict: 'id' }
    );

    if (userUpsertError) {
      console.error('User upsert failed:', userUpsertError);
      return NextResponse.json(
        { error: 'Failed to save user account', details: userUpsertError.message },
        { status: 500 }
      );
    }

    // ── 2. Upsert Business Profile ─────────────────────────────────────────
    // business_profiles.user_id has no UNIQUE/exclusion constraint in any
    // migration, so `.upsert(..., { onConflict: 'user_id' })` fails every time
    // with "there is no unique or exclusion constraint matching the ON
    // CONFLICT specification" — surfaced to users as "Failed to save business
    // profile". Look the row up first and insert or update explicitly instead
    // of relying on a DB constraint that doesn't exist.
    const profilePayload = {
      business_name: data.business_name || data.sector,
      sector: data.sector,
      district: data.district || 'General',
      state: data.state || 'India',
      monthly_revenue_est: data.monthly_revenue_est,
      monthly_expense_est: data.monthly_expense_est,
      existing_loans: data.existing_loans,
      category: data.category || 'general',
      gender: data.gender || 'other',
      updated_at: new Date().toISOString(),
    };

    const { data: existingProfile } = await supabaseServer
      .from('business_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    const { error: profileError } = existingProfile
      ? await supabaseServer
          .from('business_profiles')
          .update(profilePayload)
          .eq('user_id', userId)
      : await supabaseServer
          .from('business_profiles')
          .insert({ ...profilePayload, user_id: userId });

    if (profileError) {
      console.error('Profile creation failed:', profileError);
      return NextResponse.json(
        { error: 'Failed to save business profile', details: profileError.message },
        { status: 500 }
      );
    }

    // ── 3. Compute Financial Analytics & Schemes ───────────────────────────
    const financialSummary = generateFinancialSummary({
      monthlyRevenueEst: data.monthly_revenue_est,
      monthlyExpenseEst: data.monthly_expense_est,
      existingLoans: data.existing_loans,
    });

    const { data: schemesData } = await supabaseServer.from('schemes').select('*');
    const schemes: SchemeRecord[] = (schemesData || []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      benefit_summary: s.benefit_summary,
      eligibility_rules: s.eligibility_rules || {},
      application_link: s.application_link,
    }));

    const businessProfile: BusinessProfile = {
      monthly_revenue_est: data.monthly_revenue_est,
      monthly_expense_est: data.monthly_expense_est,
      existing_loans: data.existing_loans,
      category: data.category,
      sector: data.sector,
      gender: data.gender,
      state: data.state,
    };

    const matchResults = matchSchemes(businessProfile, schemes);
    const eligibleSchemes = matchResults.filter((r) => r.eligible);
    const matchedSchemeIds = eligibleSchemes.map((r) => r.scheme.id);

    const planJson = {
      financialMetrics: {
        breakEvenUnits: isFinite(financialSummary.breakEvenUnits)
          ? financialSummary.breakEvenUnits
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
        sector: data.sector,
        district: data.district,
        state: data.state,
      },
      generatedAt: new Date().toISOString(),
    };

    // Save initial plan
    await supabaseServer.from('financial_plans').insert({
      user_id: userId,
      break_even_units: isFinite(financialSummary.breakEvenUnits)
        ? financialSummary.breakEvenUnits
        : null,
      margin_percent: financialSummary.marginPercent,
      plan_json: planJson,
      matched_scheme_ids: matchedSchemeIds,
      summary_text: financialSummary.explanation,
    });

    return NextResponse.json({
      success: true,
      userId,
      message: 'Onboarding completed successfully with DPDP consent verified',
      redirectUrl: `/dashboard?user_id=${userId}`,
    });
  } catch (error) {
    console.error('Onboarding complete API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
