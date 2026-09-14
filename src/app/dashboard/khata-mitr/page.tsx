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
import KhataMitraAssistant from '@/components/khata-mitr/KhataMitraAssistant';

function KhataMitraContent() {
  const searchParams = useSearchParams();
  const paramUserId = searchParams.get('user_id');

  const [userId, setUserId] = useState<string | null>(paramUserId);
  const [userName, setUserName] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [totals, setTotals] = useState<{ income: number; expense: number } | null>(null);
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
                  {userName ? `${userName}'s bookkeeping assistant` : 'Voice & text bookkeeping assistant'}
                </p>
              </div>
            </div>
          </div>
          <Link
            href={`/dashboard${userId ? `?user_id=${userId}` : ''}`}
            className="px-4 py-2 bg-white hover:bg-[#F5F1E6] text-[#0B1E33] text-xs font-semibold rounded-full border border-[#C9A24B]/30 transition-all self-start sm:self-auto"
          >
            ← Dashboard
          </Link>
        </header>

        {totals && (
          <section className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-[#C9A24B]/20 rounded-2xl p-4 shadow-[0_8px_24px_rgba(11,30,51,0.05)]">
              <span className="text-[#0B1E33]/50 text-[10px] font-bold uppercase tracking-wider">30-Day Income</span>
              <p className="text-2xl font-bold text-emerald-700 mt-1">₹{totals.income.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-white border border-[#C9A24B]/20 rounded-2xl p-4 shadow-[0_8px_24px_rgba(11,30,51,0.05)]">
              <span className="text-[#0B1E33]/50 text-[10px] font-bold uppercase tracking-wider">30-Day Expense</span>
              <p className="text-2xl font-bold text-[#C9A24B] mt-1">₹{totals.expense.toLocaleString('en-IN')}</p>
            </div>
          </section>
        )}

        {isLoading || !userId ? (
          <div className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-10 shadow-[0_16px_40px_rgba(11,30,51,0.07)] text-center text-[#0B1E33]/50 text-sm">
            Loading Khata Mitra…
          </div>
        ) : (
          <KhataMitraAssistant userId={userId} language="hi" onLedgerChanged={() => setRefreshKey((k) => k + 1)} />
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
