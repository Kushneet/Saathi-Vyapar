'use client';

/**
 * src/components/LedgerPhotoUpload.tsx
 *
 * "Bahi-khata photo" section of the dashboard.
 *
 * The OCR endpoint existed and the landing page advertised the feature, but
 * nothing in the app ever called it — there was no way for an entrepreneur to
 * send a photo of their notebook. This is that path:
 *
 *   photograph → OCR → review and correct → save to the ledger
 *
 * The review step is not optional. Handwriting OCR guesses amounts and cannot
 * reliably tell a sale from a purchase, so every row is editable and rows the
 * parser was unsure about are flagged. Nothing counts until "save".
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface StagedEntry {
  id: string;
  amount: number;
  entry_type: 'income' | 'expense';
  description: string;
  confidence: 'high' | 'low';
}

type Phase = 'idle' | 'reading' | 'review' | 'saving' | 'saved';

interface Props {
  /** Facilitator uploading on behalf of a linked entrepreneur. */
  userId?: string;
}

export default function LedgerPhotoUpload({ userId }: Props) {
  const { t } = useLanguage();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [entries, setEntries] = useState<StagedEntry[]>([]);
  const [discardIds, setDiscardIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setEntries([]);
    setDiscardIds([]);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }, [previewUrl]);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

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

  return (
    <section className="bg-white border border-[#C9A24B]/20 rounded-[32px] p-5 sm:p-6 shadow-[0_16px_40px_rgba(11,30,51,0.07)] space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-['Playfair_Display',Georgia,serif] text-lg font-bold text-[#0B1E33] flex items-center gap-2">
            📷 {t('photo_title')}
          </h3>
          <p className="text-xs text-[#0B1E33]/55 mt-0.5">{t('photo_sub')}</p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3"
        >
          {error}
        </p>
      )}

      {/* ── Idle: choose or capture ─────────────────────────────────── */}
      {phase === 'idle' && (
        <div className="space-y-3">
          {/* Two separate inputs on purpose. `capture` makes a phone open the
              camera and skip the gallery entirely, so with only that input
              an already-saved photo could not be uploaded at all — and on a
              laptop there is no camera flow worth forcing. */}
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
            className="flex flex-col items-center justify-center gap-2 w-full py-8 px-4 border-2 border-dashed border-[#C9A24B]/40 rounded-3xl bg-[#F5F1E6] hover:bg-[#C9A24B]/10 cursor-pointer transition-colors text-center"
          >
            <span className="text-3xl">📷</span>
            <span className="text-sm font-bold text-[#0B1E33]">{t('photo_camera')}</span>
            <span className="text-[11px] text-[#0B1E33]/50">{t('photo_reading_note')}</span>
          </label>

          <label
            htmlFor="bahi-khata-gallery"
            className="flex items-center justify-center gap-2 w-full py-3 px-4 border border-[#C9A24B]/30 rounded-2xl bg-white hover:bg-[#F5F1E6] cursor-pointer transition-colors text-center"
          >
            <span className="text-sm font-semibold text-[#0B1E33]">{t('photo_gallery')}</span>
          </label>
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
          <div>
            <p className="text-sm font-bold text-[#0B1E33]">{t('photo_review_title')}</p>
            <p className="text-xs text-[#0B1E33]/55">{t('photo_review_sub')}</p>
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
                              ? 'bg-emerald-700 text-white'
                              : 'bg-[#C9A24B] text-[#0B1E33]'
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
              className="cursor-pointer px-5 py-2.5 bg-[#0B1E33] hover:bg-[#162D59] disabled:opacity-60 text-[#F5F1E6] font-bold text-xs rounded-full transition-all"
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
