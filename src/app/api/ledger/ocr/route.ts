/**
 * src/app/api/ledger/ocr/route.ts
 *
 * POST /api/ledger/ocr
 *
 * Accepts a multipart/form-data image upload, runs Tesseract.js OCR,
 * parses amount/description lines, saves to ledger_entries (unconfirmed),
 * and returns the raw text + parsed entries.
 */

import { NextRequest, NextResponse } from 'next/server';
import Tesseract from 'tesseract.js';
import { supabaseServer } from '@/lib/supabase/server';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';

/** Upload limits — OCR is expensive, so bound the work a single call can cause. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedEntry {
  amount: number;
  entry_type: 'income';
  description: string;
}

// ── OCR text parser ───────────────────────────────────────────────────────────

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
function parseOcrText(rawText: string): ParsedEntry[] {
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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Ledger writes land in someone's books — never accept an unauthenticated
  // caller, and never take the owner's id from the form body.
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse multipart form data' },
      { status: 400 }
    );
  }

  // ── 1. Extract image file ──────────────────────────────────────────────────
  const imageFile = formData.get('image') as File | null;

  // A supplied user_id is only a request to write into a linked entrepreneur's
  // ledger; the default and the fallback are always the session user.
  const requestedUserId = (formData.get('user_id') as string | null) || null;
  const userId = await resolveTargetUserId(auth.user, requestedUserId);
  if (!userId) return forbidden();

  if (!imageFile) {
    return NextResponse.json(
      { error: 'Missing "image" field in form data' },
      { status: 400 }
    );
  }

  if (imageFile.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: 'Image is too large. Please upload a photo under 8 MB.' },
      { status: 413 }
    );
  }

  if (imageFile.type && !ALLOWED_MIME_TYPES.includes(imageFile.type.toLowerCase())) {
    return NextResponse.json(
      { error: 'Unsupported file type. Please upload a JPEG, PNG or WebP photo.' },
      { status: 415 }
    );
  }

  // ── 2. Convert File to Buffer ──────────────────────────────────────────────
  let imageBuffer: Buffer;
  try {
    const arrayBuffer = await imageFile.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json(
      { error: 'Failed to read image data' },
      { status: 400 }
    );
  }

  // ── 3. Run Tesseract OCR ───────────────────────────────────────────────────
  let rawText: string;
  try {
    const result = await Tesseract.recognize(imageBuffer, 'eng+hin', {
      logger: () => {}, // suppress progress logs
    });
    rawText = result.data.text || '';
  } catch (err) {
    console.error('Tesseract OCR failed:', err);
    return NextResponse.json(
      { error: 'OCR processing failed', details: String(err) },
      { status: 500 }
    );
  }

  // ── 4. Parse OCR text ──────────────────────────────────────────────────────
  const parsedEntries = parseOcrText(rawText);

  // ── 5. Save entries to ledger_entries (unconfirmed) ───────────────────────
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

  // ── 6. Return results ──────────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    rawText,
    parsedEntries,
    savedCount: savedEntries.length,
    savedEntries,
    message:
      parsedEntries.length > 0
        ? `Found ${parsedEntries.length} entries. Please confirm them in your dashboard.`
        : 'No amounts found in the image. Please try a clearer photo.',
  });
}
