/**
 * src/app/api/ledger/ocr/route.ts
 *
 * POST /api/ledger/ocr
 *
 * Accepts a multipart/form-data image of a bahi-khata page, runs OCR, and
 * stages the extracted rows as UNCONFIRMED ledger entries owned by the
 * signed-in user. The entrepreneur reviews and corrects them in the dashboard
 * before anything counts (see /api/ledger/confirm).
 *
 * Parsing and recognition live in src/lib/ledger/ so this route and the
 * WhatsApp photo flow behave identically.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';
import { runLedgerOcr, OcrFailedError } from '@/lib/ledger/ocrService';

/** Upload limits — OCR is expensive, so bound the work a single call can cause. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export async function POST(request: NextRequest) {
  // Ledger writes land in someone's books — never accept an unauthenticated
  // caller, and never take the owner's id from the form body.
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Failed to parse multipart form data' }, { status: 400 });
  }

  const imageFile = formData.get('image') as File | null;

  // A supplied user_id is only a request to write into a linked entrepreneur's
  // ledger; the default and the fallback are always the session user.
  const requestedUserId = (formData.get('user_id') as string | null) || null;
  const userId = await resolveTargetUserId(auth.user, requestedUserId);
  if (!userId) return forbidden();

  if (!imageFile) {
    return NextResponse.json({ error: 'Missing "image" field in form data' }, { status: 400 });
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

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(await imageFile.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'Failed to read image data' }, { status: 400 });
  }

  try {
    const result = await runLedgerOcr(imageBuffer, userId, 'ocr');

    return NextResponse.json({
      success: true,
      rawText: result.rawText,
      parsedEntries: result.parsedEntries,
      savedCount: result.savedEntries.length,
      savedEntries: result.savedEntries,
      totals: result.totals,
      message:
        result.parsedEntries.length > 0
          ? `Found ${result.parsedEntries.length} entries. Please review and confirm them.`
          : 'No amounts found in the image. Please try a clearer photo.',
    });
  } catch (err) {
    if (err instanceof OcrFailedError) {
      return NextResponse.json({ error: 'OCR processing failed' }, { status: 500 });
    }
    console.error('Ledger OCR error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
