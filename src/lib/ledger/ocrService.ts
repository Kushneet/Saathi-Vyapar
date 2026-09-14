/**
 * src/lib/ledger/ocrService.ts
 *
 * Runs Tesseract over a bahi-khata photo and stages the result as unconfirmed
 * ledger rows. Shared by the web upload (/api/ledger/ocr) and the WhatsApp
 * photo flow, which previously acknowledged photos and then did nothing with
 * them.
 *
 * Rows are always written with confirmed=false: OCR on handwriting is a
 * suggestion, and nothing enters the entrepreneur's books until they say so.
 */

import Tesseract from 'tesseract.js';
import { supabaseServer } from '@/lib/supabase/server';
import { parseOcrText, summariseEntries, type ParsedEntry } from './ocrParser';

export interface StagedEntry extends ParsedEntry {
  id: string;
}

export interface OcrResult {
  rawText: string;
  parsedEntries: ParsedEntry[];
  savedEntries: StagedEntry[];
  totals: { income: number; expense: number; net: number };
}

/** Thrown when Tesseract itself fails, so callers can answer in the user's language. */
export class OcrFailedError extends Error {
  constructor(cause: unknown) {
    super(`OCR processing failed: ${String(cause)}`);
    this.name = 'OcrFailedError';
  }
}

/**
 * Recognise text in an image and stage the entries for `userId`.
 *
 * @param image - Raw image bytes (JPEG/PNG/WebP).
 * @param userId - Owner of the resulting rows. Callers must have already
 *                 established that the requester may write to this user.
 * @param source - Which channel the photo arrived through.
 */
export async function runLedgerOcr(
  image: Buffer,
  userId: string,
  source: 'ocr' | 'whatsapp' = 'ocr'
): Promise<OcrResult> {
  let rawText: string;

  try {
    const result = await Tesseract.recognize(image, 'eng+hin', {
      logger: () => {}, // suppress progress logs
    });
    rawText = result.data.text || '';
  } catch (err) {
    console.error('Tesseract OCR failed:', err);
    throw new OcrFailedError(err);
  }

  const parsedEntries = parseOcrText(rawText);
  const savedEntries = await stageEntries(parsedEntries, userId, source);

  return {
    rawText,
    parsedEntries,
    savedEntries,
    totals: summariseEntries(parsedEntries),
  };
}

/**
 * Write parsed entries as unconfirmed rows and hand back their ids.
 *
 * Shared by every way of adding an entry — photo, spoken, typed — so all
 * three stage rows the same way and the same review-and-confirm step
 * decides what reaches the books. A failed insert is logged, not thrown:
 * the caller can still show what was read.
 */
export async function stageEntries(
  parsedEntries: ParsedEntry[],
  userId: string,
  source: 'ocr' | 'whatsapp' | 'voice' | 'manual'
): Promise<StagedEntry[]> {
  if (parsedEntries.length === 0) return [];

  const { data, error } = await supabaseServer
    .from('ledger_entries')
    .insert(
      parsedEntries.map((entry) => ({
        user_id: userId,
        amount: entry.amount,
        entry_type: entry.entry_type,
        description: entry.description,
        source,
        confirmed: false,
      }))
    )
    .select('id, amount, entry_type, description');

  if (error) {
    console.error('Failed to stage ledger entries:', error);
    return [];
  }

  return (data || []).map((row, index) => ({
    id: row.id,
    amount: Number(row.amount),
    entry_type: row.entry_type,
    description: row.description,
    confidence: parsedEntries[index]?.confidence ?? 'low',
  }));
}
