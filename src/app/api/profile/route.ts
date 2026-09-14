/**
 * src/app/api/profile/route.ts
 * PATCH /api/profile
 *
 * Change a few profile fields in place. Yojana Kendra used to send people
 * back through the whole eight-step onboarding to fix one number; this
 * updates only what was sent and leaves the rest alone.
 *
 * Identity comes from the session; `user_id` in the body is honoured only
 * for a linked facilitator or an admin, like every other route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { requireApiUser, resolveTargetUserId, forbidden } from '@/lib/auth/requireUser';

const SECTORS = ['retail', 'tailoring', 'dairy', 'agriculture', 'food', 'manufacturing', 'services', 'general'] as const;

const PatchSchema = z
  .object({
    user_id: z.string().uuid().optional(),
    sector: z.enum(SECTORS).optional(),
    district: z.string().trim().min(1).max(80).optional(),
    state: z.string().trim().min(1).max(80).optional(),
    monthly_revenue_est: z.number().min(0).max(1e9).optional(),
    monthly_expense_est: z.number().min(0).max(1e9).optional(),
    existing_loans: z.boolean().optional(),
    loan_amount: z.number().min(0).max(1e9).nullable().optional(),
    loan_monthly_payment: z.number().min(0).max(1e8).nullable().optional(),
    loan_interest_rate: z.number().min(0).max(100).nullable().optional(),
    category: z.enum(['general', 'obc', 'sc', 'st', 'minority']).optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    is_shg_member: z.boolean().optional(),
  })
  .strict();

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const userId = await resolveTargetUserId(auth.user, parsed.data.user_id);
    if (!userId) return forbidden();

    const { user_id: _ignored, ...fields } = parsed.data;
    void _ignored;
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    // A loan that is switched off takes its figures with it.
    const patch: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() };
    if (fields.existing_loans === false) {
      patch.loan_amount = null;
      patch.loan_monthly_payment = null;
      patch.loan_interest_rate = null;
    }
    if (fields.is_shg_member !== undefined) {
      patch.shg_membership = fields.is_shg_member ? 'shg_member' : 'none';
    }

    const { data, error } = await supabaseServer
      .from('business_profiles')
      .update(patch)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('Profile update failed:', error);
      return NextResponse.json({ error: 'Could not save your details', details: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'No business profile yet. Please complete onboarding first.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, profile: data });
  } catch (err) {
    console.error('Profile PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
