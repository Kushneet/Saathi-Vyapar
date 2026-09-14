'use client';

import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

export default function LogoutButton() {
  const router = useRouter();
  const { t } = useLanguage();

  async function handleLogout() {
    try {
      await supabaseClient.auth.signOut();
    } catch {
      // Ignore signout error
    }
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-full border border-rose-200/50 transition-all cursor-pointer"
    >
      {t('dashboard_logout')}
    </button>
  );
}
