/**
 * src/app/auth/confirm/route.ts
 *
 * Handles Supabase email confirmation link redirects.
 * Verifies email confirmation tokens via:
 * 1. `supabase.auth.verifyOtp` (token_hash or token + type)
 * 2. `supabase.auth.exchangeCodeForSession` (PKCE auth code flow)
 *
 * Redirects to `/login?confirmed=true` on success, or `/login?error=confirmation_failed` on failure.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';
  const redirectOrigin = isLocalEnv
    ? origin
    : forwardedHost
      ? `https://${forwardedHost}`
      : origin;

  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${redirectOrigin}/login?error=missing_config`);
  }

  const response = NextResponse.redirect(`${redirectOrigin}/login?confirmed=true`);

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            response.cookies.set(name, value, options);
          });
        } catch {
          // Server component / route handler cookie set handling
        }
      },
    },
  });

  // Flow 1: Token Hash verification (Standard Supabase Email Confirmation)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      return response;
    }
  }

  // Flow 2: PKCE Auth Code flow
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  // Flow 3: Legacy Token OTP verification (requires email + token)
  if (token && type && email) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token,
      email,
    });

    if (!error) {
      return response;
    }
  }

  // Fallback: verification failed
  return NextResponse.redirect(`${redirectOrigin}/login?error=confirmation_failed`);
}
