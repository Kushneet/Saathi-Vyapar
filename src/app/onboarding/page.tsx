'use client';

/**
 * src/app/onboarding/page.tsx
 *
 * Micro-Entrepreneur Registration & Onboarding Page
 *
 * Capabilities:
 * - Native Web Speech API Voice Onboarding Modal
 * - Browser compatibility detection (`'webkitSpeechRecognition' in window || 'SpeechRecognition' in window`)
 * - Clean, accessible TEXT-BASED Onboarding Form as reliable fallback (for Firefox, iOS Safari limitations, or user preference)
 * - 8-Step Conversational & Form Flow with strict DPDP Act Consent verification
 * - Calls /api/onboarding/complete and redirects to /dashboard
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import VoiceOnboardingModal, { OnboardingData } from '@/components/VoiceOnboardingModal';
import { supabaseClient } from '@/lib/supabase/client';
import LanguageToggleButton from '@/components/LanguageToggleButton';
import { useSpeechSupported } from '@/lib/hooks/useSpeechSupported';
import { useLanguage } from '@/contexts/LanguageContext';

export default function OnboardingPage() {
  const { t } = useLanguage();
  const router = useRouter();

  // Browser voice support state
  const hasVoiceSupport = useSpeechSupported();
  // Closed by default. The voice flow used to open itself the moment the page
  // loaded and start listening immediately, which startles someone opening the
  // app for the first time and hides the plain form behind a modal. The form
  // is now what you land on, and voice is one tap away from it.
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  // Text Form Step State (1 to 8)
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Email & Password Auth State for Step 7
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState<OnboardingData>({
    phone: '',
    email: '',
    name: '',
    district: '',
    state: 'India',
    sector: '',
    business_name: '',
    monthly_revenue_est: 0,
    monthly_expense_est: 0,
    existing_loans: false,
    loan_amount: 0,
    loan_monthly_payment: 0,
    loan_interest_rate: 0,
    consent_given: false,
  });

  // Check auth session on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        if (session?.user) {
          const userEmail = session.user.email || null;
          setAuthUserEmail(userEmail);
          if (userEmail) {
            setEmail(userEmail);
          }
          setFormData((prev) => ({
            ...prev,
            user_id: session.user.id,
            email: userEmail || prev.email,
            phone: session.user.phone || prev.phone,
          }));
        }
      } catch (err) {
        console.warn('Session check warning:', err);
      }
    }

    checkAuth();
  }, []);

  // Handle Google OAuth Sign In
  async function handleGoogleSignIn() {
    setIsGoogleLoading(true);
    setErrorMessage(null);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const isPlaceholder = !supabaseUrl || supabaseUrl.includes('placeholder');

    if (isPlaceholder) {
      setTimeout(() => {
        setIsGoogleLoading(false);
        setAuthUserEmail('demo.user@example.com');
        setEmail('demo.user@example.com');
        setFormData((prev) => ({
          ...prev,
          email: 'demo.user@example.com',
          name: prev.name || 'Google Demo User',
        }));
      }, 500);
      return;
    }

    try {
      const redirectUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?next=/onboarding`
          : undefined;

      const { error: authError } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (authError) {
        setErrorMessage(authError.message);
        setIsGoogleLoading(false);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Google sign-in failed');
      setIsGoogleLoading(false);
    }
  }

  // Handle Text-Based Form Submission
  async function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    // Step validations
    if (currentStep === 1 && !formData.name.trim()) {
      setErrorMessage(t('onboarding_err_name'));
      return;
    }

    if (currentStep === 2 && !formData.district.trim()) {
      setErrorMessage(t('onboarding_err_district'));
      return;
    }

    if (currentStep === 3 && !formData.sector.trim()) {
      setErrorMessage(t('onboarding_err_sector'));
      return;
    }

    if (currentStep === 4) {
      if (formData.monthly_revenue_est <= 0) {
        setErrorMessage(t('onboarding_err_revenue'));
        return;
      }
    }

    if (currentStep === 7) {
      // If user is already authenticated via Google OAuth or active session
      if (authUserEmail || formData.user_id) {
        setCurrentStep(8);
        return;
      }

      if (!email.trim() || !password) {
        setErrorMessage(t('onboarding_err_credentials'));
        return;
      }

      if (password.length < 6) {
        setErrorMessage(t('onboarding_err_password'));
        return;
      }

      // Create or sign into account via Supabase
      try {
        const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: formData.name },
            emailRedirectTo:
              typeof window !== 'undefined'
                ? `${window.location.origin}/auth/confirm`
                : undefined,
          },
        });

        if (signUpError) {
          if (signUpError.message.toLowerCase().includes('already registered')) {
            const { data: signInData, error: signInError } =
              await supabaseClient.auth.signInWithPassword({
                email: email.trim(),
                password,
              });
            if (signInError) {
              setErrorMessage(signInError.message);
              return;
            }
            if (signInData.user) {
              setAuthUserEmail(signInData.user.email || email.trim());
              setFormData((prev) => ({
                ...prev,
                user_id: signInData.user.id,
                email: signInData.user.email || email.trim(),
              }));
            }
          } else {
            setErrorMessage(signUpError.message);
            return;
          }
        } else if (signUpData?.user) {
          const confirmedUser = signUpData.user;
          setAuthUserEmail(confirmedUser.email || email.trim());
          setFormData((prev) => ({
            ...prev,
            user_id: confirmedUser.id,
            email: confirmedUser.email || email.trim(),
          }));
        }
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : 'खाता बनाने में त्रुटि हुई'
        );
        return;
      }
    }

    if (currentStep === 8) {
      if (!formData.consent_given) {
        setErrorMessage(t('onboarding_err_consent'));
        return;
      }

      // Final Submission
      setIsSubmitting(true);
      try {
        const response = await fetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        const resData = await response.json();

        if (!response.ok || !resData.success) {
          throw new Error(resData.error || 'Failed to complete registration');
        }

        router.push(resData.redirectUrl || `/dashboard?user_id=${resData.userId}`);
        router.refresh();
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : 'पंजीकरण सेव करने में त्रुटि हुई'
        );
        setIsSubmitting(false);
      }
      return;
    }

    // Advance to next step
    setCurrentStep((prev) => prev + 1);
  }

  return (
    <div className="min-h-screen bg-[#F5F1E6] text-[#0B1E33] font-['Open_Sans',sans-serif] flex flex-col justify-between relative overflow-hidden">
      {/* ── Ambient Background Glows ── */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(201,162,75,0.07),transparent_70%)] blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[radial-gradient(circle_at_center,rgba(11,30,51,0.04),transparent_70%)] blur-3xl pointer-events-none -z-10" />

      {/* ── Top Header ────────────────────────────────────────────── */}
      <header className="border-b border-[#C9A24B]/20 bg-[#F5F1E6]/90 backdrop-blur-xl px-4 sm:px-8 py-3.5 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center group">
            <img src="/Logo.png" alt="Saathi Vyapar Logo" className="h-9 sm:h-11 w-auto object-contain transition-transform group-hover:scale-105" />
          </Link>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <LanguageToggleButton />
            {hasVoiceSupport && (
              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#C9A24B] hover:bg-[#B8912A] text-white text-xs font-bold shadow-sm hover:scale-105 transition-all cursor-pointer"
              >
                <span>{t('onboarding_voice_mode')}</span>
              </button>
            )}

            <Link
              href="/login"
              className="text-xs font-semibold text-[#0B1E33] px-4 py-2 rounded-full border border-[#C9A24B]/40 bg-white hover:bg-[#F5F1E6] transition-all"
            >
              {t('onboarding_login')}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Voice Assistant Modal ─────────────────────────────────── */}
      <VoiceOnboardingModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onSwitchToText={() => setIsVoiceModalOpen(false)}
      />

      {/* ── Main Container (Text Form Fallback & Direct Flow) ─────── */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 flex flex-col justify-center">
        <div className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-6 sm:p-8 shadow-[0_20px_60px_rgba(11,30,51,0.08)] space-y-6 relative">
          {/* Header Banner */}
          <div className="space-y-1 text-center sm:text-left border-b border-[#E5E2E1] pb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-[#0B1E33]/50">
                {t('onboarding_step')} {currentStep} {t('onboarding_of')}
              </span>
              {hasVoiceSupport === false && (
                <span className="text-[11px] bg-[#F5F1E6] text-[#0B1E33]/60 px-2.5 py-0.5 rounded-full border border-[#C9A24B]/20 font-medium">
                  {t('onboarding_text_mode')}
                </span>
              )}
            </div>

            <h1 className="font-['Roboto',sans-serif] text-xl sm:text-2xl font-bold text-[#0B1E33]">
              {t(`onboarding_step${currentStep}_heading`)}
            </h1>
            <p className="text-xs text-[#0B1E33]/50 leading-relaxed">
              {t(`onboarding_step${currentStep}_sub`)}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#F5F1E6] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#C9A24B] h-full transition-all duration-300"
              style={{ width: `${(currentStep / 8) * 100}%` }}
            />
          </div>

          {/* Form Fields */}
          <form onSubmit={handleTextSubmit} className="space-y-5">
            {/* Step 1: Name */}
            {currentStep === 1 && (
              <div className="space-y-2">
                <label htmlFor="name" className="block text-sm font-bold text-[#0B1E33]">
                  {t('onboarding_name_label')} <span className="text-[#FF416C]">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('ph_name')}
                  className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 border border-[#C9A24B]/30 rounded-2xl px-4 py-3 text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] focus:ring-2 focus:ring-[#C9A24B]/20 transition-all"
                  autoFocus
                />
              </div>
            )}

            {/* Step 2: District */}
            {currentStep === 2 && (
              <div className="space-y-2">
                <label htmlFor="district" className="block text-sm font-bold text-[#0B1E33]">
                  {t('onboarding_district_label')} <span className="text-[#FF416C]">*</span>
                </label>
                <input
                  id="district"
                  type="text"
                  required
                  value={formData.district}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  placeholder={t('ph_district')}
                  className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 border border-[#C9A24B]/30 rounded-2xl px-4 py-3 text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] focus:ring-2 focus:ring-[#C9A24B]/20 transition-all"
                  autoFocus
                />
              </div>
            )}

            {/* Step 3: Sector */}
            {currentStep === 3 && (
              <div className="space-y-3">
                <label htmlFor="sector" className="block text-sm font-bold text-[#0B1E33]">
                  {t('onboarding_sector_label')} <span className="text-[#FF416C]">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {/* One language at a time. These labels used to carry Hindi
                      and English together regardless of the toggle, so an
                      English reader met Devanagari and a Hindi reader read
                      every trade twice. */}
                  {(['retail', 'tailoring', 'dairy', 'agriculture', 'food', 'manufacturing', 'services', 'general'] as const).map((id) => ({ id, label: t(`sector_${id}`) })).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, sector: s.id, business_name: s.label })}
                      className={`p-3 rounded-2xl border text-left font-semibold transition-all cursor-pointer ${
                        formData.sector === s.id
                          ? 'bg-[#0B1E33] text-[#F5F1E6] border-[#0B1E33] shadow-sm'
                          : 'bg-[#F5F1E6] border-[#C9A24B]/20 text-[#0B1E33] hover:bg-[#EDE9DA]'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <div className="pt-2">
                  <label htmlFor="customSector" className="block text-xs text-[#0B1E33]/50 mb-1">
                    {t('onboarding_custom_sector')}
                  </label>
                  <input
                    id="customSector"
                    type="text"
                    value={formData.sector}
                    onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                    placeholder={t('ph_sector')}
                    className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 border border-[#C9A24B]/30 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:bg-white focus:border-[#C9A24B] transition-all"
                  />
                </div>
              </div>
            )}

            {/* Step 4: Finances */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="rev" className="block text-sm font-bold text-[#0B1E33]">
                    {t('onboarding_revenue_label')} <span className="text-[#FF416C]">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-[#0B1E33] font-bold">₹</span>
                    <input
                      id="rev"
                      type="number"
                      min="0"
                      required
                      value={formData.monthly_revenue_est || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, monthly_revenue_est: parseFloat(e.target.value) || 0 })
                      }
                      placeholder={t('ph_revenue')}
                      className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 pl-8 pr-4 py-3 border border-[#C9A24B]/30 rounded-2xl text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] transition-all"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="exp" className="block text-sm font-bold text-[#0B1E33]">
                    {t('onboarding_expense_label')} <span className="text-[#FF416C]">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-[#C9A24B] font-bold">₹</span>
                    <input
                      id="exp"
                      type="number"
                      min="0"
                      value={formData.monthly_expense_est || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, monthly_expense_est: parseFloat(e.target.value) || 0 })
                      }
                      placeholder={t('ph_expense')}
                      className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 pl-8 pr-4 py-3 border border-[#C9A24B]/30 rounded-2xl text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] transition-all"
                    />
                  </div>
                </div>

                <p className="sm:col-span-2 flex items-start gap-2 text-xs text-[#0B1E33]/55 bg-[#F5F1E6] border border-[#C9A24B]/20 rounded-2xl px-3.5 py-2.5">
                  <span aria-hidden="true">💡</span>
                  <span>
                    <span className="font-semibold">{t('tip_label')}:</span> {t('hint_money')}
                  </span>
                </p>
              </div>
            )}

            {/* Step 5: Loans */}
            {currentStep === 5 && (
              <div className="space-y-3">
                <label className="block text-sm font-bold text-[#0B1E33]">
                  {t('onboarding_loans_label')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, existing_loans: true })}
                    className={`p-4 rounded-2xl border text-center font-bold text-sm sm:text-base transition-all cursor-pointer ${
                      formData.existing_loans === true
                        ? 'bg-[#0B1E33] text-[#F5F1E6] border-[#0B1E33] shadow-sm'
                        : 'bg-[#F5F1E6] border-[#C9A24B]/20 text-[#0B1E33] hover:bg-[#EDE9DA]'
                    }`}
                  >
                    {t('onboarding_yes_loans')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, existing_loans: false })}
                    className={`p-4 rounded-2xl border text-center font-bold text-sm sm:text-base transition-all cursor-pointer ${
                      formData.existing_loans === false
                        ? 'bg-[#0B1E33] text-[#F5F1E6] border-[#0B1E33] shadow-sm'
                        : 'bg-[#F5F1E6] border-[#C9A24B]/20 text-[#0B1E33] hover:bg-[#EDE9DA]'
                    }`}
                  >
                    {t('onboarding_no_loans')}
                  </button>
                </div>

                {/* How much is outstanding. Only asked once "yes" is chosen:
                    a figure lets the dashboard say what the loan is, not just
                    that one exists. */}
                {formData.existing_loans && (
                  <div className="pt-2">
                    <label htmlFor="loan" className="block text-sm font-bold text-[#0B1E33] mb-1.5">
                      {t('onboarding_loan_amount_label')}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3 text-[#0B1E33] font-bold">₹</span>
                      <input
                        id="loan"
                        type="number"
                        min="0"
                        value={formData.loan_amount || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, loan_amount: parseFloat(e.target.value) || 0 })
                        }
                        placeholder={t('ph_loan_amount')}
                        className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 pl-8 pr-4 py-3 border border-[#C9A24B]/30 rounded-2xl text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] transition-all"
                        autoFocus
                      />
                    </div>
                    <p className="text-[11px] text-[#0B1E33]/50 mt-1.5">{t('onboarding_loan_amount_hint')}</p>

                    <label htmlFor="emi" className="block text-sm font-bold text-[#0B1E33] mb-1.5 mt-4">
                      {t('onboarding_loan_emi_label')}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-3 text-[#0B1E33] font-bold">₹</span>
                      <input
                        id="emi"
                        type="number"
                        min="0"
                        value={formData.loan_monthly_payment || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, loan_monthly_payment: parseFloat(e.target.value) || 0 })
                        }
                        placeholder={t('ph_loan_emi')}
                        className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 pl-8 pr-4 py-3 border border-[#C9A24B]/30 rounded-2xl text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-[#0B1E33]/50 mt-1.5">{t('onboarding_loan_emi_hint')}</p>

                    <label htmlFor="rate" className="block text-sm font-bold text-[#0B1E33] mb-1.5 mt-4">
                      {t('onboarding_loan_rate_label')}
                    </label>
                    <div className="relative">
                      <input
                        id="rate"
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={formData.loan_interest_rate || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, loan_interest_rate: parseFloat(e.target.value) || 0 })
                        }
                        placeholder={t('ph_loan_rate')}
                        className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 pl-4 pr-20 py-3 border border-[#C9A24B]/30 rounded-2xl text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] transition-all"
                      />
                      <span className="absolute right-3.5 top-3 text-sm text-[#0B1E33]/60 font-semibold">{t('per_year_short')}</span>
                    </div>
                    <p className="text-[11px] text-[#0B1E33]/50 mt-1.5">{t('onboarding_loan_rate_hint')}</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 6: Confirmation Summary */}
            {currentStep === 6 && (
              <div className="bg-[#F5F1E6] border border-[#C9A24B]/20 rounded-2xl p-5 space-y-3 text-sm">
                <h3 className="font-bold text-[#0B1E33] text-xs uppercase tracking-wider border-b border-[#C9A24B]/20 pb-2">
                  {t('onboarding_summary_label')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">{t('onboarding_name_field')}</span>
                    <strong className="text-[#0B1E33] text-base">{formData.name}</strong>
                  </div>
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">{t('onboarding_location_field')}</span>
                    <strong className="text-[#0B1E33] text-base">{formData.district}</strong>
                  </div>
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">{t('onboarding_sector_field')}</span>
                    <strong className="text-[#0B1E33] text-base capitalize">{formData.sector}</strong>
                  </div>
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">{t('onboarding_loan_field')}</span>
                    <strong className={formData.existing_loans ? 'text-[#FF416C]' : 'text-emerald-700'}>
                      {formData.existing_loans
                        ? [
                            t('summary_loan_yes'),
                            (formData.loan_amount ?? 0) > 0 ? `₹${(formData.loan_amount ?? 0).toLocaleString('en-IN')}` : null,
                            (formData.loan_monthly_payment ?? 0) > 0
                              ? `₹${(formData.loan_monthly_payment ?? 0).toLocaleString('en-IN')}${t('per_month_short')}`
                              : null,
                            (formData.loan_interest_rate ?? 0) > 0
                              ? `${formData.loan_interest_rate}% ${t('per_year_short')}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : t('summary_loan_no')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">{t('onboarding_revenue_field')}</span>
                    <strong className="text-[#0B1E33] text-base font-bold">
                      ₹{formData.monthly_revenue_est.toLocaleString('en-IN')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">{t('onboarding_expense_field')}</span>
                    <strong className="text-[#C9A24B] text-base font-bold">
                      ₹{formData.monthly_expense_est.toLocaleString('en-IN')}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* Step 7: Email, Password & Google Auth Link */}
            {currentStep === 7 && (
              <div className="space-y-4">
                {authUserEmail ? (
                  <div className="p-4 rounded-2xl bg-[#F5F1E6] border border-[#C9A24B]/20 text-[#0B1E33] text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">✅</span>
                      <div>
                        <p className="font-bold text-[#0B1E33]">{t('onboarding_account_linked')}</p>
                        <p className="text-xs text-[#0B1E33]/50 font-mono">{authUserEmail}</p>
                      </div>
                    </div>
                    <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border border-emerald-200">
                      {t('onboarding_verified')}
                    </span>
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="email" className="block text-sm font-bold text-[#0B1E33] mb-1.5">
                        {t('onboarding_email_label')} <span className="text-[#FF416C]">*</span>
                      </label>
                      <input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full bg-[#F4F3EF] text-[#151515] placeholder-[#8C8880] border border-[#E5E2E1] rounded-2xl px-4 py-3 text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#151515]"
                        autoFocus
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="password" className="block text-sm font-bold text-[#0B1E33]">
                          {t('onboarding_password_label')} <span className="text-[#FF416C]">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-xs text-[#0B1E33]/50 hover:text-[#C9A24B] font-medium cursor-pointer transition-colors"
                        >
                          {showPassword ? t('onboarding_hide') : t('onboarding_show')}
                        </button>
                      </div>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#F4F3EF] text-[#151515] placeholder-[#8C8880] border border-[#E5E2E1] rounded-2xl px-4 py-3 text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#151515]"
                      />
                      <p className="text-xs text-[#0B1E33]/50 mt-1">
                        {t('onboarding_min6')}
                      </p>
                    </div>

                    <p className="text-xs text-[#0B1E33]/50">
                      {t('onboarding_email_helper')}
                    </p>

                    <div className="relative my-3 text-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-[#C9A24B]/20" />
                      </div>
                      <span className="relative bg-white px-3 text-xs text-[#0B1E33]/50 font-bold uppercase">
                        {t('onboarding_or')}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isGoogleLoading}
                      className="w-full cursor-pointer bg-white hover:bg-[#F5F1E6] active:scale-[0.99] text-[#0B1E33] font-bold py-3 px-4 rounded-full flex items-center justify-center gap-3 transition-all shadow-sm disabled:opacity-60 border border-[#C9A24B]/30"
                    >
                      {isGoogleLoading ? (
                        <span className="text-sm font-semibold text-[#0B1E33]">{t('onboarding_google_loading')}</span>
                      ) : (
                        <>
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                          </svg>
                          <span className="text-sm font-bold text-[#0B1E33]">
                            {t('onboarding_google')}
                          </span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Step 8: DPDP Act Consent */}
            {currentStep === 8 && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-[#F5F1E6] border border-[#C9A24B]/20 space-y-2.5">
                  <div className="flex items-center gap-2 text-[#0B1E33] font-bold text-sm">
                    <span className="text-lg">🛡️</span>
                    <span>{t('onboarding_consent_title')}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#0B1E33]/60 leading-relaxed">
                    <br />
                    {t('onboarding_consent_text')}
                  </p>
                </div>

                <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-white border border-[#C9A24B]/20 cursor-pointer hover:border-[#C9A24B] transition-colors">
                  <input
                    type="checkbox"
                    required
                    checked={formData.consent_given}
                    onChange={(e) => setFormData({ ...formData, consent_given: e.target.checked })}
                    className="w-5 h-5 mt-0.5 rounded accent-[#C9A24B] focus:ring-[#C9A24B]/20 border-[#C9A24B]/30"
                  />
                  <span className="text-xs sm:text-sm text-[#0B1E33] font-medium leading-relaxed">
                    {t('onboarding_consent_check')}
                  </span>
                </label>
              </div>
            )}

            {/* Error Message Display */}
            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Button Controls */}
            <div className="flex items-center justify-between pt-4 border-t border-[#C9A24B]/15">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setCurrentStep((prev) => prev - 1);
                  }}
                  className="px-5 py-2.5 rounded-full bg-[#F5F1E6] hover:bg-[#EDE9DA] text-[#0B1E33] text-xs sm:text-sm font-semibold border border-[#C9A24B]/30 transition-all cursor-pointer"
                >
                  {t('onboarding_back')}
                </button>
              ) : (
                <Link
                  href="/"
                  className="text-xs text-[#0B1E33]/50 hover:text-[#151515] underline"
                >
                  {t('onboarding_home')}
                </Link>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-7 sm:px-9 py-3 rounded-full bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] text-xs sm:text-sm font-bold shadow-[0_4px_20px_rgba(11,30,51,0.20)] hover:opacity-95 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting
                  ? '⏳ खाता तैयार हो रहा है...'
                  : currentStep === 8
                  ? t('onboarding_complete')
                  : t('onboarding_next')}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E5E2E1] py-4 text-center text-xs text-[#0B1E33]/50">
        {t('onboarding_footer')}
      </footer>
    </div>
  );
}
