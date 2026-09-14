/**
 * src/app/api/chat/route.ts
 *
 * POST /api/chat — the endpoint the assistant panel will call.
 *
 * Live and authenticated, but nothing in the UI calls it yet: the panel can be
 * added later without touching the data layer, and adding it cannot break any
 * page that exists today.
 *
 * Answers come from the user's own stored figures first (see chat/answer.ts),
 * so the assistant reports the same numbers the dashboard does.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';
import { buildChatContext } from '@/lib/chat/buildContext';
import { answerQuestion } from '@/lib/chat/answer';

const ChatSchema = z.object({
  message: z.string().trim().min(1, 'Please type a question').max(500),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      })
    )
    .max(20)
    .optional(),
  user_id: z.string().uuid().optional(),
  /** The toggle the user is looking at. Overrides the stored preference. */
  language: z.enum(['en', 'hi']).optional(),
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

    const parsed = ChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const userId = await resolveTargetUserId(auth.user, parsed.data.user_id);
    if (!userId) return forbidden();

    const context = await buildChatContext(userId);
    // users.language is set once at signup ('hi' by default); the panel knows
    // which language is on screen right now, and an English question under an
    // English toggle must not come back in Devanagari.
    if (parsed.data.language) context.language = parsed.data.language;
    const answer = await answerQuestion(parsed.data.message, context, parsed.data.history ?? []);

    return NextResponse.json(answer);
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
