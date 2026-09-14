'use client';

/**
 * src/components/ChatPanel.tsx
 *
 * "Ask Saathi" — the assistant panel on the dashboard.
 *
 * For someone who finds a dashboard hard to read, asking is easier than
 * navigating: "kitna bacha?" gets the same figure the profit card shows,
 * without having to know which card that is.
 *
 * Every number in a reply comes from the user's own stored data, computed by
 * the same engines the dashboard uses — see src/lib/chat/answer.ts, where
 * known questions are answered from figures and the model is only ever asked
 * to phrase them. So the panel and the cards can never quote different totals.
 *
 * Mobile gets a bottom sheet, desktop a side panel; both are the same markup
 * at different breakpoints, and neither traps the page behind it.
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSpeechSupported } from '@/lib/hooks/useSpeechSupported';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

/**
 * Mounted once, in the root layout, so it is on every page. A facilitator
 * viewing an entrepreneur's pages carries `?user_id=` in the URL; the
 * panel passes that along so the answers are about that person. The
 * server still decides whether the caller may see them.
 */
export default function ChatPanel() {
  const { t, language } = useLanguage();
  const userId = useSearchParams().get('user_id') ?? undefined;
  const speechSupported = useSpeechSupported();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Keep the newest reply in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Escape closes, and opening moves focus to the input so a keyboard user is
  // not left hunting for it.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;

    setDraft('');
    setBusy(true);
    const asked: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, asked]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          // Prior turns give the model context; the server caps how many it uses.
          history: messages.slice(-6),
          user_id: userId,
          language,
        }),
      });

      const data = await response.json();

      // 401 is the ordinary case on a public page, not a failure: the panel is
      // offered before anyone has an account. Say what to do next rather than
      // reporting an auth error to someone who has not signed up yet.
      const reply = response.ok
        ? data.reply
        : response.status === 401
          ? t('chat_signin')
          : data.error || t('chat_error');

      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: t('chat_error') }]);
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    const Recogniser =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;
    if (!Recogniser) return;

    const recognition = new Recogniser();
    recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const said = Array.from(
        { length: event.results.length },
        (_, i) => event.results[i][0].transcript
      )
        .join(' ')
        .trim();
      if (said) ask(said);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  const starters = [t('chat_q1'), t('chat_q2'), t('chat_q3')];

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] font-bold text-sm pl-4 pr-5 py-3.5 shadow-lg transition-colors cursor-pointer"
        >
          <span aria-hidden="true" className="text-base">💬</span>
          {t('chat_open')}
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={t('chat_title')}
          className="fixed z-50 bg-white border border-[#C9A24B]/30 shadow-2xl flex flex-col
                     inset-x-0 bottom-0 h-[85vh] rounded-t-3xl
                     sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:w-[400px] sm:rounded-3xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#C9A24B]/20">
            <div>
              <p className="font-['Roboto',sans-serif] font-bold text-[#0B1E33]">{t('chat_title')}</p>
              <p className="text-xs text-[#0B1E33]/55 mt-0.5">{t('chat_subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('chat_close')}
              className="shrink-0 h-9 w-9 rounded-full hover:bg-[#F5F1E6] text-[#0B1E33]/60 text-lg cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Conversation */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <p className="text-sm leading-relaxed text-[#0B1E33]/75 bg-[#F5F1E6] rounded-2xl px-4 py-3">
              {t('chat_greeting')}
            </p>

            {messages.length === 0 && (
              <div className="pt-1">
                <p className="text-[11px] font-bold text-[#0B1E33]/45 mb-2">{t('chat_try')}</p>
                <div className="flex flex-wrap gap-2">
                  {starters.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => ask(q)}
                      className="text-xs text-left border border-[#C9A24B]/35 hover:bg-[#F5F1E6] rounded-full px-3 py-1.5 transition-colors cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-auto bg-[#0B1E33] text-[#F5F1E6]'
                    : 'bg-[#F5F1E6] text-[#0B1E33]'
                }`}
              >
                {m.content}
              </div>
            ))}

            {busy && (
              <p className="text-xs text-[#0B1E33]/50 animate-pulse">{t('chat_thinking')}</p>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            className="flex items-center gap-2 px-4 py-3 border-t border-[#C9A24B]/20"
          >
            {speechSupported && (
              <button
                type="button"
                onClick={startListening}
                aria-label={t('chat_speak')}
                aria-pressed={listening}
                className={`shrink-0 h-11 w-11 rounded-2xl border flex items-center justify-center cursor-pointer transition-colors ${
                  listening
                    ? 'bg-[#C9A24B] border-[#C9A24B] animate-pulse'
                    : 'bg-white border-[#C9A24B]/30 hover:bg-[#F5F1E6]'
                }`}
              >
                <span aria-hidden="true">🎙️</span>
              </button>
            )}

            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('chat_placeholder')}
              aria-label={t('chat_placeholder')}
              className="flex-1 min-w-0 bg-[#F5F1E6] border border-[#C9A24B]/25 rounded-2xl px-4 py-3 text-sm text-[#0B1E33] focus:outline-none focus:bg-white focus:border-[#C9A24B]"
            />

            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="shrink-0 h-11 px-4 rounded-2xl bg-[#0B1E33] hover:bg-[#162D59] disabled:opacity-40 text-[#F5F1E6] text-sm font-bold cursor-pointer transition-colors"
            >
              {t('chat_send')}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
