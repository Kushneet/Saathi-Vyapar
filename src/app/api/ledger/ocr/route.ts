/**
 * src/app/api/ledger/ocr/route.ts
 *
 * POST /api/ledger/ocr
 *
 * Accepts a multipart/form-data image upload, runs OCR via the shared
 * ledger OCR pipeline, and returns the raw text + parsed/saved entries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processReceiptImage } from '@/lib/ledger/ocr';

export async function POST(request: NextRequest) {
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
  const userId = formData.get('user_id') as string | null;

  if (!imageFile) {
    return NextResponse.json(
      { error: 'Missing "image" field in form data' },
      { status: 400 }
    );
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Missing "user_id" field in form data' },
      { status: 400 }
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

  // ── 3. Run OCR pipeline ─────────────────────────────────────────────────────
  let result: Awaited<ReturnType<typeof processReceiptImage>>;
  try {
    result = await processReceiptImage(imageBuffer, userId);
  } catch (err) {
    console.error('Tesseract OCR failed:', err);
    return NextResponse.json(
      { error: 'OCR processing failed', details: String(err) },
      { status: 500 }
    );
  }

  // ── 4. Return results ──────────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    rawText: result.rawText,
    parsedEntries: result.parsedEntries,
    savedCount: result.savedCount,
    savedEntries: result.savedEntries,
    message:
      result.parsedEntries.length > 0
        ? `Found ${result.parsedEntries.length} entries. Please confirm them in your dashboard.`
        : 'No amounts found in the image. Please try a clearer photo.',
  });
}
