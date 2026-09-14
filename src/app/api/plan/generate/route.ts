/**
 * src/app/api/plan/generate/route.ts
 * POST /api/plan/generate
 *
 * Validates the request, decides which entrepreneur it may act on, and
 * hands off to generatePlanForUser — the same function the WhatsApp
 * orchestrator calls when someone sends "PLAN".
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';
import { generatePlanForUser, PlanError } from '@/lib/plan/generatePlan';

// ── Request validation schema ─────────────────────────────────────────────────
// `user_id` is optional and no longer authoritative: the caller's identity
// comes from the session cookie. Supplying it only means "act on this
// entrepreneur's behalf", which is honoured for linked facilitators.
const GeneratePlanSchema = z.object({
  user_id: z.string().uuid('user_id must be a valid UUID').optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const parsed = GeneratePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user_id = await resolveTargetUserId(auth.user, parsed.data.user_id);
    if (!user_id) return forbidden();

    const plan = await generatePlanForUser(user_id);
    return NextResponse.json({ success: true, plan });
  } catch (error) {
    if (error instanceof PlanError) {
      return NextResponse.json(
        error.details ? { error: error.message, details: error.details } : { error: error.message },
        { status: error.status }
      );
    }
    console.error('Plan generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
