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

    // ── 1. Resolve or Create User ──────────────────────────────────────────
    let userId = data.user_id;

    if (!userId) {
      // Clean phone or generate a fallback identifier if user arrived pre-auth without phone
      let formattedPhone = data.phone?.replace(/\D/g, '');
      if (!formattedPhone || formattedPhone.length < 10) {
        // Fallback temporary registration phone
        const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000);
        formattedPhone = `+91${randomDigits}`;
      } else if (formattedPhone.length === 10) {
        formattedPhone = `+91${formattedPhone}`;
      } else if (!formattedPhone.startsWith('+')) {
        formattedPhone = `+${formattedPhone}`;
      }

      // Check if user with phone already exists
      const { data: existingUser } = await supabaseServer
        .from('users')
        .select('id')
        .eq('phone', formattedPhone)
        .single();

      if (existingUser) {
        userId = existingUser.id;
        await supabaseServer
          .from('users')
          .update({ name: data.name, language: 'hi' })
          .eq('id', userId);
      } else {
        const { data: newUser, error: userError } = await supabaseServer
          .from('users')
          .insert({
            phone: formattedPhone,
            name: data.name,
            language: 'hi',
            role: 'entrepreneur',
          })
          .select('id')
          .single();

        if (userError || !newUser) {
          console.error('User creation failed:', userError);
          return NextResponse.json(
            { error: 'Failed to create user account', details: userError?.message },
            { status: 500 }
          );
        }
        userId = newUser.id;
      }
    } else {
      // Session-authenticated user (password or Google sign-in): auth.users
      // already has a row, but public.users may not — it's only ever created
      // here or by the dashboard's own first-visit upsert. business_profiles
      // has a FK to public.users(id), so it must exist before step 2 below,
      // or the insert there fails with "Failed to save business profile".
      const { error: userUpsertError } = await supabaseServer.from('users').upsert(
        {
          id: userId,
          name: data.name,
          phone: data.phone || undefined,
          email: data.email || undefined,
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
    }

    // ── 2. Upsert Business Profile ─────────────────────────────────────────
    const { error: profileError } = await supabaseServer
      .from('business_profiles')
      .upsert(
        {
          user_id: userId,
          business_name: data.business_name || data.sector,
          sector: data.sector,
          district: data.district || 'General',
          state: data.state || 'India',
          monthly_revenue_est: data.monthly_revenue_est,
          monthly_expense_est: data.monthly_expense_est,
          existing_loans: data.existing_loans,
          category: data.category || 'general',
          // The onboarding form never collects gender; 'business_profiles.gender'
          // has CHECK (gender IN ('male','female','other')), so the previous
          // 'any' default violated that constraint and failed every submission.
          gender: data.gender || 'other',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

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
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
