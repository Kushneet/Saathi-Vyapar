/**
 * client.ts
 * Browser-safe Supabase client using the anonymous (public) key.
 * This client is subject to Row Level Security policies.
 * Safe to use in Client Components ('use client').
 *
 * Uses `createBrowserClient` from `@supabase/ssr` (not the plain
 * `@supabase/supabase-js` client) so the session is written to cookies
 * instead of localStorage. The server-side routes/pages in this app
 * (auth/callback, auth/confirm, dashboard) read the session via
 * `createServerClient` from the same request cookies — if the browser
 * client stored the session in localStorage instead, the server would
 * never see a logged-in user, and OAuth would default to the implicit
 * flow instead of PKCE, which breaks the `/auth/callback` code exchange.
 */

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
    console.warn('⚠️ Supabase client environment variables are missing.');
  }
}

/**
 * Browser Supabase client.
 * Respects RLS policies. Use for all client-side data access.
 */
export const supabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey);

