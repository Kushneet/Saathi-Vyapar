/**
 * src/app/api/ledger/text/route.ts
 * POST /api/ledger/text
 *
 * "Say it" and "Type it" on the dashboard. Takes a sentence — spoken and
 * transcribed in the browser, or typed — and stages the same unconfirmed
 * rows the photo upload does, through the same parser, so income-versus-
 * expense is decided by one set of rules however the words arrived. The
 * only extra step is turning number words into digits ("pandrah sau"),
 * which a photographed page does not need.
 *
 * Nothing reaches the books until the user confirms on the review step.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';
import { spokenToDigits } from '@/lib/ledger/spokenNumbers';
import { parseOcrText, summariseEntries } from '@/lib/ledger/ocrParser';
import { stageEntries } from '@/lib/ledger/ocrService';

const TextSchema = z.object({
  /** One entry per line: "bikri 2400", "maal kharida 1200". */
  text: z.string().trim().min(1).max(2000),
  /** How the words arrived; stored on the row. */
  source: z.enum(['voice', 'manual']).default('manual'),
  user_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = TextSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const userId = await resolveTargetUserId(auth.user, parsed.data.user_id);
    if (!userId) return forbidden();

    const entries = parseOcrText(spokenToDigits(parsed.data.text));
    const savedEntries = await stageEntries(entries, userId, parsed.data.source);

    return NextResponse.json({
      success: true,
      heard: parsed.data.text,
      parsedEntries: entries,
      savedEntries,
      savedCount: savedEntries.length,
      totals: summariseEntries(entries),
    });
  } catch (err) {
    console.error('Ledger text error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
