/**
 * src/app/api/ledger/voice/route.ts
 *
 * POST /api/ledger/voice
 *
 * Takes a spoken transcript and stages the same unconfirmed ledger rows the
 * photo upload does. Speech recognition runs in the browser (Web Speech API),
 * so no audio reaches the server and no speech service is needed.
 *
 * The transcript goes through the identical parser the OCR path uses, which
 * is the point: income-versus-expense is decided by the same keyword rules
 * whether the words were photographed or dictated, so the two can never
 * disagree. Only the number-word conversion is extra, because a photo of a
 * notebook already contains digits and a sentence does not.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';
import { spokenToDigits } from '@/lib/ledger/spokenNumbers';
import { parseOcrText, summariseEntries } from '@/lib/ledger/ocrParser';

const VoiceSchema = z.object({
  /** One dictated entry per line, as the browser recogniser produced it. */
  transcript: z.string().trim().min(1, 'Nothing was heard').max(2000),
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

    const parsed = VoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const userId = await resolveTargetUserId(auth.user, parsed.data.user_id);
    if (!userId) return forbidden();

    const normalised = spokenToDigits(parsed.data.transcript);
    const entries = parseOcrText(normalised);

    if (entries.length === 0) {
      return NextResponse.json({
        success: true,
        heard: parsed.data.transcript,
        parsedEntries: [],
        savedEntries: [],
        savedCount: 0,
        message: 'No amounts were recognised. Try saying it as "bikri pandrah sau".',
      });
    }

    // Unconfirmed, exactly like an OCR upload: the user reviews before the
    // figures count towards anything.
    const { data, error } = await supabaseServer
      .from('ledger_entries')
      .insert(
        entries.map((e) => ({
          user_id: userId,
          amount: e.amount,
          entry_type: e.entry_type,
          description: e.description,
          source: 'voice' as const,
          confirmed: false,
        }))
      )
      .select('id, amount, entry_type, description');

    if (error) {
      console.error('Failed to stage voice entries:', error);
      return NextResponse.json({ error: 'Could not save the entries' }, { status: 500 });
    }

    const saved = (data || []).map((row, i) => ({
      id: row.id,
      amount: Number(row.amount),
      entry_type: row.entry_type,
      description: row.description,
      confidence: entries[i]?.confidence ?? 'low',
    }));

    return NextResponse.json({
      success: true,
      heard: parsed.data.transcript,
      parsedEntries: entries,
      savedEntries: saved,
      savedCount: saved.length,
      totals: summariseEntries(entries),
    });
  } catch (error) {
    console.error('Voice ledger error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
