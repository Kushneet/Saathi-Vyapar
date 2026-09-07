/**
 * src/proxy.ts
 *
 * Next.js 16 renamed the "Middleware" file convention to "Proxy" (same
 * runtime, same purpose — see node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
 *
 * This proxy keeps the Supabase auth cookie fresh on every request. Without
 * it, `supabaseClient` (browser, cookie-based via @supabase/ssr) can hold an
 * access token that has expired while the refresh token is still valid, and
 * server-side reads (dashboard, callback routes) via `auth.getUser()` would
 * intermittently fail to recognize a signed-in user.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Touching auth.getUser() triggers a token refresh (and cookie rewrite via
  // setAll above) whenever the access token is stale but the session is not.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
