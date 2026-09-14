'use client';

/**
 * src/components/VoiceInputButton.tsx
 *
 * A mic that fills one field.
 *
 * The full-screen voice flow asks every question in sequence and takes the
 * whole screen; this is the smaller version of the same idea — you are already
 * looking at a form, and one answer is easier to say than to type. Speaking a
 * name or a village is the difference between finishing the form and giving up
 * on it for someone who types slowly.
 *
 * Recognition runs in the browser, so nothing is uploaded. The button hides
 * itself where the browser has no recogniser rather than failing on tap.
 */

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSpeechSupported } from '@/lib/hooks/useSpeechSupported';

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

interface Props {
  /** Receives the recognised text for this field. */
  onResult: (text: string) => void;
  /** Announced to screen readers, e.g. "Say your name". */
  label?: string;
}

export default function VoiceInputButton({ onResult, label }: Props) {
  const { t, language } = useLanguage();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const supported = useSpeechSupported();

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const Recogniser =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
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
      if (said) onResult(said);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label || t('voice_field_label')}
      aria-pressed={listening}
      title={label || t('voice_field_label')}
      className={`shrink-0 h-11 w-11 rounded-2xl border flex items-center justify-center transition-colors cursor-pointer ${
        listening
          ? 'bg-[#C9A24B] border-[#C9A24B] text-white animate-pulse'
          : 'bg-white border-[#C9A24B]/30 text-[#0B1E33] hover:bg-[#F5F1E6]'
      }`}
    >
      <span className="text-lg" aria-hidden="true">
        🎙️
      </span>
    </button>
  );
}
