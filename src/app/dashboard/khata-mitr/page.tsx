'use client';

/**
 * src/app/dashboard/khata-mitr/page.tsx
 *
 * Khata Mitra — Voice/Text AI Bookkeeping Panel
 * Full dashboard panel wrapping KhataMitraAssistant. Resolves the active
 * user the same way the Yojana Kendra (schemes) panel does: ?user_id query
 * param -> Supabase session -> most recently created user.
 */

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import KhataMitraAssistant from '@/components/khata-mitr/KhataMitraAssistant';

function KhataMitraContent() {
  // The assistant and its input already speak both languages; this page
  // used to pin them to Hindi while its own header stayed English.
  const { t, language } = useLanguage();
  const searchParams = useSearchParams();
  const paramUserId = searchParams.get('user_id');

  const [userId, setUserId] = useState<string | null>(paramUserId);
  const [userName, setUserName] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [totals, setTotals] = useState<{ income: number; expense: number } | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string; balance: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      setIsLoading(true);
      try {
        let activeId = paramUserId;

        if (!activeId) {
          const {
            data: { session },
          } = await supabaseClient.auth.getSession();
          if (session?.user) activeId = session.user.id;
        }

        if (!activeId) {
          const { data: latestUsers } = await supabaseClient
            .from('users')
            .select('id, name')
            .order('created_at', { ascending: false })
            .limit(1);
          if (latestUsers && latestUsers.length > 0) {
            activeId = latestUsers[0].id;
            setUserName(latestUsers[0].name);
          }
        } else {
          const { data: userData } = await supabaseClient.from('users').select('name').eq('id', activeId).single();
          if (userData) setUserName(userData.name);
        }

        setUserId(activeId);
      } finally {
        setIsLoading(false);
      }
    }
    loadUser();
  }, [paramUserId]);

  useEffect(() => {
    if (!userId) return;
    async function loadTotals() {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data } = await supabaseClient
        .from('ledger_entries')
        .select('amount, entry_type')
        .eq('user_id', userId as string)
        .gte('created_at', thirtyDaysAgo.toISOString());

      const income = (data || []).filter((e) => e.entry_type === 'income').reduce((s, e) => s + Number(e.amount), 0);
      const expense = (data || []).filter((e) => e.entry_type === 'expense').reduce((s, e) => s + Number(e.amount), 0);
      setTotals({ income, expense });
    }
    loadTotals();
  }, [userId, refreshKey]);

  useEffect(() => {
    if (!userId) return;
    async function loadCustomers() {
      const { data } = await supabaseClient
        .from('khata_customers')
        .select('id, name, balance')
        .eq('user_id', userId as string)
        .order('balance', { ascending: false });
      setCustomers(data || []);
    }
    loadCustomers();
  }, [userId, refreshKey]);

  return (
    <div className="min-h-screen bg-[#F5F1E6] text-[#0B1E33] p-3 sm:p-6 pb-24 font-['Inter',sans-serif] relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(201,162,75,0.07),transparent_70%)] blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-3xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#C9A24B]/20 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Link href="/" className="hover:opacity-80 transition-opacity">
                <img src="/Logo.png" alt="Saathi Vyapar Logo" className="h-10 sm:h-12 w-auto object-contain" />
              </Link>
              <div>
                <h1 className="font-['Playfair_Display',Georgia,serif] text-xl sm:text-2xl font-bold text-[#0B1E33]">
                  🎙️ Khata Mitra
                </h1>
                <p className="text-[#0B1E33]/50 text-xs">
                  {userName ? t('km_sub_named').replace('{name}', userName) : t('km_sub')}
                </p>
              </div>
            </div>
          </div>
          <Link
            href={`/dashboard${userId ? `?user_id=${userId}` : ''}`}
            className="px-4 py-2 bg-white hover:bg-[#F5F1E6] text-[#0B1E33] text-xs font-semibold rounded-full border border-[#C9A24B]/30 transition-all self-start sm:self-auto"
          >
            {t('km_back')}
          </Link>
        </header>

        {totals && (
          <section className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-[#C9A24B]/20 rounded-2xl p-4 shadow-[0_8px_24px_rgba(11,30,51,0.05)]">
              <span className="text-[#0B1E33]/50 text-[10px] font-bold uppercase tracking-wider">{t('km_income_30')}</span>
              <p className="text-2xl font-bold text-[#1B7F4B] mt-1">₹{totals.income.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-white border border-[#C9A24B]/20 rounded-2xl p-4 shadow-[0_8px_24px_rgba(11,30,51,0.05)]">
              <span className="text-[#0B1E33]/50 text-[10px] font-bold uppercase tracking-wider">{t('km_expense_30')}</span>
              <p className="text-2xl font-bold text-[#C62828] mt-1">₹{totals.expense.toLocaleString('en-IN')}</p>
            </div>
          </section>
        )}

        {customers.length > 0 && (
          <section className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-5 shadow-[0_16px_40px_rgba(11,30,51,0.07)]">
            <h2 className="font-['Playfair_Display',Georgia,serif] text-base font-bold text-[#0B1E33] mb-3">
              {t('km_customers')} ({customers.length})
            </h2>
            <div className="space-y-2">
              {customers.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 bg-[#F5F1E6] rounded-xl border border-[#C9A24B]/10"
                >
                  <span className="text-sm font-semibold text-[#0B1E33]">{c.name}</span>
                  <span
                    className={`text-sm font-bold ${Number(c.balance) > 0 ? 'text-rose-600' : 'text-emerald-700'}`}
                  >
                    {Number(c.balance) > 0
                      ? `${t('km_owes')} ₹${Number(c.balance).toLocaleString('en-IN')}`
                      : Number(c.balance) < 0
                        ? `${t('km_advance')} ₹${Math.abs(Number(c.balance)).toLocaleString('en-IN')}`
                        : t('km_settled')}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {isLoading || !userId ? (
          <div className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-10 shadow-[0_16px_40px_rgba(11,30,51,0.07)] text-center text-[#0B1E33]/50 text-sm">
            {t('km_loading')}
          </div>
        ) : (
          <KhataMitraAssistant userId={userId} language={language} onLedgerChanged={() => setRefreshKey((k) => k + 1)} />
        )}
      </div>
    </div>
  );
}

export default function KhataMitraPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F1E6]" />}>
      <KhataMitraContent />
    </Suspense>
  );
}
