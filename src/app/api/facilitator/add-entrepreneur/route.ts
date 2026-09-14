import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { requireApiUser } from '@/lib/auth/requireUser';
import { sendWhatsAppNamedTemplate } from '@/lib/whatsapp';

// facilitator_id is deliberately absent: the acting facilitator is the
// session user. It used to be accepted, validated, and then ignored, while
// the route still reported "registered and linked successfully".
const AddEntrepreneurSchema = z.object({
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  name: z.string().optional(),
  sector: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    if (auth.user.role !== 'facilitator' && auth.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only facilitators can register entrepreneurs.' },
        { status: 403 }
      );
    }

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
    let isNewUser = false;
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
      isNewUser = true;
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

    // 3. Record the facilitator → entrepreneur link. Without this row the
    // facilitator portal has nothing to scope its listing by, and every
    // delegated read (dashboard, plan, guide) is correctly refused.
    const { error: linkError } = await supabaseServer
      .from('facilitators_entrepreneurs')
      .upsert(
        { facilitator_id: auth.user.id, entrepreneur_id: user.id },
        { onConflict: 'facilitator_id,entrepreneur_id' }
      );

    if (linkError) {
      console.error('Failed to link entrepreneur to facilitator:', linkError);
      return NextResponse.json(
        { error: 'Entrepreneur was saved but could not be linked to your account.' },
        { status: 500 }
      );
    }

    // 4. Send a WhatsApp welcome so the entrepreneur knows to start chatting with the bot.
    // A user who hasn't messaged the bot yet is outside WhatsApp's 24h customer-service
    // window, so this must go through a pre-approved template — free text would be rejected.
    // Template: "saathi_vyapar_welcome" (see scripts/create-whatsapp-template.mjs). Sending
    // will fail with a clear error until Meta finishes approving it (status starts PENDING).
    let whatsappNotified = false;
    if (isNewUser) {
      const templateName = process.env.WHATSAPP_WELCOME_TEMPLATE_NAME || 'saathi_vyapar_welcome';
      const templateLang = process.env.WHATSAPP_WELCOME_TEMPLATE_LANG || 'hi';
      const result = await sendWhatsAppNamedTemplate(phone, templateName, templateLang, {
        name: name || 'उद्यमी',
      });
      whatsappNotified = result.ok;
      if (!result.ok) {
        console.warn('WhatsApp welcome message not sent:', result.error);
      }
    }

    return NextResponse.json({
      success: true,
      userId: user.id,
      whatsappNotified,
      message: 'Entrepreneur registered and linked successfully',
    });
  } catch (error) {
    console.error('Error adding entrepreneur:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
