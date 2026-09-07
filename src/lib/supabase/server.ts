/**
 * server.ts
 * Server-only Supabase client using the service role key.
 * This bypasses Row Level Security — only use in trusted server-side contexts (API routes, Server Components).
 * NEVER expose this client to the browser.
 */

import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
    console.warn('⚠️ Supabase server environment variables are missing.');
  }
}

/**
 * Server-side Supabase admin client.
 * Has full database access — bypasses RLS policies.
 */
export const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    // Service role clients should not persist sessions
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/**
 * Per-request Supabase client bound to the visitor's session cookies.
 * Use this in Server Components / Route Handlers whenever you need to know
 * who the currently signed-in user is (respects RLS, unlike `supabaseServer`).
 *
 * Reads and writes through Next.js's `cookies()` API, so it shares session
 * state with the browser client (`createBrowserClient` in `client.ts`) and
 * with `proxy.ts`, which is what keeps the cookie fresh across navigations.
 */
export async function createSupabaseRouteClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component without write access to cookies — safe to ignore
          // as long as proxy.ts is refreshing the session on the request path.
        }
      },
    },
  });
}

