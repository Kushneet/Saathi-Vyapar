'use client';

/**
 * src/contexts/LanguageContext.tsx
 *
 * Global EN/HI language toggle.
 *
 * The choice is persisted in a cookie (not component state) so that:
 *   - it survives a reload instead of snapping back to English,
 *   - server components can render in the same language (see i18n.server.ts),
 *   - the whole app switches at once rather than only the login screen.
 *
 * The initial value is read on the server and passed in, so the first paint
 * is already correct and there is no flash of the wrong language.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  getTranslator,
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_MAX_AGE,
  type Language,
} from '@/lib/i18n';

interface LanguageContextValue {
  language: Language;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function persist(language: Language) {
  try {
    document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=${LANGUAGE_COOKIE_MAX_AGE}; samesite=lax`;
    document.documentElement.lang = language;
  } catch {
    // Cookies disabled — the toggle still works for this page view.
  }
}

export function LanguageProvider({
  children,
  initialLanguage = 'en',
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const router = useRouter();
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  // Keep <html lang> honest for screen readers and for CSS that keys off it.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(
    (next: Language) => {
      setLanguageState(next);
      persist(next);
      // Server components (dashboard, facilitator) read the cookie, so they
      // must be re-rendered for the switch to reach them.
      router.refresh();
    },
    [router]
  );

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'hi' : 'en');
  }, [language, setLanguage]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => getTranslator(language)(key, vars),
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, t, setLanguage, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}
