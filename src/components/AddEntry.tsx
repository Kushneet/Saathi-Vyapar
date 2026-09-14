'use client';

/**
 * src/components/AddEntry.tsx
 *
 * "Add today's entry" — the first thing on the dashboard, because writing
 * down what was sold and spent is the job the app exists for. Three ways
 * in, side by side, none of them hidden:
 *
 *   📷 photograph a notebook page  → OCR      ─┐
 *   🎙️ say it                     → transcript ┼→ one parser → review → save
 *   ✍️ type it                     → text      ─┘
 *
 * All three converge on the same parser and the same unconfirmed rows, so
 * income-versus-expense is decided by identical rules however the words
 * arrived, and the review step is the same: every row editable, nothing
 * counts until "save". Speech recognition runs in the browser, so no audio
 * leaves the phone.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSpeechSupported } from '@/lib/hooks/useSpeechSupported';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface StagedEntry {
  id: string;
  amount: number;
  entry_type: 'income' | 'expense';
  description: string;
  confidence: 'high' | 'low';
}

type Phase = 'idle' | 'reading' | 'listening' | 'review' | 'saving' | 'saved';
type Mode = 'photo' | 'say' | 'type';

/** Minimal shape of the browser speech recogniser we rely on. */
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
  /** Facilitator uploading on behalf of a linked entrepreneur. */
  userId?: string;
}

export default function AddEntry({ userId }: Props) {
  const { t, language } = useLanguage();
  const speechSupported = useSpeechSupported();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('photo');
  const [phase, setPhase] = useState<Phase>('idle');
  const [typed, setTyped] = useState('');
  const [heard, setHeard] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [entries, setEntries] = useState<StagedEntry[]>([]);
  const [discardIds, setDiscardIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Live camera (laptops). On a phone the file input's `capture` attribute
  // opens the camera app; a desktop browser ignores it and shows a file
  // picker, which is not "take a photo". There we open the webcam instead.
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const reset = useCallback(() => {
    setPhase('idle');
    setEntries([]);
    setDiscardIds([]);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    setHeard(null);
    setTyped('');
    recognitionRef.current?.stop();
  }, [previewUrl]);

  /** Phones honour `capture`; everything else gets the live camera. */
  function isTouchDevice() {
    return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function openCamera(event: React.MouseEvent<HTMLLabelElement>) {
    if (isTouchDevice() || !navigator.mediaDevices?.getUserMedia) return; // let the input handle it
    event.preventDefault();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // The <video> mounts on the next render; attach the stream then.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      // Permission refused or no camera: fall back to the file picker.
      fileInputRef.current?.click();
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        closeCamera();
        if (blob) processFile(new File([blob], `bahi-khata-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92
    );
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  async function processFile(file: File) {
    setError(null);

    // Check the size here too, so a 20 MB phone photo fails instantly on a
    // weak connection instead of after a long upload.
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t('photo_too_large'));
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPhase('reading');

    try {
      const formData = new FormData();
      formData.append('image', file);
      if (userId) formData.append('user_id', userId);

      const response = await fetch('/api/ledger/ocr', { method: 'POST', body: formData });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t('photo_failed'));
        setPhase('idle');
        return;
      }

      const staged: StagedEntry[] = data.savedEntries || [];
      if (staged.length === 0) {
        setError(t('photo_nothing_found'));
        setPhase('idle');
        return;
      }

      setEntries(staged);
      setDiscardIds([]);
      setPhase('review');
    } catch {
      setError(t('photo_failed'));
      setPhase('idle');
    }
  }


  /** Spoken or typed words → the same staged rows a photo produces. */
  async function sendText(text: string, source: 'voice' | 'manual') {
    setError(null);
    setHeard(source === 'voice' ? text : null);
    setPhase('reading');

    try {
      const response = await fetch('/api/ledger/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source, user_id: userId }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t('common_error'));
        setPhase('idle');
        return;
      }

      const staged: StagedEntry[] = data.savedEntries || [];
      if (staged.length === 0) {
        setError(source === 'voice' ? t('entry_nothing_heard') : t('entry_nothing_typed'));
        setPhase('idle');
        return;
      }

      setEntries(staged);
      setDiscardIds([]);
      setTyped('');
      setPhase('review');
    } catch {
      setError(t('common_error'));
      setPhase('idle');
    }
  }

  function startListening() {
    const Recogniser =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!Recogniser) {
      setError(t('entry_voice_unsupported'));
      return;
    }

    setError(null);
    const recognition = new Recogniser();
    // Follow the chosen language; hi-IN also copes well with Hinglish.
    recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const said = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript)
        .join(' ')
        .trim();
      if (said) sendText(said, 'voice');
      else {
        setError(t('entry_nothing_heard'));
        setPhase('idle');
      }
    };
    recognition.onerror = () => {
      setError(t('entry_nothing_heard'));
      setPhase('idle');
    };
    recognition.onend = () => setPhase((current) => (current === 'listening' ? 'idle' : current));

    recognitionRef.current = recognition;
    setPhase('listening');
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setPhase('idle');
  }

  function updateEntry(id: string, patch: Partial<StagedEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setDiscardIds((prev) => [...prev, id]);
  }

  async function handleSave() {
    setPhase('saving');
    setError(null);

    try {
      const response = await fetch('/api/ledger/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          entries: entries.map((e) => ({
            id: e.id,
            amount: e.amount,
            entry_type: e.entry_type,
            description: e.description,
          })),
          discard_ids: discardIds,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || t('common_error'));
        setPhase('review');
        return;
      }

      setPhase('saved');
      // Pull the new rows into the server-rendered ledger and charts above.
      router.refresh();
      setTimeout(reset, 2500);
    } catch {
      setError(t('common_error'));
      setPhase('review');
    }
  }

  /** Discard every staged row without committing any of them. */
  async function handleDiscardAll() {
    const allIds = [...entries.map((e) => e.id), ...discardIds];
    setPhase('saving');

    try {
      await fetch('/api/ledger/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, entries: [], discard_ids: allIds }),
      });
    } catch {
      // The rows stay unconfirmed either way, so they never reach the books.
    }

    reset();
  }

  const totals = entries.reduce(
    (acc, e) => {
      if (e.entry_type === 'income') acc.income += e.amount;
      else acc.expense += e.amount;
      return acc;
    },
    { income: 0, expense: 0 }
  );

  const MODES: { id: Mode; label: string }[] = [
    { id: 'photo', label: t('entry_tab_photo') },
    { id: 'say', label: t('entry_tab_say') },
    { id: 'type', label: t('entry_tab_type') },
  ];

  return (
    <section
      id="add"
      className="bg-white border border-[#C9A24B]/20 rounded-3xl p-5 sm:p-6 shadow-[0_8px_24px_rgba(11,30,51,0.05)] space-y-4 scroll-mt-24"
    >
      <div>
        <h2 className="font-['Roboto',sans-serif] text-xl font-bold text-[#0B1E33]">{t('entry_title')}</h2>
        <p className="text-sm text-[#0B1E33]/60 mt-0.5">{t('entry_sub')}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
          {error}
        </p>
      )}

      {/* ── Three ways in ──────────────────────────────────────────── */}
      {phase === 'idle' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label={t('entry_title')}>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => {
                  setMode(m.id);
                  setError(null);
                }}
                className={`cursor-pointer py-3.5 px-2 rounded-2xl text-sm sm:text-base font-bold border transition-colors ${
                  mode === m.id
                    ? 'bg-[#1B4332] text-[#F5F1E6] border-[#1B4332]'
                    : 'bg-white text-[#0B1E33] border-[#0B1E33]/25 hover:bg-[#F5F1E6]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Photo */}
          {mode === 'photo' && (
            <div className="space-y-2">
              {/* Two separate inputs on purpose. `capture` makes a phone open the
                  camera and skip the gallery entirely, so with only that input
                  an already-saved photo could not be uploaded at all. */}
              <input
                ref={fileInputRef}
                id="bahi-khata-camera"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                capture="environment"
                onChange={handleFile}
                className="sr-only"
              />
              <input
                ref={galleryInputRef}
                id="bahi-khata-gallery"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={handleFile}
                className="sr-only"
              />
              <label
                htmlFor="bahi-khata-camera"
                onClick={openCamera}
                className="flex flex-col items-center justify-center gap-1.5 w-full py-7 px-4 border-2 border-dashed border-[#0B1E33]/25 rounded-2xl bg-[#F5F1E6] hover:bg-[#EDE9DA] cursor-pointer transition-colors text-center"
              >
                <span className="text-base font-bold text-[#0B1E33]">{t('photo_camera')}</span>
                <span className="text-xs text-[#0B1E33]/55 max-w-xs">{t('help_photo')}</span>
              </label>
              <label
                htmlFor="bahi-khata-gallery"
                className="flex items-center justify-center w-full py-2.5 px-4 rounded-2xl text-sm font-semibold text-[#0B1E33] hover:bg-[#F5F1E6] cursor-pointer transition-colors"
              >
                {t('photo_gallery')}
              </label>
            </div>
          )}

          {/* Say it */}
          {mode === 'say' && (
            <div className="space-y-2">
              {speechSupported ? (
                <button
                  type="button"
                  onClick={startListening}
                  className="cursor-pointer flex flex-col items-center justify-center gap-1.5 w-full py-7 px-4 rounded-2xl bg-[#1B4332] hover:bg-[#245A43] text-[#F5F1E6] transition-colors"
                >
                  <span className="text-base font-bold">{t('entry_say_button')}</span>
                  <span className="text-xs text-[#F5F1E6]/70">{t('entry_say_example')}</span>
                </button>
              ) : (
                <p className="text-sm text-[#0B1E33]/60 bg-[#F5F1E6] rounded-2xl px-4 py-3">{t('entry_voice_unsupported')}</p>
              )}
            </div>
          )}

          {/* Type it */}
          {mode === 'type' && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) sendText(typed.trim(), 'manual');
              }}
            >
              <textarea
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={2}
                placeholder={t('entry_type_placeholder')}
                aria-label={t('entry_tab_type')}
                className="w-full bg-[#F5F1E6] text-[#0B1E33] placeholder-[#0B1E33]/40 px-4 py-3 border-[1.5px] border-[#0B1E33]/25 rounded-2xl text-base focus:outline-none focus:bg-white focus:border-[#0B1E33]"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[#0B1E33]/55">{t('entry_type_hint')}</p>
                <button
                  type="submit"
                  disabled={!typed.trim()}
                  className="cursor-pointer shrink-0 px-5 py-2.5 bg-[#1B4332] hover:bg-[#245A43] disabled:opacity-40 text-[#F5F1E6] text-sm font-bold rounded-full"
                >
                  {t('entry_type_add')}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Listening ──────────────────────────────────────────────── */}
      {phase === 'listening' && (
        <div className="flex flex-col items-center gap-3 py-8 px-4 bg-[#F5F1E6] rounded-2xl">
          <span className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#C9A24B]/40 animate-ping" />
            <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A24B] text-xl">🎙️</span>
          </span>
          <p className="text-sm font-bold text-[#0B1E33]">{t('entry_listening')}</p>
          <p className="text-xs text-[#0B1E33]/55">{t('entry_say_example')}</p>
          <button
            type="button"
            onClick={stopListening}
            className="cursor-pointer mt-1 px-5 py-2 rounded-full border border-[#0B1E33]/30 bg-white text-xs font-bold text-[#0B1E33]"
          >
            {t('common_cancel')}
          </button>
        </div>
      )}

      {/* ── Live camera (desktop) ───────────────────────────────────── */}
      {cameraOpen && (
        <div
          className="fixed inset-0 z-[80] bg-[#0B1E33]/90 flex flex-col items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('photo_camera')}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-w-2xl rounded-2xl bg-black aspect-video object-cover"
          />
          <p className="mt-3 text-[#F5F1E6]/80 text-sm text-center max-w-md">{t('help_photo')}</p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={closeCamera}
              className="cursor-pointer px-5 py-2.5 rounded-full border border-[#F5F1E6]/30 text-[#F5F1E6] text-sm font-semibold hover:bg-white/10"
            >
              {t('common_cancel')}
            </button>
            <button
              type="button"
              onClick={capturePhoto}
              className="cursor-pointer px-7 py-3 rounded-full bg-[#C9A24B] hover:bg-[#B8912A] text-white text-sm font-bold"
            >
              {t('photo_capture')}
            </button>
          </div>
        </div>
      )}

      {/* ── Reading ─────────────────────────────────────────────────── */}
      {phase === 'reading' && (
        <div className="flex items-center gap-4 py-6 px-4 bg-[#F5F1E6] rounded-3xl">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="h-20 w-20 object-cover rounded-2xl border border-[#C9A24B]/30"
            />
          )}
          <div>
            <p className="text-sm font-bold text-[#0B1E33] animate-pulse">{t('photo_reading')}</p>
            <p className="text-[11px] text-[#0B1E33]/50 mt-0.5">{t('photo_reading_note')}</p>
          </div>
        </div>
      )}

      {/* ── Review and correct ──────────────────────────────────────── */}
      {(phase === 'review' || phase === 'saving') && (
        <div className="space-y-3">
          {heard && (
            <p className="text-xs text-[#0B1E33]/60 bg-[#F5F1E6] rounded-2xl px-3.5 py-2.5">
              <span className="font-semibold">{t('entry_heard')}:</span> “{heard}”
            </p>
          )}
          <div>
            <p className="text-sm font-bold text-[#0B1E33]">{t('photo_review_title')}</p>
            <p className="text-xs text-[#0B1E33]/55">{t('photo_review_sub')}</p>
            <p className="text-[11px] text-[#0B1E33]/45 mt-1">
              ⚠ {t('photo_guessed')} — {t('help_photo_flag')}
            </p>
          </div>

          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="p-3 bg-[#F5F1E6] rounded-2xl border border-[#C9A24B]/15 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <input
                    aria-label={t('photo_description')}
                    value={entry.description}
                    onChange={(e) => updateEntry(entry.id, { description: e.target.value })}
                    className="flex-1 min-w-0 bg-white border border-[#C9A24B]/25 rounded-xl px-3 py-2 text-sm text-[#0B1E33]"
                  />
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    aria-label={`${t('photo_remove')}: ${entry.description}`}
                    className="cursor-pointer px-2.5 py-2 text-[#0B1E33]/50 hover:text-red-700 text-sm"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 bg-white border border-[#C9A24B]/25 rounded-xl px-2">
                    <span className="text-sm text-[#0B1E33]/60">₹</span>
                    <input
                      aria-label={t('photo_amount')}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={entry.amount}
                      onChange={(e) =>
                        updateEntry(entry.id, { amount: Math.max(0, Number(e.target.value)) })
                      }
                      className="w-28 py-2 text-sm font-bold text-[#0B1E33] bg-transparent outline-none"
                    />
                  </div>

                  {/* Income vs expense is the field OCR gets wrong, so it is a
                      two-tap control rather than something buried in a menu. */}
                  <div className="inline-flex rounded-xl overflow-hidden border border-[#C9A24B]/30">
                    {(['income', 'expense'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={entry.entry_type === type}
                        onClick={() => updateEntry(entry.id, { entry_type: type })}
                        className={`cursor-pointer px-3 py-2 text-xs font-bold transition-colors ${
                          entry.entry_type === type
                            ? type === 'income'
                              ? 'bg-[#1B7F4B] text-white'
                              : 'bg-[#C62828] text-white'
                            : 'bg-white text-[#0B1E33]/60 hover:bg-[#F5F1E6]'
                        }`}
                      >
                        {type === 'income' ? t('photo_income') : t('photo_expense')}
                      </button>
                    ))}
                  </div>

                  {entry.confidence === 'low' && (
                    <span className="text-[11px] font-bold text-[#C9A24B] bg-[#C9A24B]/10 border border-[#C9A24B]/30 rounded-full px-2.5 py-1">
                      ⚠ {t('photo_guessed')}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <p className="text-xs font-semibold text-[#0B1E33]/60">
            {t('photo_totals', {
              income: totals.income.toLocaleString('en-IN'),
              expense: totals.expense.toLocaleString('en-IN'),
            })}
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSave}
              disabled={phase === 'saving' || entries.length === 0}
              className="cursor-pointer px-5 py-2.5 bg-[#1B4332] hover:bg-[#245A43] disabled:opacity-60 text-[#F5F1E6] font-bold text-xs rounded-full transition-all"
            >
              {phase === 'saving' ? t('photo_saving') : t('photo_save')}
            </button>
            <button
              type="button"
              onClick={handleDiscardAll}
              disabled={phase === 'saving'}
              className="cursor-pointer px-4 py-2.5 bg-white border border-[#C9A24B]/30 hover:bg-[#F5F1E6] disabled:opacity-60 text-[#0B1E33] font-bold text-xs rounded-full transition-all"
            >
              {t('photo_discard_all')}
            </button>
          </div>
        </div>
      )}

      {/* ── Saved ───────────────────────────────────────────────────── */}
      {phase === 'saved' && (
        <p
          role="status"
          className="text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3"
        >
          ✓ {t('photo_saved')}
        </p>
      )}
    </section>
  );
}
