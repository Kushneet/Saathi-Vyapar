'use client';

/**
 * src/components/khata-mitr/KhataMitraAssistant.tsx
 * Khata Mitra — voice/text AI bookkeeping panel, ported from the standalone
 * Khata-Mitr app and adapted to Saathi Vyapar's own ledger_entries/business_profiles
 * schema and dashboard theme (gold/navy, not the original indigo/violet).
 */

import { useState, useEffect, useRef } from 'react';
import { Trash2, Bot, User } from 'lucide-react';
import KhataMitraChatInput from './KhataMitraChatInput';

interface KhataMitraAssistantProps {
  userId: string;
  language: 'hi' | 'en';
  onLedgerChanged?: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function KhataMitraAssistant({ userId, language, onLedgerChanged }: KhataMitraAssistantProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const lang = language || 'hi';

  const text = {
    // Khata Mitra writes; Ask Saathi answers. The copy used to promise
    // profit and scheme answers here too, which blurred the two.
    title: lang === 'hi' ? 'खाता मित्र' : 'Khata Mitra',
    subtitle: lang === 'hi' ? 'बोलकर या लिखकर खाता लिखवाएँ' : 'Say it or type it — it goes in your khata',
    clearTooltip: lang === 'hi' ? 'बातचीत साफ़ करें' : 'Clear conversation',
    demoTip:
      lang === 'hi'
        ? 'बोलें: "आज 500 की बिक्री हुई", "200 का सामान खरीदा", "रमेश को 300 उधार दिया"'
        : 'Try: "Sold ₹500 today", "Bought stock for ₹200", "Ramesh owes me ₹300"',
    emptyState:
      lang === 'hi'
        ? 'नमस्ते! जो बिका, जो खर्च हुआ, जिसे उधार दिया — बोल दीजिए या लिख दीजिए, मैं खाते में दर्ज कर दूँगा। सवाल पूछने के लिए "साथी से पूछें" है।'
        : 'Hello! Tell me what you sold, what you spent, or who owes you — say it or type it and I will write it in your khata. For questions, use "Ask Saathi".',
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ── Text-to-speech (voice reply) ──────────────────────────────────────
  const cleanTextForSpeech = (raw: string): string =>
    raw
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/₹/g, ' rupaye ')
      .replace(/•\s/g, '')
      .replace(/[-–—]\s/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .trim();

  const getVoices = (): Promise<SpeechSynthesisVoice[]> =>
    new Promise((resolve) => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        resolve(voices);
        return;
      }
      const handler = () => {
        resolve(window.speechSynthesis.getVoices());
        window.speechSynthesis.removeEventListener('voiceschanged', handler);
      };
      window.speechSynthesis.addEventListener('voiceschanged', handler);
      setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
    });

  const speakText = async (textToSpeak: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const cleaned = cleanTextForSpeech(textToSpeak);
    if (!cleaned || cleaned.length < 2) return;

    const voices = await getVoices();
    const isHindi = lang === 'hi';

    let selectedVoice: SpeechSynthesisVoice | null = null;
    if (isHindi) {
      selectedVoice =
        voices.find((v) => v.lang === 'hi-IN' && v.localService) ||
        voices.find((v) => v.lang === 'hi-IN') ||
        voices.find((v) => v.lang.startsWith('hi')) ||
        voices.find((v) => v.lang === 'en-IN') ||
        null;
    } else {
      selectedVoice =
        voices.find((v) => v.lang === 'en-IN' && v.localService) ||
        voices.find((v) => v.lang === 'en-IN') ||
        voices.find((v) => v.lang.startsWith('en')) ||
        null;
    }

    const MAX_CHUNK = 180;
    const sentences = cleaned.match(/[^.!?,]{1,180}[.!?,]?/g) || [cleaned];
    const chunks: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      if ((current + sentence).length > MAX_CHUNK) {
        if (current.trim()) chunks.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    const speakChunk = (index: number) => {
      if (index >= chunks.length) return;
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = isHindi ? 'hi-IN' : 'en-IN';
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.onend = () => speakChunk(index + 1);
      utterance.onerror = () => speakChunk(index + 1);
      window.speechSynthesis.speak(utterance);
    };

    speakChunk(0);
  };

  const handleClearChat = () => {
    if (
      !confirm(
        lang === 'hi' ? 'क्या आप निश्चित रूप से बातचीत मिटाना चाहते हैं?' : 'Are you sure you want to clear this conversation?'
      )
    )
      return;
    setMessages([]);
  };

  return (
    <div className="bg-white border border-[#C9A24B]/20 rounded-[32px] shadow-[0_16px_40px_rgba(11,30,51,0.07)] flex flex-col overflow-hidden h-[560px] sm:h-[600px]">
      {/* Header */}
      <header className="px-5 py-4 bg-[#0B1E33] text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-[#C9A24B]/20 flex items-center justify-center">
            <Bot className="h-5 w-5 text-[#C9A24B]" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold tracking-tight leading-none font-['Playfair_Display',Georgia,serif]">
              {text.title}
            </h3>
            <span className="text-[10px] text-white/60 font-medium">{text.subtitle}</span>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            title={text.clearTooltip}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Trash2 className="h-4 w-4 text-white/80 hover:text-white" />
          </button>
        )}
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F5F1E6]/40">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="h-12 w-12 rounded-full bg-[#C9A24B]/10 flex items-center justify-center">
              <Bot className="h-6 w-6 text-[#C9A24B]" />
            </div>
            <p className="text-xs text-[#0B1E33]/60 leading-relaxed font-medium max-w-xs">{text.emptyState}</p>
            <div className="p-2.5 rounded-lg bg-white border border-[#C9A24B]/15 text-[10px] text-[#0B1E33]/50 font-semibold tracking-wide max-w-xs">
              {text.demoTip}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-2 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                    msg.role === 'user' ? 'bg-[#0B1E33] text-white' : 'bg-[#C9A24B]/15 text-[#0B1E33]'
                  }`}
                >
                  {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed font-medium shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-[#0B1E33] text-white rounded-tr-none'
                      : 'bg-white text-[#0B1E33] border border-[#C9A24B]/15 rounded-tl-none'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-start gap-2 max-w-[85%] mr-auto">
                <div className="h-7 w-7 rounded-full bg-[#C9A24B]/15 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-[#0B1E33]" />
                </div>
                <div className="p-3 bg-white text-[#0B1E33]/50 rounded-2xl rounded-tl-none border border-[#C9A24B]/15 shadow-sm flex items-center gap-1.5">
                  <span className="flex h-2 w-2 animate-bounce rounded-full bg-[#C9A24B] [animation-delay:-0.3s]" />
                  <span className="flex h-2 w-2 animate-bounce rounded-full bg-[#C9A24B] [animation-delay:-0.15s]" />
                  <span className="flex h-2 w-2 animate-bounce rounded-full bg-[#C9A24B]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </main>

      {/* Input */}
      <footer className="p-3 border-t border-[#C9A24B]/15 bg-white space-y-2 shrink-0">
        {errorMsg && (
          <div className="text-[10px] text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200/60">{errorMsg}</div>
        )}
        <KhataMitraChatInput
          userId={userId}
          history={messages.map((m) => ({ role: m.role, content: m.content }))}
          isLoading={isLoading}
          onStartLoading={() => {
            setIsLoading(true);
            setErrorMsg(null);
          }}
          onResponseReceived={(userMsgText, assistantResponse) => {
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: 'user', content: userMsgText },
              { id: crypto.randomUUID(), role: 'assistant', content: assistantResponse },
            ]);
            setIsLoading(false);
            void speakText(assistantResponse);
            onLedgerChanged?.();
          }}
          onError={(error) => {
            setErrorMsg(error);
            setIsLoading(false);
          }}
          language={lang}
        />
      </footer>
    </div>
  );
}
