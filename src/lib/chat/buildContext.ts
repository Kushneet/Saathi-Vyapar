/**
 * src/lib/chat/buildContext.ts
 *
 * Gathers the entrepreneur's real figures for the assistant to answer from.
 *
 * The assistant must never state a number a language model produced. It reads
 * this object, which comes from the database and the same deterministic
 * engines the dashboard uses — so "how much did I keep this month?" is
 * answered by arithmetic, and the model is left with nothing to do but put
 * that answer into a sentence.
 */

import { supabaseServer } from '@/lib/supabase/server';
import { generateFinancialSummary, calculateNetProfit } from '@/lib/engines/financialEngine';
import { matchSchemes, type SchemeRecord } from '@/lib/engines/schemeMatcher';
import { normalizeLanguage } from '@/lib/i18n';
import type { ChatContext } from './types';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function buildChatContext(userId: string): Promise<ChatContext> {
  const [{ data: user }, { data: profile }] = await Promise.all([
    supabaseServer.from('users').select('name, language').eq('id', userId).maybeSingle(),
    supabaseServer
      .from('business_profiles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const context: ChatContext = {
    userId,
    name: user?.name ?? null,
    language: normalizeLanguage(user?.language),
    profile: null,
    finance: null,
    ledger: { last30DaysIncome: 0, last30DaysExpense: 0, entryCount: 0 },
    schemes: { eligibleCount: 0, topMatches: [], all: [] },
  };

  if (profile) {
    const revenue = Number(profile.monthly_revenue_est) || 0;
    const expense = Number(profile.monthly_expense_est) || 0;
    const loans = Boolean(profile.existing_loans);

    context.profile = {
      sector: profile.sector ?? null,
      district: profile.district ?? null,
      state: profile.state ?? null,
      monthlyRevenue: revenue,
      monthlyExpense: expense,
      existingLoans: loans,
    };

    const summary = generateFinancialSummary({
      monthlyRevenueEst: revenue,
      monthlyExpenseEst: expense,
      existingLoans: loans,
    });

    context.finance = {
      netProfit: calculateNetProfit(revenue, expense),
      marginPercent: summary.marginPercent,
      breakEvenRevenue: summary.breakEvenRevenue,
      cashFlowRisk: summary.cashFlowRisk,
    };

    // Scheme eligibility, with the same rules and the same reasons the
    // Yojana Kendra page shows — so the two can never disagree.
    const { data: schemeRows } = await supabaseServer.from('schemes').select('*');
    const schemes: SchemeRecord[] = (schemeRows || []).map((s) => ({
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

    const matches = matchSchemes(
      {
        monthly_revenue_est: revenue,
        monthly_expense_est: expense,
        existing_loans: loans,
        sector: profile.sector || undefined,
        category: profile.category || undefined,
        gender: profile.gender || undefined,
        state: profile.state || undefined,
        is_shg_member: Boolean(profile.is_shg_member || profile.shg_membership === 'shg_member'),
      },
      schemes
    );
    const eligible = matches.filter((m) => m.eligible);

    context.schemes = {
      eligibleCount: eligible.length,
      topMatches: eligible.slice(0, 3).map((m) => ({
        name: m.scheme.name,
        nameHi: m.scheme.name_hi ?? null,
        reasons: m.reasons,
        applicationLink: m.scheme.application_link,
      })),
      all: matches.map((m) => ({
        id: m.scheme.id,
        name: m.scheme.name,
        nameHi: m.scheme.name_hi ?? null,
        benefitHi: m.scheme.benefit_summary_hi ?? null,
        kind: m.scheme.scheme_type || 'other',
        benefit: m.scheme.benefit_summary || m.scheme.description || '',
        eligible: m.eligible,
        reasons: m.reasons,
        documents: m.scheme.required_documents || [],
        applicationLink: m.scheme.application_link,
      })),
    };
  }

  // Confirmed entries only: unreviewed OCR rows are suggestions, and the
  // assistant should not quote them back as fact.
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const { data: entries } = await supabaseServer
    .from('ledger_entries')
    .select('amount, entry_type')
    .eq('user_id', userId)
    .eq('confirmed', true)
    .gte('created_at', since);

  for (const entry of entries || []) {
    const amount = Number(entry.amount) || 0;
    if (entry.entry_type === 'income') context.ledger.last30DaysIncome += amount;
    else context.ledger.last30DaysExpense += amount;
    context.ledger.entryCount += 1;
  }

  return context;
}
