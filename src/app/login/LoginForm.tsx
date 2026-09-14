'use client';

/**
 * src/app/login/LoginForm.tsx
 *
 * Pantheon Eternal Authentication Portal
 * - Warm cream background (#F5F1E6), deep navy (#0B1E33), gold accent (#C9A24B)
 * - Roboto headlines, Open Sans body text
 * - Email/Password Sign In & Sign Up + Google OAuth
 * - EN/HI language toggle via useLanguage()
 * - Voice Mode via Web Speech API
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabaseClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggleButton from '@/components/LanguageToggleButton';

/**
 * Decides where a just-authenticated user should land: `/onboarding` if they
 * have no `business_profiles` row yet (new account, or one that never
 * finished the profile wizard), `/dashboard` otherwise. An explicit `next`
 * (e.g. a deep link that expired mid-session) always wins, since a returning
 * user resuming a specific page is more likely to already have a profile.
 */
async function resolvePostLoginPath(userId: string, explicitNext: string | null): Promise<string> {
  if (explicitNext) return explicitNext;
  try {
    const { data: profile } = await supabaseClient
      .from('business_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!profile) return '/onboarding';
  } catch {
    // Lookup failed — don't block sign-in on it, just fall through to the dashboard.
  }
  return '/dashboard';
}

export default function LoginForm() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignInLoading, setIsSignInLoading] = useState(false);
  const [isSignUpLoading, setIsSignUpLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Seed the banner from `?error=`/`?confirmed=` on first render (lazy
  // initializer, not an effect — setting state synchronously inside an
  // effect causes an extra cascading render). A dedicated effect below then
  // strips those params from the URL so the banner can't get permanently
  // stuck: previously it was derived from searchParams on every render, so
  // a failed OAuth attempt (`/login?error=auth_failed`) kept showing even
  // after a later, unrelated sign-in attempt, because `error ||
  // urlErrorMessage` fell back to the URL-derived message the moment local
  // state was cleared.
  const [error, setError] = useState(() => {
    const authError = searchParams.get('error');
    const customMessage = searchParams.get('message');
    if (customMessage) return decodeURIComponent(customMessage);
    if (authError === 'confirmation_failed') {
      return 'The confirmation link is invalid or has expired. Please sign up again or request a new link.';
    }
    if (authError === 'auth_failed') return 'Authentication failed. Please try signing in again.';
    return '';
  });
  const [successMessage, setSuccessMessage] = useState(() =>
    searchParams.get('confirmed') === 'true' ? 'Email confirmed successfully! You can now sign in.' : ''
  );

  const activeError = error;
  const activeSuccess = successMessage;

  useEffect(() => {
    const isConfirmed = searchParams.get('confirmed') === 'true';
    const authError = searchParams.get('error');
    const customMessage = searchParams.get('message');
    if (!isConfirmed && !authError && !customMessage) return;

    // Preserve any other params (e.g. `next`) — only drop the ones we just consumed.
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete('error');
    rest.delete('error_code');
    rest.delete('message');
    rest.delete('confirmed');
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
    // Only run once on mount — searchParams/router/pathname intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function checkExistingSession() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
          const next = await resolvePostLoginPath(session.user.id, searchParams.get('next'));
          router.push(next);
        }
      } catch { /* ignore */ }
    }
    checkExistingSession();

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        resolvePostLoginPath(session.user.id, searchParams.get('next')).then((next) => {
          router.push(next);
          router.refresh();
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [router, searchParams]);

  function handleToggleVoiceMode() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Voice mode is not supported on this browser.');
      return;
    }
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(
      mode === 'login'
        ? 'Welcome to Saathi Vyapar. Please enter your email and password or use Google to sign in.'
        : 'Welcome to Saathi Vyapar. Enter your email and password to create a new account.'
    );
    utterance.lang = 'en-IN';
    utterance.rate = 0.95;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  function formatErrorMessage(err: unknown): string {
    if (!err) return 'An unexpected error occurred. Please try again.';
    const message = (
      err instanceof Error ? err.message : typeof err === 'string' ? err : (err as { message?: string }).message || ''
    ).toLowerCase();

    if (message.includes('invalid login credentials') || message.includes('invalid_grant')) {
      return 'Incorrect email or password. Please try again.';
    }
    if (message.includes('user already registered') || message.includes('already exists')) {
      return 'An account with this email already exists. Please Sign In.';
    }
    if (message.includes('email not confirmed')) {
      return 'Your email is not yet verified. Please check your inbox for the confirmation link.';
    }
    if (message.includes('password should be at least 6') || message.includes('weak_password')) {
      return 'Password must be at least 6 characters.';
    }
    if (message.includes('invalid email') || message.includes('valid email')) {
      return 'Please enter a valid email address (e.g. name@example.com).';
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'Too many attempts. Please try again in a minute.';
    }
    if (message.includes('failed to fetch') || message.includes('network')) {
      return 'Unable to reach authentication server. If using demo mode, you can sign in directly below.';
    }
    return err instanceof Error ? err.message : 'Authentication failed. Please verify your details and try again.';
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccessMessage('');
    if (!email.trim() || !password) { setError('Please enter both email and password.'); return; }
    setIsSignInLoading(true);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const isPlaceholder = !supabaseUrl || supabaseUrl.includes('placeholder');

    if (isPlaceholder) {
      setSuccessMessage('Signed in successfully! Redirecting to dashboard...');
      setTimeout(() => {
        const next = searchParams.get('next') || '/dashboard';
        router.push(next);
        router.refresh();
      }, 600);
      return;
    }

    try {
      const { data, error: signInError } = await supabaseClient.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) { setError(formatErrorMessage(signInError)); setIsSignInLoading(false); return; }
      if (data.session) {
        setSuccessMessage('Signed in successfully! Redirecting...');
        const next = await resolvePostLoginPath(data.session.user.id, searchParams.get('next'));
        router.push(next);
        router.refresh();
      }
      else setIsSignInLoading(false);
    } catch (err) { setError(formatErrorMessage(err)); setIsSignInLoading(false); }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccessMessage('');
    if (!email.trim() || !password) { setError('Please enter an email and password to create an account.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setIsSignUpLoading(true);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const isPlaceholder = !supabaseUrl || supabaseUrl.includes('placeholder');

    if (isPlaceholder) {
      setSuccessMessage('Demo account created! Redirecting...');
      setTimeout(() => {
        const next = searchParams.get('next') || '/onboarding';
        router.push(next);
        router.refresh();
      }, 600);
      return;
    }

    try {
      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/confirm` : undefined;
      const { data, error: signUpError } = await supabaseClient.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: email.split('@')[0] }, emailRedirectTo: redirectUrl },
      });
      if (signUpError) { setError(formatErrorMessage(signUpError)); setIsSignUpLoading(false); return; }
      if (data.session) {
        // Email confirmation is disabled on this project, so signUp already returned
        // an active session — a brand-new account, so send it straight to onboarding.
        setSuccessMessage('Account created! Redirecting...');
        router.push('/onboarding');
        router.refresh();
        return;
      }
      if (data.user) {
        setSuccessMessage('Account created! Please check your email to confirm your address.');
      }
      setIsSignUpLoading(false);
    } catch (err) { setError(formatErrorMessage(err)); setIsSignUpLoading(false); }
  }

  async function handleGoogleSignIn() {
    setIsGoogleLoading(true); setError(''); setSuccessMessage('');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const isPlaceholder = !supabaseUrl || supabaseUrl.includes('placeholder');

    if (isPlaceholder) {
      setSuccessMessage('Signing in with Google... Redirecting to dashboard...');
      setTimeout(() => {
        const next = searchParams.get('next') || '/dashboard';
        router.push(next);
        router.refresh();
      }, 600);
      return;
    }

    try {
      const nextTarget = searchParams.get('next');
      const redirectUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback${nextTarget ? `?next=${encodeURIComponent(nextTarget)}` : ''}`
        : undefined;

      const { error: authError } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, queryParams: { access_type: 'offline', prompt: 'consent' } },
      });

      if (authError) {
        setError(formatErrorMessage(authError));
        setIsGoogleLoading(false);
      }
    } catch (err: unknown) {
      setError(formatErrorMessage(err));
      setIsGoogleLoading(false);
    }
  }

  const isAnyLoading = isSignInLoading || isSignUpLoading || isGoogleLoading;

  return (
    <div className="min-h-screen bg-[#F5F1E6] text-[#0B1E33] font-['Open_Sans',sans-serif] flex flex-col justify-between relative overflow-hidden">
      {/* Subtle background texture */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />

      {/* Gold ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(201,162,75,0.08),transparent_70%)] blur-3xl pointer-events-none" />

      {/* ── Top Header ── */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center group">
          <img src="/Logo.png" alt="Saathi Vyapar Logo" className="h-10 sm:h-12 w-auto object-contain transition-transform group-hover:scale-105" />
        </Link>

        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Voice Mode Button */}
          <button
            type="button"
            onClick={handleToggleVoiceMode}
            className={`cursor-pointer px-4 sm:px-5 py-2 rounded-full font-bold text-xs sm:text-sm transition-all duration-200 flex items-center gap-1.5 shadow-sm active:scale-95 ${
              isSpeaking
                ? 'bg-[#C9A24B] text-white ring-4 ring-[#C9A24B]/30 animate-pulse'
                : 'bg-white hover:bg-[#F5F1E6] text-[#0B1E33] border border-[#C9A24B]/30'
            }`}
            title="Listen to voice guide"
          >
            <span>🎤</span>
            <span className="hidden sm:inline">{t('login_voice_mode')}</span>
          </button>

          {/* Language Toggle */}
          <LanguageToggleButton />

          {/* Login/Register Switch */}
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccessMessage(''); }}
            className="cursor-pointer bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] font-semibold text-xs sm:text-sm px-4 sm:px-5 py-2 rounded-full transition-all shadow-sm active:scale-95"
          >
            {mode === 'login' ? t('login_tab_signup') : t('login_tab_signin')}
          </button>
        </div>
      </header>

      {/* ── Main Center Panel ── */}
      <main className="flex-1 flex items-center justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-xl bg-white border border-[#C9A24B]/20 rounded-[32px] p-6 sm:p-10 shadow-[0_20px_60px_rgba(11,30,51,0.08)] relative">
          {/* Gold accent top border */}
          <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-[#C9A24B] to-transparent rounded-full" />

          {/* Eyebrow */}
          <div className="text-[#0B1E33]/50 text-xs font-bold uppercase tracking-[0.12em] mb-2 flex items-center justify-between">
            <span>{t('login_step')}</span>
            <span className="text-[10px] bg-[#F5F1E6] text-[#0B1E33]/70 border border-[#C9A24B]/30 px-2.5 py-0.5 rounded-full font-semibold">
              {t('login_secure_portal')}
            </span>
          </div>

          {/* Heading */}
          <h2 className="font-['Roboto',sans-serif] text-2xl sm:text-3xl font-bold text-[#0B1E33] tracking-tight leading-snug mb-1">
            {mode === 'login' ? t('login_heading_signin') : t('login_heading_signup')}
          </h2>

          {/* Subtitle */}
          <p className="text-[#0B1E33]/60 text-xs sm:text-sm mt-1 mb-5 leading-relaxed">
            {mode === 'login' ? t('login_subtitle_signin') : t('login_subtitle_signup')}
          </p>

          {/* Gold Progress Bar */}
          <div className="w-full bg-[#F5F1E6] h-1.5 rounded-full overflow-hidden mb-6">
            <div className="bg-[#C9A24B] h-full rounded-full w-full" />
          </div>

          {/* Voice Active Banner */}
          {isSpeaking && (
            <div className="mb-4 p-3.5 rounded-2xl bg-[#C9A24B]/10 border border-[#C9A24B]/40 text-[#0B1E33] text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base animate-bounce">🎙️</span>
                <span className="font-medium leading-relaxed">{t('login_voice_active')}</span>
              </div>
              <button type="button" onClick={handleToggleVoiceMode} className="text-[#C9A24B] hover:text-[#0B1E33] font-bold text-xs underline cursor-pointer shrink-0">
                {t('login_voice_stop')}
              </button>
            </div>
          )}

          {/* Error Alert */}
          {activeError && (
            <div className="mb-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                <span className="text-base shrink-0">⚠️</span>
                <div className="flex-1 leading-relaxed font-medium">{activeError}</div>
              </div>
              {/* "Continue as Demo User" used to sit here. It only pushed the
                  router at /dashboard — no sign-in — which worked back when the
                  dashboard rendered for anyone. The dashboard now requires a
                  session, so the button sent the user straight back to this
                  page. A control that promises access and returns a loop is
                  worse than no control. */}            </div>
          )}

          {/* Success Alert */}
          {activeSuccess && (
            <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
              <span className="text-base shrink-0">✉️</span>
              <div className="flex-1 leading-relaxed font-medium">{activeSuccess}</div>
            </div>
          )}

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-[#F5F1E6] border border-[#C9A24B]/20 rounded-full mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }}
              className={`py-2 rounded-full font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                mode === 'login' ? 'bg-[#0B1E33] text-[#F5F1E6] shadow-sm' : 'text-[#0B1E33]/60 hover:text-[#0B1E33]'
              }`}
            >
              {t('login_tab_signin')}
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(''); setSuccessMessage(''); }}
              className={`py-2 rounded-full font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                mode === 'signup' ? 'bg-[#0B1E33] text-[#F5F1E6] shadow-sm' : 'text-[#0B1E33]/60 hover:text-[#0B1E33]'
              }`}
            >
              {t('login_tab_signup')}
            </button>
          </div>

          {/* Form */}
          <form onSubmit={mode === 'login' ? handleSignIn : handleSignUp} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs sm:text-sm font-bold text-[#0B1E33] mb-1.5">
                {t('login_email_label')} <span className="text-[#C9A24B]">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                disabled={isAnyLoading}
                className="w-full bg-[#F5F1E6] border border-[#C9A24B]/30 text-[#0B1E33] placeholder-[#0B1E33]/40 rounded-2xl px-4 py-3 text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] focus:ring-2 focus:ring-[#C9A24B]/20 transition-all disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs sm:text-sm font-bold text-[#0B1E33]">
                  {t('login_password_label')} <span className="text-[#C9A24B]">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isAnyLoading}
                  className="text-xs text-[#0B1E33]/50 hover:text-[#C9A24B] font-medium cursor-pointer transition-colors"
                >
                  {showPassword ? t('login_hide_password') : t('login_show_password')}
                </button>
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                disabled={isAnyLoading}
                className="w-full bg-[#F5F1E6] border border-[#C9A24B]/30 text-[#0B1E33] placeholder-[#0B1E33]/40 rounded-2xl px-4 py-3 text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] focus:ring-2 focus:ring-[#C9A24B]/20 transition-all disabled:opacity-50"
              />
            </div>

            {/* Helper */}
            <p className="text-[#0B1E33]/50 text-xs pt-1">
              {mode === 'login' ? t('login_helper_signin') : t('login_helper_signup')}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-3 pt-3">
              <Link
                href="/"
                className="px-5 py-3 rounded-full border border-[#C9A24B]/40 bg-[#F5F1E6] hover:bg-[#EDE9DA] text-[#0B1E33] text-xs sm:text-sm font-semibold transition-all text-center"
              >
                {t('login_back')}
              </Link>
              <button
                type="submit"
                disabled={isAnyLoading}
                className="cursor-pointer px-7 py-3 rounded-full bg-[#0B1E33] hover:bg-[#162D59] active:scale-[0.98] text-[#F5F1E6] font-bold text-xs sm:text-sm transition-all shadow-[0_4px_20px_rgba(11,30,51,0.20)] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSignInLoading || isSignUpLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-[#C9A24B]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>{t('login_loading')}</span>
                  </>
                ) : mode === 'login' ? (
                  <span>{t('login_submit_signin')}</span>
                ) : (
                  <span>{t('login_submit_signup')}</span>
                )}
              </button>
            </div>
          </form>

          {/* Divider */}
          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#C9A24B]/20" />
            </div>
            <span className="relative bg-white px-3.5 text-xs text-[#0B1E33]/50 font-bold uppercase tracking-wider">
              {t('login_or')}
            </span>
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isAnyLoading}
            className="w-full cursor-pointer bg-white hover:bg-[#F5F1E6] active:scale-[0.99] text-[#0B1E33] font-semibold py-3 px-4 rounded-full flex items-center justify-center gap-3 transition-all shadow-sm disabled:opacity-60 border border-[#C9A24B]/30"
          >
            {isGoogleLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-[#0B1E33]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm font-semibold">{t('login_google_loading')}</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span className="text-sm font-bold">{t('login_google')}</span>
              </>
            )}
          </button>

          {/* Switch Mode Footer */}
          <div className="mt-5 text-center text-xs text-[#0B1E33]/50">
            {mode === 'login' ? (
              <span>
                {t('login_no_account')}{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError(''); setSuccessMessage(''); }}
                  className="text-[#C9A24B] font-bold hover:underline cursor-pointer ml-1"
                >
                  {t('login_create_account')}
                </button>
              </span>
            ) : (
              <span>
                {t('login_have_account')}{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }}
                  className="text-[#C9A24B] font-bold hover:underline cursor-pointer ml-1"
                >
                  {t('login_signin_link')}
                </button>
              </span>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="py-5 text-center text-xs text-[#0B1E33]/50 tracking-wide border-t border-[#C9A24B]/20">
        {t('login_footer')}
      </footer>
    </div>
  );
}
