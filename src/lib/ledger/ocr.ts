/**
 * src/lib/ledger/ocr.ts
 *
 * Shared bill/receipt OCR pipeline: runs Tesseract.js on an image buffer,
 * parses amount/description lines, and saves unconfirmed ledger entries.
 *
 * Used by:
 *  - POST /api/ledger/ocr (manual upload from the dashboard)
 *  - conversationOrchestrator (a bill photo sent to the WhatsApp bot)
 */

import Tesseract from 'tesseract.js';
import { supabaseServer } from '@/lib/supabase/server';

export interface ParsedEntry {
  amount: number;
  entry_type: 'income';
  description: string;
}

export interface OcrResult {
  rawText: string;
  parsedEntries: ParsedEntry[];
  savedCount: number;
  savedEntries: { id: string; amount: number; description: string }[];
}

/**
 * Parse OCR text to extract amount/description pairs.
 * Looks for patterns like:
 *   - "Item Name 150" (word(s) followed by number)
 *   - "150.00" (standalone number)
 *   - "Total: 1500" (label: number)
 *
 * Returns parsed entries (all classified as 'income' initially;
 * user confirms via dashboard).
 */
export function parseOcrText(rawText: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const lines = rawText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 2) continue;

    // Pattern 1: word(s) followed by a number at end of line
    // e.g., "Rice 150", "Labour charges 500.00"
    const wordNumberMatch = trimmed.match(/^(.+?)\s+([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:\/|$)/);
    if (wordNumberMatch) {
      const description = wordNumberMatch[1].trim();
      const amountStr = wordNumberMatch[2].replace(/,/g, '');
      const amount = parseFloat(amountStr);

      if (!isNaN(amount) && amount > 0 && amount < 10000000 && description.length > 0) {
        // Skip lines that look like dates or codes
        if (!/^\d{1,2}[-\/]\d{1,2}/.test(description)) {
          entries.push({ amount, entry_type: 'income', description });
          continue;
        }
      }
    }

    // Pattern 2: "Label: number" e.g., "Total: 1500", "Amount: 250.00"
    const labelNumberMatch = trimmed.match(/^([A-Za-z\s]+):\s*(?:Rs\.?|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (labelNumberMatch) {
      const description = labelNumberMatch[1].trim();
      const amountStr = labelNumberMatch[2].replace(/,/g, '');
      const amount = parseFloat(amountStr);

      if (!isNaN(amount) && amount > 0 && amount < 10000000) {
        entries.push({ amount, entry_type: 'income', description });
        continue;
      }
    }

    // Pattern 3: standalone number (could be a total)
    const standaloneNumber = trimmed.match(/^(?:Rs\.?|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)$/);
    if (standaloneNumber) {
      const amountStr = standaloneNumber[1].replace(/,/g, '');
      const amount = parseFloat(amountStr);

      if (!isNaN(amount) && amount > 0 && amount < 10000000) {
        entries.push({
          amount,
          entry_type: 'income',
          description: 'OCR extracted amount',
        });
      }
    }
  }

  return entries;
}

/**
 * Run OCR on an image buffer, parse amounts, and save unconfirmed ledger entries.
 */
export async function processReceiptImage(imageBuffer: Buffer, userId: string): Promise<OcrResult> {
  const result = await Tesseract.recognize(imageBuffer, 'eng+hin', {
    logger: () => {}, // suppress progress logs
  });
  const rawText = result.data.text || '';
  const parsedEntries = parseOcrText(rawText);

  let savedEntries: { id: string; amount: number; description: string }[] = [];

  if (parsedEntries.length > 0) {
    const insertRows = parsedEntries.map((entry) => ({
      user_id: userId,
      amount: entry.amount,
      entry_type: entry.entry_type,
      description: entry.description,
      source: 'ocr' as const,
      confirmed: false,
    }));

    const { data, error: insertError } = await supabaseServer
      .from('ledger_entries')
      .insert(insertRows)
      .select('id, amount, description');

    if (insertError) {
      console.error('Failed to save ledger entries:', insertError);
      // Non-fatal: still return the parsed data
    } else {
      savedEntries = data || [];
    }
  }

  return { rawText, parsedEntries, savedCount: savedEntries.length, savedEntries };
}
