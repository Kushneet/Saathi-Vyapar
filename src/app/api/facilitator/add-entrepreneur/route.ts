import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';

const AddEntrepreneurSchema = z.object({
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  name: z.string().optional(),
  sector: z.string().optional(),
  facilitator_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = AddEntrepreneurSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, sector } = parsed.data;
    let { phone } = parsed.data;

    // Standardize phone format (+91...)
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      phone = `+91${digits}`;
    } else if (!phone.startsWith('+')) {
      phone = `+${digits}`;
    }

    // 1. Find or create user
    let user: { id: string } | null = null;
    const { data: existingUser } = await supabaseServer
      .from('users')
      .select('id')
      .eq('phone', phone)
      .single();

    if (existingUser) {
      user = existingUser;
      if (name) {
        await supabaseServer.from('users').update({ name }).eq('id', user.id);
      }
    } else {
      const { data: newUser, error: createError } = await supabaseServer
        .from('users')
        .insert({
          phone,
          name: name || 'उद्यमी',
          language: 'hi',
          role: 'entrepreneur',
        })
        .select('id')
        .single();

      if (createError || !newUser) {
        return NextResponse.json(
          { error: 'Failed to create user', details: createError?.message },
          { status: 500 }
        );
      }
      user = newUser;
    }

    // 2. Upsert business profile with sector
    // business_profiles.user_id has no UNIQUE/exclusion constraint, so
    // `.upsert(..., { onConflict: 'user_id' })` fails every time with
    // "there is no unique or exclusion constraint matching the ON CONFLICT
    // specification". Look the row up first and insert or update explicitly.
    if (sector) {
      const { data: existingProfile } = await supabaseServer
        .from('business_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingProfile) {
        await supabaseServer
          .from('business_profiles')
          .update({ sector, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      } else {
        await supabaseServer
          .from('business_profiles')
          .insert({ user_id: user.id, sector, updated_at: new Date().toISOString() });
      }
    }

    return NextResponse.json({
      success: true,
      userId: user.id,
      message: 'Entrepreneur registered and linked successfully',
    });
  } catch (error) {
    console.error('Error adding entrepreneur:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
