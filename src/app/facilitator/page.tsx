/**
 * src/app/facilitator/page.tsx
 *
 * Facilitator Dashboard
 * Allows field officers, SHG leaders, and CSC operators to monitor
 * and assist multiple rural micro-entrepreneurs.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { requirePageUser, listLinkedEntrepreneurIds } from '@/lib/auth/requireUser';
import { getServerT } from '@/lib/i18n.server';
import LanguageToggleButton from '@/components/LanguageToggleButton';
import AddEntrepreneurModal from './AddEntrepreneurModal';

interface EntrepreneurViewItem {
  id: string;
  name: string;
  phone: string;
  sector: string;
  monthly_revenue: number;
  monthly_expense: number;
  lastPlanDate: string | null;
  marginPercent: number | null;
  cashFlowRisk: string | null;
}

export const dynamic = 'force-dynamic';

export default async function FacilitatorPage() {
  // This portal lists names, phone numbers and monthly finances. It used to
  // render for anyone who knew the URL, over *every* entrepreneur in the
  // database. It now requires a facilitator session and shows only the
  // entrepreneurs explicitly linked to that facilitator.
  const sessionUser = await requirePageUser('/facilitator');
  const { t } = await getServerT();

  if (sessionUser.role !== 'facilitator' && sessionUser.role !== 'admin') {
    redirect('/dashboard');
  }

  const linkedIds =
    sessionUser.role === 'admin' ? null : await listLinkedEntrepreneurIds(sessionUser.id);

  // 1. Fetch the entrepreneurs this facilitator is responsible for
  let usersQuery = supabaseServer
    .from('users')
    .select('id, name, phone, language, created_at')
    .eq('role', 'entrepreneur')
    .order('created_at', { ascending: false });

  if (linkedIds !== null) {
    usersQuery = usersQuery.in('id', linkedIds);
  }

  const { data: usersData } = linkedIds !== null && linkedIds.length === 0
    ? { data: [] }
    : await usersQuery;

  const entrepreneurs: EntrepreneurViewItem[] = [];

  for (const u of usersData || []) {
    // Fetch profile
    const { data: profile } = await supabaseServer
      .from('business_profiles')
      .select('sector, monthly_revenue_est, monthly_expense_est')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Fetch latest plan
    const { data: plan } = await supabaseServer
      .from('financial_plans')
      .select('margin_percent, plan_json, created_at')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const planJson = plan?.plan_json as {
      financialMetrics?: { cashFlowRisk?: string };
    } | null;

    entrepreneurs.push({
      id: u.id,
      name: u.name || 'Entrepreneur',
      phone: u.phone,
      sector: profile?.sector || 'General',
      monthly_revenue: Number(profile?.monthly_revenue_est) || 0,
      monthly_expense: Number(profile?.monthly_expense_est) || 0,
      lastPlanDate: plan?.created_at || null,
      marginPercent: plan?.margin_percent ? Number(plan.margin_percent) : null,
      cashFlowRisk: planJson?.financialMetrics?.cashFlowRisk || null,
    });
  }

  return (
    <div className="min-h-screen bg-[#F5F1E6] text-[#0B1E33] p-3 sm:p-6 pb-24 font-['Open_Sans',sans-serif] relative overflow-hidden">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(201,162,75,0.07),transparent_70%)] blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[radial-gradient(circle_at_center,rgba(11,30,51,0.04),transparent_70%)] blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        {/* ── Top Header ────────────────────────────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#C9A24B]/20 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Link href="/" className="hover:opacity-80 transition-opacity">
                <img src="/Logo.png" alt="Saathi Vyapar Logo" className="h-10 sm:h-12 w-auto object-contain" />
              </Link>
            </div>
            <p className="text-[#0B1E33]/50 text-xs sm:text-sm mt-0.5">
              {t('facilitator_sub')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <LanguageToggleButton />
            <AddEntrepreneurModal />
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-white hover:bg-[#F5F1E6] text-[#0B1E33] text-xs font-semibold rounded-full border border-[#C9A24B]/30 transition-all"
            >
              ← {t('dashboard_badge')}
            </Link>
          </div>
        </header>

        <main className="space-y-6">
          {/* ── Stats Overview ───────────────────────────────────────── */}
          <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-[#C9A24B]/20 rounded-[24px] p-5 shadow-[0_8px_24px_rgba(11,30,51,0.05)]">
              <span className="text-[#0B1E33]/50 text-xs font-bold uppercase tracking-wider">Total Registered</span>
              <p className="text-3xl font-bold text-[#0B1E33] mt-1">{entrepreneurs.length}</p>
              <p className="text-[11px] text-[#0B1E33]/50 mt-1">Total Registered</p>
            </div>

            <div className="bg-white border border-[#C9A24B]/20 rounded-[24px] p-5 shadow-[0_8px_24px_rgba(11,30,51,0.05)]">
              <span className="text-[#0B1E33]/50 text-xs font-bold uppercase tracking-wider">Plans Generated</span>
              <p className="text-3xl font-extrabold text-emerald-700 mt-1">
                {entrepreneurs.filter((e) => e.lastPlanDate).length}
              </p>
              <p className="text-[11px] text-[#0B1E33]/50 mt-1">Active Financial Plans</p>
            </div>

            <div className="bg-white border border-[#C9A24B]/20 rounded-[24px] p-5 shadow-[0_8px_24px_rgba(11,30,51,0.05)]">
              <span className="text-[#0B1E33]/50 text-xs font-bold uppercase tracking-wider">Avg. Monthly Revenue</span>
              <p className="text-3xl font-bold text-[#0B1E33] mt-1">
                ₹
                {entrepreneurs.length > 0
                  ? Math.round(
                      entrepreneurs.reduce((sum, e) => sum + e.monthly_revenue, 0) /
                        entrepreneurs.length
                    ).toLocaleString('en-IN')
                  : '0'}
              </p>
              <p className="text-[11px] text-[#0B1E33]/50 mt-1">Avg. Monthly Revenue</p>
            </div>

            <div className="bg-white border border-[#C9A24B]/20 rounded-[24px] p-5 shadow-[0_8px_24px_rgba(11,30,51,0.05)]">
              <span className="text-[#0B1E33]/50 text-xs font-bold uppercase tracking-wider">High Risk Cases</span>
              <p className="text-3xl font-bold text-[#C9A24B] mt-1">
                {entrepreneurs.filter((e) => e.cashFlowRisk === 'high').length}
              </p>
              <p className="text-[11px] text-[#0B1E33]/50 mt-1">High Risk Profiles</p>
            </div>
          </section>

          {/* ── Entrepreneurs Table ───────────────────────────────────── */}
          <section className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-5 sm:p-6 shadow-[0_16px_40px_rgba(11,30,51,0.07)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-['Roboto',sans-serif] text-lg font-bold text-[#0B1E33] flex items-center gap-2">
                📋 Entrepreneur Directory
              </h2>
              <span className="text-xs text-[#0B1E33]/50">
                {entrepreneurs.length} entrepreneurs registered
              </span>
            </div>

            {entrepreneurs.length === 0 ? (
              <div className="text-center py-12 text-[#0B1E33]/50 space-y-2">
                <p className="text-lg font-semibold text-[#0B1E33]">{t('facilitator_no_entrepreneurs')}</p>
                <p className="text-xs text-[#0B1E33]/50">
                  Use the &quot;Add New Entrepreneur&quot; button above to add the first entrepreneur.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#C9A24B]/20 text-[#0B1E33]/50 text-xs uppercase font-bold">
                      <th className="pb-3 px-3">Entrepreneur / Name</th>
                      <th className="pb-3 px-3">Sector</th>
                      <th className="pb-3 px-3">Revenue / Expense</th>
                      <th className="pb-3 px-3">Profit / Risk</th>
                      <th className="pb-3 px-3">Last Plan Date</th>
                      <th className="pb-3 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#C9A24B]/15">
                    {entrepreneurs.map((item) => (
                      <tr key={item.id} className="hover:bg-[#F5F1E6]/60 transition-colors">
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-[#0B1E33]">{item.name}</div>
                          <div className="text-xs text-[#0B1E33]/50">{item.phone}</div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="px-3 py-1 bg-[#F5F1E6] border border-[#C9A24B]/20 rounded-full text-xs text-[#0B1E33] font-medium capitalize">
                            {item.sector}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="text-[#0B1E33] font-bold">
                            ₹{item.monthly_revenue.toLocaleString('en-IN')}
                          </div>
                          <div className="text-[11px] text-[#C9A24B]">
                            Expense: ₹{item.monthly_expense.toLocaleString('en-IN')}
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          {item.marginPercent !== null ? (
                            <div className="space-y-0.5">
                              <span
                                className={`text-xs font-bold ${
                                  item.marginPercent >= 0 ? 'text-emerald-700' : 'text-rose-600'
                                }`}
                              >
                                {item.marginPercent.toFixed(1)}%
                              </span>
                              {item.cashFlowRisk && (
                                <div className="text-[10px] uppercase font-bold text-[#0B1E33]/50">
                                  Risk: {item.cashFlowRisk}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-[#0B1E33]/50">No Plan Yet</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-xs text-[#0B1E33]/50">
                          {item.lastPlanDate
                            ? new Date(item.lastPlanDate).toLocaleDateString('en-IN')
                            : 'Pending'}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <Link
                            href={`/dashboard?user_id=${item.id}`}
                            className="inline-flex items-center px-4 py-2 bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] text-xs font-bold rounded-full transition-all"
                          >
                            View Plan →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
