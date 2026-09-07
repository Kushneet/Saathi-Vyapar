/**
 * src/app/auth/callback/route.ts
 *
 * Handles OAuth callback code exchange for Supabase Auth (Google OAuth).
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const errorParam = searchParams.get('error') || searchParams.get('error_code');
  const errorDescription = searchParams.get('error_description');

  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';
  const redirectOrigin = isLocalEnv
    ? origin
    : forwardedHost
      ? `https://${forwardedHost}`
      : origin;

  // 1. Handle OAuth error query params passed back from provider
  if (errorParam || errorDescription) {
    const detailedMessage = errorDescription || errorParam || 'Authentication failed.';
    return NextResponse.redirect(
      `${redirectOrigin}/login?error=auth_failed&message=${encodeURIComponent(detailedMessage)}`
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const isPlaceholderEnv = !supabaseUrl || supabaseUrl.includes('placeholder');

  // 2. Placeholder/Demo environment fallback
  if (isPlaceholderEnv) {
    return NextResponse.redirect(`${redirectOrigin}${next}`);
  }

  // 3. Live Supabase PKCE OAuth code exchange
  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server route cookie handling
          }
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${redirectOrigin}${next}`);
    }

    // Pass specific code exchange error
    return NextResponse.redirect(
      `${redirectOrigin}/login?error=auth_failed&message=${encodeURIComponent(error.message)}`
    );
  }

  // 4. Default Fallback
  return NextResponse.redirect(`${redirectOrigin}/login?error=auth_failed`);
}
