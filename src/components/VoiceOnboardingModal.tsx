'use client';

/**
 * src/components/VoiceOnboardingModal.tsx
 *
 * Conversational Voice Onboarding Modal using Web Speech API:
 * - SpeechRecognition (listening) & SpeechSynthesis (speaking back)
 * - Detects browser compatibility ('webkitSpeechRecognition' in window)
 * - 8-Step Conversational State Machine with DPDP Act consent enforcement
 * - Sends transcripts to /api/onboarding/parse (Gemini-powered extraction)
 * - Saves via /api/onboarding/complete and redirects to /dashboard
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

export type OnboardingStep =
  | 'auth'
  | 'name'
  | 'district'
  | 'sector'
  | 'finances'
  | 'loans'
  | 'confirmation'
  | 'consent'
  | 'complete';

export interface OnboardingData {
  user_id?: string;
  email?: string;
  phone?: string;
  name: string;
  district: string;
  state?: string;
  sector: string;
  business_name?: string;
  monthly_revenue_est: number;
  monthly_expense_est: number;
  existing_loans: boolean;
  /** Outstanding amount across all loans; only meaningful when existing_loans is true. */
  loan_amount?: number;
  /** What goes out every month towards those loans (EMI). */
  loan_monthly_payment?: number;
  /** Percent per year. */
  loan_interest_rate?: number;
  consent_given: boolean;
}

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: { [index: number]: SpeechRecognitionResultItem };
}

interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface ISpeechRecognitionErrorEvent {
  error: string;
}

interface ISpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => ISpeechRecognitionInstance;

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

interface VoiceOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToText?: () => void;
}

// Step prompts in Hindi & English
const STEP_PROMPTS: Record<
  OnboardingStep,
  { hi: string; en: string; short: { hi: string; en: string }; fieldLabel: string }
> = {
  auth: {
    hi: 'शुरू करने से पहले, कृपया अपना 10 अंकों का मोबाइल नंबर दर्ज करें या बोलें।',
    en: 'Before we begin, please enter or speak your 10-digit mobile number.',
    short: { hi: 'मोबाइल नंबर', en: 'Mobile number' },
    fieldLabel: 'मोबाइल नंबर',
  },
  name: {
    hi: 'नमस्ते! आपका साथी व्यापार में स्वागत है। आपका शुभ नाम क्या है?',
    en: 'Hello! Welcome to Saathi Vyapar. What is your name?',
    short: { hi: 'आपका नाम', en: 'Your name' },
    fieldLabel: 'उद्यमी का नाम',
  },
  district: {
    hi: 'धन्यवाद! आप किस गांव या जिले में रहते हैं?',
    en: 'Thank you! Which village or district are you located in?',
    short: { hi: 'गाँव या ज़िला', en: 'Village or district' },
    fieldLabel: 'गांव / जिला',
  },
  sector: {
    hi: 'आपका क्या काम या व्यापार है? जैसे: किराना दुकान, सिलाई, खेती, डेयरी या कोई अन्य व्यवसाय?',
    en: 'What trade or work do you do? (e.g., kirana shop, tailoring, farming, dairy, etc.)',
    short: { hi: 'आपका काम', en: 'Your trade' },
    fieldLabel: 'व्यवसाय का क्षेत्र',
  },
  finances: {
    hi: 'हर महीने आपकी लगभग कितनी कमाई और कितना खर्च होता है? (जैसे: कमाई 25000 और खर्च 15000)',
    en: 'Roughly how much do you earn and spend monthly? (e.g. earn 25000 and spend 15000)',
    short: { hi: 'मासिक कमाई और खर्च', en: 'Monthly income and costs' },
    fieldLabel: 'कमाई और खर्च',
  },
  loans: {
    hi: 'क्या आपके ऊपर पहले से कोई बैंक या समूह का लोन या पुराना कर्ज है? बोलें हाँ या नहीं।',
    en: 'Do you have any existing loans or debts? Please say yes or no.',
    short: { hi: 'पुराना कर्ज़', en: 'Existing loans' },
    fieldLabel: 'पुराना कर्ज़',
  },
  confirmation: {
    hi: 'कृपया जांचें: क्या आपकी सभी जानकारी सही है? आगे बढ़ने के लिए "हाँ" बोलें या पुष्टि करें।',
    en: 'Please check if your summary is correct. Say "yes" or tap confirm to proceed.',
    short: { hi: 'जानकारी की पुष्टि', en: 'Check your details' },
    fieldLabel: 'सारांश पुष्टि',
  },
  consent: {
    hi: 'क्या आप हमें व्यापारिक सलाह और सरकारी योजनाएं ढूंढने के लिए यह जानकारी सुरक्षित रूप से सेव करने की अनुमति देते हैं? आगे बढ़ने के लिए "हाँ" बोलें या सहमति दें।',
    en: 'Do you agree to let us store this information to give you financial advice? Say or tap yes to continue.',
    short: { hi: 'आपकी अनुमति', en: 'Your permission' },
    fieldLabel: 'डेटा सुरक्षा सहमति',
  },
  complete: {
    hi: 'बधाई हो! आपका वित्तीय खाता तैयार हो रहा है। हम आपको डैशबोर्ड पर ले जा रहे हैं...',
    en: 'Congratulations! Your profile is saved. Redirecting to your dashboard...',
    short: { hi: 'हो गया', en: 'Done' },
    fieldLabel: 'खाता तैयार है',
  },
};

export default function VoiceOnboardingModal({
  isOpen,
  onClose,
  onSwitchToText,
}: VoiceOnboardingModalProps) {
  const { language, t } = useLanguage();
  const router = useRouter();

  // Current conversational step
  const [step, setStep] = useState<OnboardingStep>('name');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<OnboardingData>({
    name: '',
    district: '',
    sector: '',
    business_name: '',
    monthly_revenue_est: 0,
    monthly_expense_est: 0,
    existing_loans: false,
    consent_given: false,
    phone: '',
  });

  // Direct text edit state for current step
  const [manualInput, setManualInput] = useState('');

  // Speech API references
  const recognitionRef = useRef<ISpeechRecognitionInstance | null>(null);

  const changeStep = useCallback((newStep: OnboardingStep) => {
    setStep(newStep);
    setManualInput('');
    setLiveTranscript('');
    setErrorMessage(null);
  }, []);

  // 1. Initial Session Check on Mount / Open
  useEffect(() => {
    if (!isOpen) return;

    async function checkAuth() {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        if (session?.user) {
          setFormData((prev) => ({
            ...prev,
            user_id: session.user.id,
            phone: session.user.phone || prev.phone,
          }));
          changeStep('name');
        } else {
          // If no active session, start with auth step or name
          changeStep('auth');
        }
      } catch (err) {
        console.warn('Session check error:', err);
      }
    }

    checkAuth();
  }, [isOpen, changeStep]);

  // Stop speaking on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // 2. Speech Synthesis: Speak Assistant Prompt
  const speakText = useCallback(
    (text: string, onDone?: () => void) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        if (onDone) onDone();
        return;
      }

      const synth = window.speechSynthesis;
      synth.cancel(); // Stop any ongoing speech

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      // Pick Hindi or Indian English voice if available
      const voices = synth.getVoices();
      const preferredVoice = voices.find(
        (v) =>
          v.lang.toLowerCase().includes('hi-in') ||
          v.lang.toLowerCase().includes('hi') ||
          v.lang.toLowerCase().includes('en-in')
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';

      utterance.onstart = () => {
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        if (onDone) onDone();
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        if (onDone) onDone();
      };

      synth.speak(utterance);
    },
    [language]
  );

  // 3. Speech Recognition: Start Listening
  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return;

    const win = window as unknown as WindowWithSpeech;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage('Web Speech API is not supported in this browser. Please use text mode.');
      return;
    }

    // Stop speaking before listening
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      // en-IN still handles Hinglish well; hi-IN stays the default for Hindi.
      recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMessage(null);
        setLiveTranscript('');
      };

      recognition.onresult = (event: ISpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setLiveTranscript(transcript);
        setManualInput(transcript);
      };

      recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'no-speech') {
          setErrorMessage('कोई आवाज़ सुनाई नहीं दी। कृपया फिर से बोलें या नीचे लिखें।');
        } else if (event.error === 'not-allowed') {
          setErrorMessage('माइक्रोफ़ोन की अनुमति अस्वीकृत है। कृपया टेक्स्ट मोड का उपयोग करें।');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  }, [language]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  }, []);

  // 4. Trigger voice question whenever step changes
  useEffect(() => {
    if (!isOpen) return;

    const promptObj = STEP_PROMPTS[step];
    if (!promptObj) return;

    let speechText = language === 'hi' ? promptObj.hi : promptObj.en;

    if (step === 'confirmation') {
      const loanText = formData.existing_loans ? 'सक्रिय लोन है' : 'कोई लोन नहीं';
      speechText = `कृपया पुष्टि करें: नाम ${formData.name}, जिला ${formData.district}, व्यवसाय ${formData.sector}, मासिक कमाई ₹${formData.monthly_revenue_est.toLocaleString('en-IN')}, खर्च ₹${formData.monthly_expense_est.toLocaleString('en-IN')}, और ${loanText}। क्या यह सही है?`;
    }

    // Speak prompt, then automatically listen
    speakText(speechText, () => {
      // Auto-listen after prompt completes
      if (step !== 'complete') {
        startListening();
      }
    });
  }, [
    step,
    language,
    isOpen,
    speakText,
    startListening,
    formData.existing_loans,
    formData.name,
    formData.district,
    formData.sector,
    formData.monthly_revenue_est,
    formData.monthly_expense_est,
  ]);

  // 5. Send Transcript to /api/onboarding/parse
  async function processUserAnswer(rawInput: string) {
    if (!rawInput.trim()) {
      setErrorMessage('कृपया अपना उत्तर बोलें या टाइप करें।');
      return;
    }

    stopListening();
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/onboarding/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step,
          transcript: rawInput.trim(),
          currentData: formData,
        }),
      });

      const data = await response.json();
      const parsed = data.parsed || {};

      // Update state based on current step
      if (step === 'auth') {
        const phoneClean = rawInput.replace(/\D/g, '');
        if (phoneClean.length >= 10) {
          setFormData((prev) => ({ ...prev, phone: phoneClean.slice(-10) }));
          changeStep('name');
        } else {
          setErrorMessage('कृपया वैध 10 अंकों का मोबाइल नंबर दर्ज करें।');
        }
      } else if (step === 'name') {
        const nameVal = parsed.name || rawInput.trim();
        if (nameVal) {
          setFormData((prev) => ({ ...prev, name: nameVal }));
          changeStep('district');
        } else {
          setErrorMessage('नाम समझ नहीं आया। कृपया दोबारा बोलें।');
        }
      } else if (step === 'district') {
        const distVal = parsed.district || parsed.village || rawInput.trim();
        if (distVal) {
          setFormData((prev) => ({ ...prev, district: distVal }));
          changeStep('sector');
        } else {
          setErrorMessage('स्थान समझ नहीं आया। कृपया दोबारा बोलें।');
        }
      } else if (step === 'sector') {
        const sectorVal = parsed.sector || parsed.business_name || rawInput.trim();
        if (sectorVal) {
          setFormData((prev) => ({
            ...prev,
            sector: sectorVal,
            business_name: parsed.business_name || sectorVal,
          }));
          changeStep('finances');
        } else {
          setErrorMessage('व्यवसाय समझ नहीं आया। कृपया दोबारा बताएं।');
        }
      } else if (step === 'finances') {
        const rev = parsed.monthly_revenue_est ?? parseFloat(rawInput.replace(/[^\d.]/g, ''));
        const exp = parsed.monthly_expense_est ?? 0;
        if (!isNaN(rev) && rev > 0) {
          setFormData((prev) => ({
            ...prev,
            monthly_revenue_est: rev,
            monthly_expense_est: !isNaN(exp) ? exp : 0,
          }));
          changeStep('loans');
        } else {
          setErrorMessage('कृपया कमाई की संख्या स्पष्ट बताएं (जैसे: 25000)।');
        }
      } else if (step === 'loans') {
        const hasLoan = parsed.existing_loans !== undefined ? Boolean(parsed.existing_loans) : /yes|haan|हाँ/i.test(rawInput);
        setFormData((prev) => ({ ...prev, existing_loans: hasLoan }));
        changeStep('confirmation');
      } else if (step === 'confirmation') {
        const confirmed = parsed.confirmed !== undefined ? Boolean(parsed.confirmed) : /yes|haan|हाँ|theek|sahi/i.test(rawInput);
        if (confirmed) {
          changeStep('consent');
        } else {
          // Restart to allow corrections
          setErrorMessage('विवरण बदलने के लिए नाम से दोबारा शुरू करते हैं।');
          changeStep('name');
        }
      } else if (step === 'consent') {
        const consent = parsed.consent_given !== undefined ? Boolean(parsed.consent_given) : /yes|haan|हाँ|agree/i.test(rawInput);
        if (consent) {
          setFormData((prev) => ({ ...prev, consent_given: true }));
          await handleFinalSave({ ...formData, consent_given: true });
        } else {
          setErrorMessage('बिना आपकी अनुमति के हम जानकारी सेव नहीं कर सकते।');
        }
      }
    } catch (err) {
      console.error('Extraction error:', err);
      setErrorMessage('सर्वर से उत्तर प्राप्त करने में दिक्कत हुई। कृपया दोबारा प्रयास करें।');
    } finally {
      setIsProcessing(false);
    }
  }

  // 6. Complete Registration & DPDP Act Verified Save
  async function handleFinalSave(finalData: OnboardingData) {
    if (!finalData.consent_given) {
      setErrorMessage('DPDP Act सहमति आवश्यक है।');
      return;
    }

    changeStep('complete');
    setIsProcessing(true);

    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to save onboarding data');
      }

      // Speak success
      speakText('बधाई हो! आपकी जानकारी सेव हो गई है। हम आपके लिए वित्तीय रिपोर्ट खोल रहे हैं।');

      // Redirect to dashboard
      setTimeout(() => {
        onClose();
        router.push(resData.redirectUrl || `/dashboard?user_id=${resData.userId}`);
        router.refresh();
      }, 2000);
    } catch (err: unknown) {
      console.error('Final save error:', err);
      const errMsg = err instanceof Error ? err.message : 'प्रोफाइल सेव करने में त्रुटि हुई।';
      setErrorMessage(errMsg);
      changeStep('consent');
    } finally {
      setIsProcessing(false);
    }
  }

  if (!isOpen) return null;

  const currentPrompt = STEP_PROMPTS[step];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-[#F5F1E6]/96 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-6 text-[#0B1E33] font-['Open_Sans',sans-serif] animate-in fade-in duration-200 selection:bg-[#0B1E33] selection:text-white"
    >
      {/* ── Top Header ────────────────────────────────────────────── */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between border-b border-[#C9A24B]/20 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#C9A24B] to-[#B8912A] text-white flex items-center justify-center font-black text-xl shadow-sm">
            🎙️
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#0B1E33] flex items-center gap-2">
              {t('voice_title')}
              <span className="text-[10px] font-bold bg-[#F5F1E6] text-[#0B1E33]/60 px-2.5 py-0.5 rounded-full border border-[#C9A24B]/20">
                {t('voice_dpdp')}
              </span>
            </h2>
            <p className="text-xs text-[#0B1E33]/50">
              {t('voice_step')}: {currentPrompt ? currentPrompt.short[language] : t('voice_step_default')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSwitchToText && (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                }
                stopListening();
                onSwitchToText();
              }}
              className="text-xs text-[#0B1E33] hover:text-black font-semibold px-4 py-2 rounded-full bg-white border border-[#C9A24B]/20 hover:bg-[#F5F1E6] transition-colors cursor-pointer"
            >
              ✍️ टेक्स्ट फॉर्म (Text Mode)
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
              }
              stopListening();
              onClose();
            }}
            className="p-2 rounded-full bg-white hover:bg-[#F5F1E6] text-[#0B1E33] border border-[#C9A24B]/20 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Main Interactive Center ───────────────────────────────── */}
      <div className="max-w-2xl w-full mx-auto my-auto py-4 space-y-6 text-center">
        {/* Step Progress Pills */}
        <div className="flex items-center justify-center gap-1 sm:gap-1.5 overflow-x-auto pb-1">
          {(
            ['auth', 'name', 'district', 'sector', 'finances', 'loans', 'confirmation', 'consent'] as OnboardingStep[]
          ).map((s, idx) => (
            <span
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step
                  ? 'w-8 bg-[#0B1E33]'
                  : idx < ['auth', 'name', 'district', 'sector', 'finances', 'loans', 'confirmation', 'consent'].indexOf(step)
                  ? 'w-4 bg-[#0B1E33]'
                  : 'w-3 bg-[#E5E2E1]'
              }`}
            />
          ))}
        </div>

        {/* Assistant Speaking / Status Banner */}
        <div className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-5 sm:p-6 shadow-[0_12px_36px_rgba(27,27,27,0.06)] space-y-2">
          <div className="flex items-center justify-center gap-2 text-[#0B1E33]/50 text-xs font-bold uppercase tracking-wider">
            {isSpeaking && <span className="w-2.5 h-2.5 rounded-full bg-[#FF416C] animate-ping"></span>}
            {isListening && <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>}
            {isProcessing && <span className="w-2.5 h-2.5 rounded-full bg-[#0B1E33] animate-spin"></span>}
            <span>
              {isSpeaking
                ? '🔊 साथी बोल रहा है...'
                : isListening
                ? '🎙️ सुन रहे हैं...'
                : isProcessing
                ? '⚡ समझ रहे हैं...'
                : '💡 अब आप बोलिए'}
            </span>
          </div>

          <h3 className="text-base sm:text-lg md:text-xl font-bold text-[#0B1E33] leading-relaxed">
            {currentPrompt?.hi}
          </h3>
          <p className="text-xs text-[#0B1E33]/50 font-normal">
            {currentPrompt?.en}
          </p>
        </div>

        {/* Dynamic Summary Card on Step 6 (Confirmation) or Step 7 (Consent) */}
        {(step === 'confirmation' || step === 'consent' || step === 'complete') && (
          <div className="bg-[#F5F1E6] border border-[#C9A24B]/20 rounded-2xl p-4 text-left space-y-2 text-xs sm:text-sm ">
            <h4 className="font-bold text-[#0B1E33] text-xs uppercase tracking-wider border-b border-[#C9A24B]/20 pb-1.5 flex items-center justify-between">
              <span>📋 आपका व्यवसाय प्रोफाइल (Summary)</span>
              <span className="text-[11px] text-[#C9A24B] font-semibold">सत्यापित करने के लिए तैयार</span>
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[#0B1E33] pt-1">
              <div>
                <span className="text-[#0B1E33]/50 block text-[11px]">नाम:</span>
                <strong className="text-[#0B1E33]">{formData.name || '—'}</strong>
              </div>
              <div>
                <span className="text-[#0B1E33]/50 block text-[11px]">स्थान (जिला):</span>
                <strong className="text-[#0B1E33]">{formData.district || '—'}</strong>
              </div>
              <div>
                <span className="text-[#0B1E33]/50 block text-[11px]">व्यवसाय का क्षेत्र:</span>
                <strong className="text-[#0B1E33] capitalize">{formData.sector || '—'}</strong>
              </div>
              <div>
                <span className="text-[#0B1E33]/50 block text-[11px]">पुराना ऋण (Loan):</span>
                <strong className={formData.existing_loans ? 'text-[#C9A24B]' : 'text-emerald-700'}>
                  {formData.existing_loans ? 'हाँ (सक्रिय)' : 'नहीं'}
                </strong>
              </div>
              <div>
                <span className="text-[#0B1E33]/50 block text-[11px]">मासिक कमाई:</span>
                <strong className="text-[#0B1E33]">₹{formData.monthly_revenue_est.toLocaleString('en-IN')}</strong>
              </div>
              <div>
                <span className="text-[#0B1E33]/50 block text-[11px]">मासिक खर्च:</span>
                <strong className="text-[#C9A24B]">₹{formData.monthly_expense_est.toLocaleString('en-IN')}</strong>
              </div>
            </div>
          </div>
        )}

        {/* DPDP Act Consent Explicit Box */}
        {step === 'consent' && (
          <div className="p-4 rounded-2xl bg-[#F5F1E6] border border-[#C9A24B]/20 text-left space-y-2 text-xs">
            <div className="flex items-center gap-2 text-[#0B1E33] font-bold">
              <span>🛡️ DPDP Act 2023 डेटा संरक्षण सहमति</span>
            </div>
            <p className="text-[#0B1E33]/60 leading-relaxed">
              हम आपके डेटा का उपयोग केवल वित्तीय विश्लेषण (Break-even, Margin) और सरकारी योजनाओं (PMEGP, Mudra) की पात्रता जांचने के लिए करते हैं। आपकी जानकारी सुरक्षित है।
            </p>
          </div>
        )}

        {/* Animated Central Mic Trigger Button */}
        {step !== 'complete' && (
          <div className="relative flex flex-col items-center justify-center gap-3">
            <div className="relative flex items-center justify-center">
              {/* Outer Waves */}
              {isListening && (
                <>
                  <div className="absolute w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-rose-500/20 animate-ping" />
                  <div className="absolute w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-rose-500/30 animate-pulse" />
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  if (isListening) {
                    stopListening();
                  } else {
                    startListening();
                  }
                }}
                disabled={isProcessing}
                className={`relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center gap-1 font-black shadow-xl transition-all transform active:scale-95 cursor-pointer ${
                  isListening
                    ? 'bg-rose-500 text-white animate-pulse shadow-[0_0_35px_rgba(244,63,94,0.5)]'
                    : 'bg-gradient-to-tr from-[#C9A24B] to-[#B8912A] text-white hover:scale-105 shadow-[0_4px_25px_rgba(255,65,108,0.35)]'
                }`}
              >
                <svg className="w-8 h-8 sm:w-10 sm:h-10 fill-current" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
                <span className="text-[10px] uppercase tracking-wider">
                  {isListening ? 'सुन रहे हैं...' : 'टैप करके बोलें'}
                </span>
              </button>
            </div>

            {/* Live Transcript / Manual Input Bar */}
            <div className="w-full flex items-center gap-2 pt-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    processUserAnswer(manualInput);
                  }
                }}
                placeholder={
                  liveTranscript ||
                  (step === 'loans'
                    ? 'हाँ या नहीं बोलें या लिखें...'
                    : step === 'finances'
                    ? 'उदा. कमाई 25000 खर्च 15000'
                    : 'बोलें या यहाँ टाइप करें...')
                }
                className="flex-1 bg-white text-[#0B1E33] placeholder-[#8C8880] border border-[#C9A24B]/20 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-[#C9A24B] "
              />
              <button
                type="button"
                onClick={() => processUserAnswer(manualInput)}
                disabled={isProcessing || !manualInput.trim()}
                className="px-5 py-2.5 rounded-full bg-[#0B1E33] hover:bg-[#162D59] disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-sm transition-all hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
              >
                {isProcessing ? '⏳...' : 'आगे बढ़ें →'}
              </button>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-center gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* ── Modal Footer Controls ─────────────────────────────────── */}
      <div className="max-w-4xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#C9A24B]/20 pt-3.5 text-xs text-[#0B1E33]/50">
        <div className="flex items-center gap-2">
          <span>🔒 {t('voice_dpdp')}</span>
        </div>

        <div className="flex items-center gap-3">
          {step !== 'auth' && step !== 'name' && step !== 'complete' && (
            <button
              type="button"
              onClick={() => {
                const stepOrder: OnboardingStep[] = [
                  'auth',
                  'name',
                  'district',
                  'sector',
                  'finances',
                  'loans',
                  'confirmation',
                  'consent',
                ];
                const currentIndex = stepOrder.indexOf(step);
                if (currentIndex > 0) {
                  changeStep(stepOrder[currentIndex - 1]);
                }
              }}
              className="text-[#0B1E33] hover:underline font-semibold cursor-pointer"
            >
              ← पिछला चरण (Back)
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
              }
              stopListening();
              onClose();
            }}
            className="px-5 py-2 rounded-full bg-[#F5F1E6] hover:bg-[#EDE9DA] text-[#0B1E33] text-xs font-semibold border border-[#C9A24B]/20 transition-colors cursor-pointer"
          >
            बंद करें (Close)
          </button>
        </div>
      </div>
    </div>
  );
}
