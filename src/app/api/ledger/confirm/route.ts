/**
 * src/app/api/ledger/confirm/route.ts
 *
 * POST /api/ledger/confirm
 *
 * Commits (or discards) the unconfirmed rows staged by an OCR upload, after
 * the entrepreneur has reviewed them. Handwriting OCR guesses amounts and
 * cannot reliably tell income from expense, so nothing counts towards the
 * financial engine until it comes back through here.
 *
 * Every write is scoped by user_id as well as row id, so a leaked row id from
 * another account cannot be edited.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';

const ConfirmSchema = z.object({
  user_id: z.string().uuid().optional(),
  /** Rows to keep, with any corrections the user made during review. */
  entries: z
    .array(
      z.object({
        id: z.string().uuid(),
        amount: z.number().positive('Amount must be greater than zero').max(10000000),
        entry_type: z.enum(['income', 'expense']),
        description: z.string().trim().min(1).max(500),
      })
    )
    .default([]),
  /** Rows the user rejected — OCR noise, duplicated totals, misreads. */
  discard_ids: z.array(z.string().uuid()).default([]),
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

    const parsed = ConfirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { entries, discard_ids } = parsed.data;
    const userId = await resolveTargetUserId(auth.user, parsed.data.user_id);
    if (!userId) return forbidden();

    if (entries.length === 0 && discard_ids.length === 0) {
      return NextResponse.json({ error: 'Nothing to confirm or discard' }, { status: 400 });
    }

    // 1. Discard rejected rows. Scoped to the owner and to unconfirmed rows so
    //    this endpoint can never delete an already-committed transaction.
    if (discard_ids.length > 0) {
      const { error: deleteError } = await supabaseServer
        .from('ledger_entries')
        .delete()
        .in('id', discard_ids)
        .eq('user_id', userId)
        .eq('confirmed', false);

      if (deleteError) {
        console.error('Failed to discard ledger entries:', deleteError);
        return NextResponse.json({ error: 'Failed to discard entries' }, { status: 500 });
      }
    }

    // 2. Commit the rows the user kept, applying their corrections.
    let confirmedCount = 0;
    for (const entry of entries) {
      const { error: updateError, count } = await supabaseServer
        .from('ledger_entries')
        .update(
          {
            amount: entry.amount,
            entry_type: entry.entry_type,
            description: entry.description,
            confirmed: true,
          },
          { count: 'exact' }
        )
        .eq('id', entry.id)
        .eq('user_id', userId);

      if (updateError) {
        console.error('Failed to confirm ledger entry:', updateError);
        return NextResponse.json({ error: 'Failed to confirm entries' }, { status: 500 });
      }

      confirmedCount += count ?? 0;
    }

    return NextResponse.json({
      success: true,
      confirmed: confirmedCount,
      discarded: discard_ids.length,
    });
  } catch (error) {
    console.error('Ledger confirm error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
