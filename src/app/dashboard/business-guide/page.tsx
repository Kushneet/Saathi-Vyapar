'use client';

/**
 * src/app/dashboard/business-guide/page.tsx
 *
 * Business Transformation Guide & Roadmap Generator
 *
 * Capabilities:
 * - Text and Native Web Speech API voice input for describing business challenges
 * - Calls /api/business-guide/generate for 5-stage structured roadmap
 * - Displays 5 numbered cards with actionable tasks and impact milestones
 * - Revisit past guides saved in business_guides table
 * - Consistent navy/gold/cream high-contrast design
 */

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSpeechSupported } from '@/lib/hooks/useSpeechSupported';
import LanguageToggleButton from '@/components/LanguageToggleButton';
import { RoadmapStageItem } from '@/app/api/business-guide/generate/route';
import { speakText } from '@/lib/voice/speak';

interface PastGuideItem {
  id: string;
  input_text: string;
  roadmap_json: RoadmapStageItem[];
  created_at: string;
}

const PRESET_CHALLENGES = [
  { id: 'middlemen', icon: '🛒' },
  { id: 'sales', icon: '📉' },
  { id: 'dairy', icon: '🥛' },
  { id: 'tailoring', icon: '🧵' },
] as const;

const STAGE_ICONS: Record<string, string> = {
  'Cost Optimization': '📉',
  'Value Addition': '✨',
  'Direct Market Access': '🎯',
  'Formal Registration': '📜',
  'Scale': '🚀',
};

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface IWindowWithSpeech {
  SpeechRecognition?: new () => {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: () => void;
    onresult: (e: SpeechRecognitionEvent) => void;
    onerror: (e: SpeechRecognitionErrorEvent) => void;
    onend: () => void;
    start: () => void;
    stop: () => void;
  };
  webkitSpeechRecognition?: new () => {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: () => void;
    onresult: (e: SpeechRecognitionEvent) => void;
    onerror: (e: SpeechRecognitionErrorEvent) => void;
    onend: () => void;
    start: () => void;
    stop: () => void;
  };
}

function BusinessGuideContent() {
  const { t, language } = useLanguage();
  const speechLang = language === 'hi' ? 'hi-IN' : 'en-IN';
  const searchParams = useSearchParams();
  const paramUserId = searchParams.get('user_id');

  // User identity state
  const [userId, setUserId] = useState<string | null>(paramUserId);
  const [userName, setUserName] = useState<string>('');
  const [userSector, setUserSector] = useState<string>('');

  // Form input state
  const [challengeText, setChallengeText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active Roadmap & Past Guides
  const [currentRoadmap, setCurrentRoadmap] = useState<RoadmapStageItem[] | null>(null);
  const [pastGuides, setPastGuides] = useState<PastGuideItem[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);

  // Voice Input State
  const [isListening, setIsListening] = useState(false);
  // Read after hydration, not during render: the server has no window, so
  // reading it in useState made the first client render disagree with the
  // server HTML (the mic button) and React threw a hydration error.
  const hasVoiceSupport = useSpeechSupported();
  const recognitionRef = useRef<{ stop: () => void; start?: () => void } | null>(null);

  // Follow-up Q&A State
  const [followupText, setFollowupText] = useState('');
  const [isSubmittingFollowup, setIsSubmittingFollowup] = useState(false);
  const [followupError, setFollowupError] = useState<string | null>(null);
  const [isListeningFollowup, setIsListeningFollowup] = useState(false);
  const [followupHistory, setFollowupHistory] = useState<
    Array<{ id: string; question: string; answer: string }>
  >([]);
  const followupRecognitionRef = useRef<{ stop: () => void; start?: () => void } | null>(null);

  // 1. Fetch User Profile & Past Guides on Mount
  useEffect(() => {
    async function loadData() {
      try {
        // Prefer the signed-in user over the URL. `?user_id=` is only a
        // facilitator hint; RLS decides whether the read is actually allowed.
        let activeUserId: string | null = null;

        {
          const {
            data: { session },
          } = await supabaseClient.auth.getSession();

          if (session?.user) {
            activeUserId = session.user.id;
          } else if (paramUserId) {
            // No session: the only id worth trying is the one in the URL, and
            // RLS will refuse it unless the viewer is entitled to it. The old
            // "fall back to the newest user in the table" branch is gone.
            activeUserId = paramUserId;
          }
        }

        if (activeUserId) {
          setUserId(activeUserId);

          // Header name: previously only ever set by the removed
          // "latest user in the table" branch, so a signed-in user always
          // saw the placeholder.
          const { data: userRow } = await supabaseClient
            .from('users')
            .select('name')
            .eq('id', activeUserId)
            .maybeSingle();

          if (userRow?.name) {
            setUserName(userRow.name);
          }

          // Fetch business profile
          const { data: profile } = await supabaseClient
            .from('business_profiles')
            .select('sector, business_name')
            .eq('user_id', activeUserId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (profile?.sector) {
            setUserSector(profile.sector);
          }

          // Fetch past guides
          const { data: guides } = await supabaseClient
            .from('business_guides')
            .select('*')
            .eq('user_id', activeUserId)
            .order('created_at', { ascending: false });

          if (guides && guides.length > 0) {
            const formatted: PastGuideItem[] = guides.map((g: Record<string, unknown>) => ({
              id: String(g.id),
              input_text: String(g.input_text || ''),
              roadmap_json: g.roadmap_json as RoadmapStageItem[],
              created_at: String(g.created_at || ''),
            }));
            setPastGuides(formatted);
            setCurrentRoadmap(formatted[0].roadmap_json);
            setSelectedGuideId(formatted[0].id);
          }
        }
      } catch (err) {
        console.warn('Initial load error:', err);
      }
    }

    loadData();
  }, [paramUserId]);

  // 2. Voice Input Handler
  function toggleVoiceListening() {
    if (typeof window === 'undefined') return;

    const win = window as unknown as IWindowWithSpeech;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage(t('bg_voice_unsupported'));
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = speechLang;

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMessage(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setChallengeText(transcript);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setIsListening(false);
        if (event.error !== 'no-speech') {
          setErrorMessage(t('bg_mic_error'));
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Speech recognition error:', err);
      setIsListening(false);
    }
  }

  // 3. Spoken Summary: Read out the five stage titles in sequence
  function speakRoadmapSummary(roadmap: RoadmapStageItem[] | null) {
    if (!roadmap || roadmap.length === 0) return;
    const stageTitles = roadmap
      .map((item, idx) => `${t('bg_stage')} ${idx + 1}: ${item.title_hi || item.stage}`)
      .join(language === 'hi' ? '। ' : '. ');
    const spokenMessage = `${t('bg_spoken_intro')} ${stageTitles}${language === 'hi' ? '।' : '.'}`;
    speakText(spokenMessage, speechLang);
  }

  // 4. Generate Roadmap Submit Handler
  async function handleGenerateRoadmap(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeText.trim()) {
      setErrorMessage(t('bg_err_empty'));
      return;
    }

    if (!userId) {
      setErrorMessage(t('bg_err_login'));
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/business-guide/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          challenge_text: challengeText.trim(),
          language,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate transformation roadmap');
      }

      const newRoadmap = data.roadmap as RoadmapStageItem[];
      setCurrentRoadmap(newRoadmap);
      setSelectedGuideId(data.guideId);

      // Speak short summary of the five stage titles in sequence
      speakRoadmapSummary(newRoadmap);

      // Add to past guides list
      const newGuideEntry: PastGuideItem = {
        id: data.guideId || `temp-${Date.now()}`,
        input_text: challengeText.trim(),
        roadmap_json: newRoadmap,
        created_at: data.createdAt || new Date().toISOString(),
      };
      setPastGuides((prev) => [newGuideEntry, ...prev]);
    } catch (err: unknown) {
      console.error('Generate roadmap error:', err);
      setErrorMessage(
        err instanceof Error ? err.message : t('bg_err_generate')
      );
    } finally {
      setIsGenerating(false);
    }
  }

  // 5. Follow-up Voice Input Handler
  function toggleFollowupVoiceListening() {
    if (typeof window === 'undefined') return;

    const win = window as unknown as IWindowWithSpeech;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setFollowupError(t('bg_voice_unsupported'));
      return;
    }

    if (isListeningFollowup) {
      if (followupRecognitionRef.current) {
        try {
          followupRecognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListeningFollowup(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      followupRecognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = speechLang;

      recognition.onstart = () => {
        setIsListeningFollowup(true);
        setFollowupError(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setFollowupText(transcript);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        setIsListeningFollowup(false);
        if (event.error !== 'no-speech') {
          setFollowupError(t('bg_mic_error'));
        }
      };

      recognition.onend = () => {
        setIsListeningFollowup(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Follow-up speech recognition error:', err);
      setIsListeningFollowup(false);
    }
  }

  // 6. Follow-up Submit Handler (Gemini Contextual Q&A)
  async function handleSendFollowup(e?: React.FormEvent, presetQuestion?: string) {
    if (e) e.preventDefault();
    const query = (presetQuestion || followupText).trim();
    if (!query) {
      setFollowupError(t('bg_err_question_empty'));
      return;
    }
    if (!currentRoadmap || currentRoadmap.length === 0) {
      setFollowupError(t('bg_err_no_roadmap'));
      return;
    }

    setIsSubmittingFollowup(true);
    setFollowupError(null);

    try {
      const response = await fetch('/api/business-guide/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roadmap: currentRoadmap,
          question: query,
          user_id: userId,
          language,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to answer follow-up question');
      }

      const answer = (data.answer as string) || '';
      setFollowupHistory((prev) => [
        ...prev,
        { id: `fu-${Date.now()}`, question: query, answer },
      ]);
      setFollowupText('');

      // Automatically speak the response using speakText()
      speakText(answer, speechLang);
    } catch (err: unknown) {
      console.error('Follow-up error:', err);
      setFollowupError(
        err instanceof Error ? err.message : t('bg_err_answer')
      );
    } finally {
      setIsSubmittingFollowup(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F1E6] text-[#0B1E33] font-['Open_Sans',sans-serif] p-3 sm:p-6 pb-24 selection:bg-[#0B1E33] selection:text-white relative overflow-hidden">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(201,162,75,0.07),transparent_70%)] blur-3xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[radial-gradient(circle_at_center,rgba(11,30,51,0.04),transparent_70%)] blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto space-y-8">
        {/* ── Top Header Navigation ────────────────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#C9A24B]/20 pb-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="hover:opacity-80 transition-opacity">
              <img src="/Logo.png" alt="Saathi Vyapar Logo" className="h-10 sm:h-12 w-auto object-contain" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#0B1E33] flex items-center gap-2">
                {t('dashboard_business_guide')}
              </h1>
              <p className="text-xs sm:text-sm text-[#0B1E33]/50 mt-0.5">
                {userName || t('bg_default_name')} • {userSector} • {t('bg_header_tag')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <LanguageToggleButton />
            <Link
              href={`/dashboard${userId ? `?user_id=${userId}` : ''}`}
              className="px-4 py-2 bg-white hover:bg-[#F5F1E6] text-[#0B1E33] text-xs font-semibold rounded-full border border-[#C9A24B]/20 shadow-xs transition-all"
            >
              {t('bg_back')}
            </Link>
          </div>
        </header>

        <main className="space-y-8">
          {/* ── Challenge Input Section ──────────────────────────────── */}
          <section className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-5 sm:p-7 shadow-[0_16px_40px_rgba(11,30,51,0.07)] backdrop-blur-xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-[#F5F1E6] border border-[#C9A24B]/20 rounded-2xl text-2xl shrink-0 shadow-xs">
                💡
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#0B1E33]">
                  {t('bg_challenge_title')}
                </h2>
                <p className="text-xs text-[#0B1E33]/50 mt-0.5">
                  {t('bg_challenge_sub')}
                </p>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-[#0B1E33]/50 uppercase tracking-wider">
                {t('bg_presets')}
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESET_CHALLENGES.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setChallengeText(t(`bg_preset_${preset.id}_text`))}
                    className="px-3.5 py-1.5 rounded-full bg-[#F5F1E6] hover:bg-[#EDE9DA] border border-[#C9A24B]/20 text-xs text-[#0B1E33] font-medium transition-all cursor-pointer"
                  >
                    {preset.icon} {t(`bg_preset_${preset.id}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Input Form */}
            <form onSubmit={handleGenerateRoadmap} className="space-y-3 pt-2">
              <div className="relative">
                <textarea
                  rows={3}
                  required
                  value={challengeText}
                  onChange={(e) => setChallengeText(e.target.value)}
                  placeholder={t('bg_challenge_ph')}
                  className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#8C8880] border border-[#C9A24B]/20 rounded-2xl p-4 text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] transition-all"
                />

                {/* Voice Input Button inside textarea container */}
                {hasVoiceSupport && (
                  <button
                    type="button"
                    onClick={toggleVoiceListening}
                    className={`absolute right-3.5 bottom-3.5 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                      isListening
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-white text-[#0B1E33] border border-[#C9A24B]/20 hover:bg-[#F5F1E6]'
                    }`}
                    title={isListening ? 'Stop listening' : 'Speak your challenge'}
                  >
                    <span>🎙️</span>
                    <span>{isListening ? t('bg_listening') : t('bg_speak')}</span>
                  </button>
                )}
              </div>

              {errorMessage && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-[#0B1E33]/50">
                  {t('bg_privacy_note')}
                </span>

                <button
                  type="submit"
                  disabled={isGenerating || !challengeText.trim()}
                  className="w-full sm:w-auto px-7 py-3 rounded-full bg-[#0B1E33] text-white text-sm font-bold shadow-sm hover:opacity-95 active:scale-95 transition-all disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {isGenerating ? t('bg_generating') : t('bg_generate')}
                </button>
              </div>
            </form>
          </section>

          {/* ── Past Guides Revisit Tabs ─────────────────────────────── */}
          {pastGuides.length > 1 && (
            <section className="bg-white border border-[#C9A24B]/20 rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold text-[#0B1E33] uppercase tracking-wider flex items-center gap-1.5">
                <span>{t('bg_saved')}</span>
              </span>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {pastGuides.map((g, idx) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setCurrentRoadmap(g.roadmap_json);
                      setSelectedGuideId(g.id);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer ${
                      selectedGuideId === g.id
                        ? 'bg-[#0B1E33] text-white border-[#151515] font-bold shadow-xs'
                        : 'bg-[#F5F1E6] text-[#0B1E33]/60 border-[#C9A24B]/20 hover:bg-[#EDE9DA]'
                    }`}
                  >
                    {t('bg_plan')} {pastGuides.length - idx} (
                    {new Date(g.created_at).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', {
                      month: 'short',
                      day: 'numeric',
                    })}
                    )
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── 5 Numbered Roadmap Cards Display ─────────────────────── */}
          {currentRoadmap && currentRoadmap.length === 5 && (
            <section className="space-y-5 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#C9A24B]/20 pb-3">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-[#0B1E33] flex items-center gap-2">
                    {t('bg_roadmap_title')}
                  </h3>
                  <p className="text-xs text-[#0B1E33]/50">
                    {t('bg_roadmap_sub')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => speakRoadmapSummary(currentRoadmap)}
                    className="px-3.5 py-1.5 bg-[#0B1E33] hover:bg-[#152e4d] text-white text-xs font-semibold rounded-full flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    title={t('bg_read_aloud')}
                  >
                    {t('bg_read_aloud')}
                  </button>
                  <span className="px-3 py-1 bg-[#F5F1E6] border border-[#C9A24B]/20 text-[#0B1E33] text-xs font-bold rounded-full w-fit">
                    {t('bg_five_active')}
                  </span>
                </div>
              </div>

              {/* The 5 Cards Grid */}
              <div className="space-y-4">
                {currentRoadmap.map((item, index) => {
                  const stepNum = index + 1;
                  const icon = STAGE_ICONS[item.stage] || '📌';

                  return (
                    <div
                      key={item.stage}
                      className="bg-white border border-[#C9A24B]/20 hover:border-[#C9A24B] rounded-[32px] p-5 sm:p-6 shadow-[0_8px_24px_rgba(11,30,51,0.05)] transition-all space-y-3"
                    >
                      {/* Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#C9A24B]/20 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#C9A24B] to-[#B8912A] text-white font-black text-sm flex items-center justify-center shadow-xs shrink-0">
                            {stepNum}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{icon}</span>
                              <h4 className="text-base sm:text-lg font-bold text-[#0B1E33]">
                                {item.title_hi}
                              </h4>
                            </div>
                            <span className="text-[11px] font-bold text-[#C9A24B] uppercase tracking-widest">
                              {t('bg_stage')} {stepNum}
                            </span>
                          </div>
                        </div>

                        {item.impact_milestone && (
                          <span className="px-3 py-1 rounded-full bg-[#FFF8F0] border border-[#FFE8D6] text-[#A64200] text-xs font-bold w-fit">
                            {t('bg_goal')}: {item.impact_milestone}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-xs sm:text-sm text-[#0B1E33]/60 leading-relaxed font-medium">
                        {item.description}
                      </p>

                      {/* Action Items Checklist */}
                      {item.action_items && item.action_items.length > 0 && (
                        <div className="pt-2 space-y-1.5 bg-[#F5F1E6] rounded-2xl p-3.5 border border-[#C9A24B]/20">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B1E33]">
                            {t('bg_checklist')}
                          </span>
                          <div className="space-y-1.5 pt-1">
                            {item.action_items.map((act, actIdx) => (
                              <div key={actIdx} className="flex items-start gap-2 text-xs text-[#0B1E33]">
                                <span className="text-emerald-700 font-bold shrink-0">✓</span>
                                <span className="leading-snug">{act}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Follow-up Question Section (Gemini Voice/Text Contextual Q&A) ── */}
              <div className="bg-white border border-[#C9A24B]/30 rounded-[32px] p-5 sm:p-7 shadow-[0_16px_40px_rgba(11,30,51,0.06)] space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div className="p-3 bg-[#F5F1E6] border border-[#C9A24B]/20 rounded-2xl text-2xl shrink-0 shadow-xs">
                      💬
                    </div>
                    <div>
                      <h4 className="text-base sm:text-lg font-bold text-[#0B1E33]">
                        {t('bg_followup_title')}
                      </h4>
                      <p className="text-xs text-[#0B1E33]/60 mt-0.5">
                        {t('bg_followup_sub')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick Suggestion Chips */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-[#0B1E33]/50 uppercase tracking-wider">
                    {t('bg_suggested')}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {[t('bg_sq1'), t('bg_sq2'), t('bg_sq3'), t('bg_sq4')].map((sug, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => {
                          setFollowupText(sug);
                          handleSendFollowup(undefined, sug);
                        }}
                        className="px-3.5 py-1.5 rounded-full bg-[#F5F1E6] hover:bg-[#EDE9DA] border border-[#C9A24B]/20 text-xs text-[#0B1E33] font-medium transition-all cursor-pointer"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Follow-up Form */}
                <form onSubmit={(e) => handleSendFollowup(e)} className="space-y-3 pt-2">
                  <div className="relative">
                    <textarea
                      rows={2}
                      value={followupText}
                      onChange={(e) => setFollowupText(e.target.value)}
                      placeholder={t('bg_question_ph')}
                      className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#8C8880] border border-[#C9A24B]/20 rounded-2xl p-4 text-sm sm:text-base focus:outline-none focus:bg-white focus:border-[#C9A24B] transition-all"
                    />

                    {hasVoiceSupport && (
                      <button
                        type="button"
                        onClick={toggleFollowupVoiceListening}
                        className={`absolute right-3.5 bottom-3.5 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                          isListeningFollowup
                            ? 'bg-red-600 text-white animate-pulse'
                            : 'bg-white hover:bg-[#EDE9DA] text-[#0B1E33] border border-[#C9A24B]/30'
                        }`}
                        title={t('bg_speak')}
                      >
                        {isListeningFollowup ? t('bg_listening') : t('bg_speak')}
                      </button>
                    )}
                  </div>

                  {followupError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                      ⚠️ {followupError}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <span className="text-[11px] text-[#0B1E33]/50">
                      {t('bg_followup_note')}
                    </span>
                    <button
                      type="submit"
                      disabled={isSubmittingFollowup || !followupText.trim()}
                      className="px-6 py-2.5 rounded-full bg-[#0B1E33] text-white text-xs sm:text-sm font-bold shadow-xs hover:opacity-95 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmittingFollowup ? t('bg_answering') : t('bg_ask')}
                    </button>
                  </div>
                </form>

                {/* Follow-up Q&A Feed */}
                {followupHistory.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-[#C9A24B]/20">
                    <span className="text-[11px] font-bold text-[#0B1E33]/50 uppercase tracking-wider block">
                      {t('bg_history')}
                    </span>
                    <div className="space-y-3">
                      {followupHistory.map((item) => (
                        <div
                          key={item.id}
                          className="bg-[#F5F1E6] rounded-2xl p-4 border border-[#C9A24B]/20 space-y-2.5"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold text-[#0B1E33] bg-white px-2 py-0.5 rounded-md border border-[#C9A24B]/20 shrink-0">
                              {t('bg_q')}
                            </span>
                            <p className="text-xs sm:text-sm font-semibold text-[#0B1E33]">
                              {item.question}
                            </p>
                          </div>

                          <div className="bg-white rounded-xl p-3 border border-[#C9A24B]/15 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-[#C9A24B] uppercase tracking-wider flex items-center gap-1">
                                {t('bg_a')}
                              </span>
                              <button
                                type="button"
                                onClick={() => speakText(item.answer, speechLang)}
                                className="px-2.5 py-1 bg-[#F5F1E6] hover:bg-[#EDE9DA] text-[#0B1E33] text-[11px] font-medium rounded-full border border-[#C9A24B]/20 flex items-center gap-1 transition-all cursor-pointer"
                                title={t('bg_replay')}
                              >
                                {t('bg_replay')}
                              </button>
                            </div>
                            <p className="text-xs sm:text-sm text-[#0B1E33]/80 leading-relaxed">
                              {item.answer}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default function BusinessGuidePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F5F1E6] flex items-center justify-center text-[#0B1E33]">
          <div className="text-center space-y-2">
            <span className="text-3xl animate-spin block">🧭</span>
          </div>
        </div>
      }
    >
      <BusinessGuideContent />
    </Suspense>
  );
}
