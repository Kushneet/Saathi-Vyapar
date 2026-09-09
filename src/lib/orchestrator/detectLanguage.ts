/**
 * src/lib/orchestrator/detectLanguage.ts
 *
 * Pick the language to answer an inbound WhatsApp/SMS message in.
 *
 * There is no language toggle on those channels, so the reply language was
 * whatever `users.language` happened to hold — 'hi' for everyone, because
 * that is the default at row creation. Someone who writes or speaks English
 * got Hindi back forever.
 *
 * The naive test ("any Latin characters means English") is wrong for exactly
 * the most common case here: rural users overwhelmingly type romanised Hindi.
 * "haan", "nahi hai", "mera dukan" are Hindi written in Latin script, and
 * treating them as English would flip a Hindi speaker to English replies on
 * their first one-word answer.
 *
 * So: Devanagari is decisive; otherwise a romanised-Hindi vocabulary is
 * checked before falling back to English. Short replies are still classified
 * for the current turn, but marked unconfident so they never overwrite the
 * stored preference — "no" should not permanently switch a Hindi speaker.
 */

export type DetectedLanguage = 'hi' | 'en';

export interface LanguageDetection {
  language: DetectedLanguage;
  /** True when there is enough signal to persist this as the preference. */
  confident: boolean;
}

/** Hindi words commonly typed in Latin script by users on these channels. */
const ROMANISED_HINDI = [
  'haan', 'haa', 'hai', 'hain', 'nahi', 'nahin', 'nai', 'kya', 'kyu', 'kaise',
  'mera', 'meri', 'apna', 'aap', 'hum', 'main', 'karo', 'karna', 'kiya',
  'dukan', 'dukaan', 'kirana', 'vyapar', 'vyaapar', 'kaam', 'dhandha',
  'paisa', 'paise', 'rupaye', 'rupay', 'hazaar', 'hajar', 'lakh', 'kamai',
  'kharch', 'kharcha', 'bikri', 'udhaar', 'udhar', 'jama', 'bacha', 'bachat',
  'loan', 'yojana', 'sarkari', 'gaon', 'gaanv', 'zilla', 'jila', 'silai',
  'doodh', 'kheti', 'kisan', 'theek', 'thik', 'sahi', 'galat', 'chahiye',
  'batao', 'bataye', 'dijiye', 'karke', 'wala', 'wali', 'bhai', 'ji',
];

/** Minimum characters before a detection is trusted enough to store. */
const CONFIDENT_MIN_CHARS = 12;

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-zऀ-ॿ]+/).filter(Boolean);
}

/**
 * Detect the language of an inbound message.
 *
 * @param text - Typed message body, or the transcript of a voice note.
 */
export function detectMessageLanguage(text: string): LanguageDetection {
  const trimmed = (text || '').trim();

  if (!trimmed) {
    return { language: 'hi', confident: false };
  }

  const longEnough = trimmed.length >= CONFIDENT_MIN_CHARS;

  // Devanagari settles it outright.
  if (/[ऀ-ॿ]/.test(trimmed)) {
    return { language: 'hi', confident: longEnough };
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    // Digits or punctuation only ("15000") carry no language signal at all.
    return { language: 'hi', confident: false };
  }

  const hindiHits = tokens.filter((word) => ROMANISED_HINDI.includes(word)).length;

  if (hindiHits > 0) {
    // Romanised Hindi. Confident only when it is more than a single token,
    // so a bare "haan" does not rewrite the stored preference.
    return { language: 'hi', confident: longEnough && tokens.length > 1 };
  }

  return { language: 'en', confident: longEnough && tokens.length > 1 };
}
