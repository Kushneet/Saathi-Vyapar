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

export default function OnboardingPage() {
  const router = useRouter();

  // Browser voice support state
  const [hasVoiceSupport] = useState<boolean | null>(() =>
    typeof window !== 'undefined'
      ? 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
      : false
  );
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(() =>
    typeof window !== 'undefined'
      ? 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
      : false
  );

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
      setErrorMessage('कृपया अपना नाम दर्ज करें (Please enter your name)');
      return;
    }

    if (currentStep === 2 && !formData.district.trim()) {
      setErrorMessage('कृपया अपना Village or District दर्ज करें (Please enter district)');
      return;
    }

    if (currentStep === 3 && !formData.sector.trim()) {
      setErrorMessage('कृपया अपने काम या व्यापार का क्षेत्र चुनें या लिखें');
      return;
    }

    if (currentStep === 4) {
      if (formData.monthly_revenue_est <= 0) {
        setErrorMessage('कृपया अनुमानित मासिक कमाई (Revenue) दर्ज करें');
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
        setErrorMessage('कृपया अपना ईमेल और पासवर्ड दर्ज करें अथवा Google से जारी रखें (Please enter email & password or continue with Google)');
        return;
      }

      if (password.length < 6) {
        setErrorMessage('पासवर्ड कम से कम 6 अक्षरों का होना चाहिए (Password must be at least 6 characters)');
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
        setErrorMessage('डेटा सुरक्षा (DPDP Act) सहमति आवश्यक है');
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
    <div className="min-h-screen bg-[#F5F1E6] text-[#0B1E33] font-['Inter',sans-serif] flex flex-col justify-between relative overflow-hidden">
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
            {hasVoiceSupport && (
              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#C9A24B] hover:bg-[#B8912A] text-white text-xs font-bold shadow-sm hover:scale-105 transition-all cursor-pointer"
              >
                <span>🎙️ बोलकर भरें</span>
                <span className="hidden sm:inline">(Voice Mode)</span>
              </button>
            )}

            <Link
              href="/login"
              className="text-xs font-semibold text-[#0B1E33] px-4 py-2 rounded-full border border-[#C9A24B]/40 bg-white hover:bg-[#F5F1E6] transition-all"
            >
              Sign In
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
                चरण {currentStep} / 8 • Step {currentStep} of 8
              </span>
              {hasVoiceSupport === false && (
                <span className="text-[11px] bg-[#F5F1E6] text-[#0B1E33]/60 px-2.5 py-0.5 rounded-full border border-[#C9A24B]/20 font-medium">
                  टेक्स्ट मोड (Standard Mode)
                </span>
              )}
            </div>

            <h1 className="font-['Playfair_Display',Georgia,serif] text-xl sm:text-2xl font-bold text-[#0B1E33]">
              {currentStep === 1 && '1. आपका शुभ नाम क्या है?'}
              {currentStep === 2 && '2. आपका Village or District कौन सा है?'}
              {currentStep === 3 && '3. आप क्या काम या व्यापार करते हैं?'}
              {currentStep === 4 && '4. मासिक कमाई और खर्च का विवरण'}
              {currentStep === 5 && '5. क्या आपके ऊपर कोई पुराना लोन या कर्ज है?'}
              {currentStep === 6 && '6. विवरण की पुष्टि करें'}
              {currentStep === 7 && '7. अपना ईमेल और पासवर्ड दर्ज करें'}
              {currentStep === 8 && '8. डेटा सुरक्षा सहमति (DPDP Act)'}
            </h1>
            <p className="text-xs text-[#0B1E33]/50 leading-relaxed">
              {currentStep === 1 && 'What is your full name?'}
              {currentStep === 2 && 'Which village or district are you located in?'}
              {currentStep === 3 && 'What trade or work do you do? (e.g. Kirana, Tailoring, Dairy...)'}
              {currentStep === 4 && 'Roughly how much do you earn and spend monthly in ₹?'}
              {currentStep === 5 && 'Do you have any existing loans or debts?'}
              {currentStep === 6 && 'Review your business profile summary'}
              {currentStep === 7 && 'Enter your email & password or sign in with Google'}
              {currentStep === 8 && 'Plain-language consent before saving data'}
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
                  उद्यमी का नाम / Full Name <span className="text-[#FF416C]">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="उदा. रमेश कुमार (e.g. Ramesh Kumar)"
                  className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 border border-[#C9A24B]/30 rounded-2xl px-4 py-3 text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] focus:ring-2 focus:ring-[#C9A24B]/20 transition-all"
                  autoFocus
                />
              </div>
            )}

            {/* Step 2: District */}
            {currentStep === 2 && (
              <div className="space-y-2">
                <label htmlFor="district" className="block text-sm font-bold text-[#0B1E33]">
                  Village / District / Village or District <span className="text-[#FF416C]">*</span>
                </label>
                <input
                  id="district"
                  type="text"
                  required
                  value={formData.district}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  placeholder="उदा. वाराणसी, उत्तर प्रदेश (e.g. Varanasi)"
                  className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 border border-[#C9A24B]/30 rounded-2xl px-4 py-3 text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] focus:ring-2 focus:ring-[#C9A24B]/20 transition-all"
                  autoFocus
                />
              </div>
            )}

            {/* Step 3: Sector */}
            {currentStep === 3 && (
              <div className="space-y-3">
                <label htmlFor="sector" className="block text-sm font-bold text-[#0B1E33]">
                  व्यापार का क्षेत्र / Business Sector <span className="text-[#FF416C]">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'retail', label: '🛒 किराना / दुकान (Retail)' },
                    { id: 'tailoring', label: '🧵 सिलाई / वस्त्र (Tailoring)' },
                    { id: 'dairy', label: '🥛 डेयरी / पशुपालन (Dairy)' },
                    { id: 'agriculture', label: '🌾 खेती / किसानी (Farming)' },
                    { id: 'food', label: '🍲 खाना / चाय नाश्ता (Food)' },
                    { id: 'manufacturing', label: '🔨 निर्माण / कारीगरी (Crafts)' },
                    { id: 'services', label: '🔧 मरम्मत / सेवाएं (Services)' },
                    { id: 'general', label: '📦 अन्य व्यापार (General)' },
                  ].map((s) => (
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
                    या विवरण खुद लिखें (Or type custom trade):
                  </label>
                  <input
                    id="customSector"
                    type="text"
                    value={formData.sector}
                    onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                    placeholder="उदा. स्टेशनरी और फोटोकॉपी दुकान"
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
                    औसत मासिक कमाई (बिक्री) / Monthly Revenue (₹) <span className="text-[#FF416C]">*</span>
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
                      placeholder="उदा. 25000"
                      className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 pl-8 pr-4 py-3 border border-[#C9A24B]/30 rounded-2xl text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] transition-all"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="exp" className="block text-sm font-bold text-[#0B1E33]">
                    औसत Monthly Expense / Monthly Expenses (₹) <span className="text-[#FF416C]">*</span>
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
                      placeholder="उदा. 15000"
                      className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 pl-8 pr-4 py-3 border border-[#C9A24B]/30 rounded-2xl text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] transition-all"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Loans */}
            {currentStep === 5 && (
              <div className="space-y-3">
                <label className="block text-sm font-bold text-[#0B1E33]">
                  क्या आपके ऊपर कोई सक्रिय बैंक या समूह का लोन है? / Any Existing Loans?
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
                    हाँ (Yes, have loans)
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
                    नहीं (No loans)
                  </button>
                </div>
              </div>
            )}

            {/* Step 6: Confirmation Summary */}
            {currentStep === 6 && (
              <div className="bg-[#F5F1E6] border border-[#C9A24B]/20 rounded-2xl p-5 space-y-3 text-sm">
                <h3 className="font-bold text-[#0B1E33] text-xs uppercase tracking-wider border-b border-[#C9A24B]/20 pb-2">
                  📋 आपके व्यापार का सारांश (Profile Summary)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">उद्यमी का नाम:</span>
                    <strong className="text-[#0B1E33] text-base">{formData.name}</strong>
                  </div>
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">स्थान (जिला):</span>
                    <strong className="text-[#0B1E33] text-base">{formData.district}</strong>
                  </div>
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">व्यवसाय का क्षेत्र:</span>
                    <strong className="text-[#0B1E33] text-base capitalize">{formData.sector}</strong>
                  </div>
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">सक्रिय लोन:</span>
                    <strong className={formData.existing_loans ? 'text-[#FF416C]' : 'text-emerald-700'}>
                      {formData.existing_loans ? 'हाँ (Active Loan)' : 'नहीं (No Loans)'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">मासिक बिक्री (कमाई):</span>
                    <strong className="text-[#0B1E33] text-base font-bold">
                      ₹{formData.monthly_revenue_est.toLocaleString('en-IN')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#0B1E33]/50 block text-xs">Monthly Expense:</span>
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
                        <p className="font-bold text-[#0B1E33]">खाता लिंक हो चुका है (Account Linked)</p>
                        <p className="text-xs text-[#0B1E33]/50 font-mono">{authUserEmail}</p>
                      </div>
                    </div>
                    <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border border-emerald-200">
                      सत्यापित / Linked
                    </span>
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="email" className="block text-sm font-bold text-[#0B1E33] mb-1.5">
                        Email Address <span className="text-[#FF416C]">*</span>
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
                          Password <span className="text-[#FF416C]">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-xs text-[#0B1E33]/50 hover:text-[#C9A24B] font-medium cursor-pointer transition-colors"
                        >
                          {showPassword ? 'छुपाएं (Hide)' : 'दिखाएं (Show)'}
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
                        न्यूनतम 6 अक्षर (Minimum 6 characters)
                      </p>
                    </div>

                    <p className="text-xs text-[#0B1E33]/50">
                      इस ईमेल व पासवर्ड अथवा Google खाते से आप भविष्य में कभी भी सुरक्षित रूप से लॉगिन कर सकेंगे।
                    </p>

                    <div className="relative my-3 text-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-[#C9A24B]/20" />
                      </div>
                      <span className="relative bg-white px-3 text-xs text-[#0B1E33]/50 font-bold uppercase">
                        या / OR
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isGoogleLoading}
                      className="w-full cursor-pointer bg-white hover:bg-[#F5F1E6] active:scale-[0.99] text-[#0B1E33] font-bold py-3 px-4 rounded-full flex items-center justify-center gap-3 transition-all shadow-sm disabled:opacity-60 border border-[#C9A24B]/30"
                    >
                      {isGoogleLoading ? (
                        <span className="text-sm font-semibold text-[#0B1E33]">Connecting to Google...</span>
                      ) : (
                        <>
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                          </svg>
                          <span className="text-sm font-bold text-[#0B1E33]">
                            Google से लिंक करें (Continue with Google)
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
                    <span>डेटा सुरक्षा एवं गोपनीयता सहमति (DPDP Act 2023)</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#0B1E33]/60 leading-relaxed">
                    &quot;Do you agree to let us store this information to give you advice?&quot;
                    <br />
                    क्या आप हमें व्यापारिक सलाह (Break-even, Margin) और सरकारी सब्सिडी योजनाएं (PMEGP, Mudra) ढूंढने के लिए यह जानकारी सुरक्षित रूप से सेव करने की अनुमति देते हैं?
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
                    हाँ, मैं अपनी जानकारी सुरक्षित रूप से सेव करने की अनुमति देता/देती हूँ। (I give consent to store my data)
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
                  ← पिछला (Back)
                </button>
              ) : (
                <Link
                  href="/"
                  className="text-xs text-[#0B1E33]/50 hover:text-[#151515] underline"
                >
                  होमपेज (Home)
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
                  ? 'सहमति दें और खाता बनाएं (Complete) →'
                  : 'आगे बढ़ें (Next) →'}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-[#E5E2E1] py-4 text-center text-xs text-[#0B1E33]/50">
        Saathi Vyapar • सुरक्षित एवं पारदर्शी ग्रामीण वित्तीय प्रणाली
      </footer>
    </div>
  );
}
