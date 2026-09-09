/**
 * src/lib/i18n.server.ts
 *
 * Server-side half of the EN/HI toggle.
 *
 * The language used to live only in React state inside a client provider, so
 * it reset to English on every page load and could not reach the pages that
 * matter most — /dashboard and /facilitator are server components and cannot
 * call a client hook. Storing the choice in a cookie lets both halves read the
 * same value, and `router.refresh()` after a toggle re-renders the server
 * components in the new language.
 */

import 'server-only';
import { cookies } from 'next/headers';
import {
  LANGUAGE_COOKIE,
  getTranslator,
  normalizeLanguage,
  type Language,
  type Translator,
} from './i18n';

/** The visitor's language preference, defaulting to English. */
export async function getServerLanguage(): Promise<Language> {
  try {
    const cookieStore = await cookies();
    return normalizeLanguage(cookieStore.get(LANGUAGE_COOKIE)?.value);
  } catch {
    // Called outside a request scope (e.g. during static generation).
    return 'en';
  }
}

/** Translator bound to the visitor's language, for use in server components. */
export async function getServerT(): Promise<{ language: Language; t: Translator }> {
  const language = await getServerLanguage();
  return { language, t: getTranslator(language) };
}
