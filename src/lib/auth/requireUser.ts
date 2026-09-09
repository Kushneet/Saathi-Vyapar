/**
 * src/lib/auth/requireUser.ts
 *
 * Single place where "who is calling?" is answered.
 *
 * Every API route and every server-rendered page used to read `user_id`
 * straight out of the request (body, form field or query string) and hand it
 * to `supabaseServer` — the service-role client, which bypasses Row Level
 * Security. That made `/dashboard?user_id=<uuid>`, `/api/plan/generate` and
 * friends readable and writable by anyone who could guess or observe a UUID.
 *
 * The rule now: the caller's identity always comes from the session cookie.
 * A `user_id` supplied by the client is only ever a *request* to act on
 * someone else's behalf, and is honoured only when the session user is a
 * facilitator linked to that entrepreneur (see `resolveTargetUserId`).
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { createSupabaseRouteClient, supabaseServer } from '@/lib/supabase/server';

export interface SessionUser {
  id: string;
  email: string | null;
  /** Role from public.users; defaults to 'entrepreneur' when no row exists yet. */
  role: 'entrepreneur' | 'facilitator' | 'admin';
}

/** Result of an API-route auth check: either a user, or the response to return. */
export type ApiAuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

function isConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return Boolean(url) && !url.includes('placeholder') && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Resolve the signed-in user from the request cookies, or null.
 *
 * Uses the anon-key, cookie-bound client (so the token is actually verified
 * against Supabase Auth) and then reads the role from public.users with the
 * service-role client — the role is a server-side lookup keyed by a verified
 * uid, never something the caller can assert.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isConfigured()) return null;

  try {
    const cookieStore = await cookies();
    const supabase = await createSupabaseRouteClient(cookieStore);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) return null;

    const authUser = data.user;

    let role: SessionUser['role'] = 'entrepreneur';
    try {
      const { data: row } = await supabaseServer
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .maybeSingle();
      if (row?.role === 'facilitator' || row?.role === 'admin') {
        role = row.role;
      }
    } catch {
      // No public.users row yet (first visit) — entrepreneur is the safe default.
    }

    return { id: authUser.id, email: authUser.email ?? null, role };
  } catch (err) {
    console.warn('Session resolution failed:', err);
    return null;
  }
}

/**
 * Auth guard for API route handlers.
 *
 *   const auth = await requireApiUser();
 *   if (!auth.ok) return auth.response;
 *   // auth.user.id is trustworthy from here on
 */
export async function requireApiUser(): Promise<ApiAuthResult> {
  const user = await getSessionUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Authentication required. Please sign in.' },
        { status: 401 }
      ),
    };
  }

  return { ok: true, user };
}

/**
 * Auth guard for server components. Redirects to /login instead of returning
 * a response, so pages never render with a fabricated or borrowed identity.
 */
export async function requirePageUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    redirect(`/login${next}`);
  }

  return user;
}

/** True when `facilitatorId` is linked to `entrepreneurId`. */
export async function isLinkedEntrepreneur(
  facilitatorId: string,
  entrepreneurId: string
): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from('facilitators_entrepreneurs')
    .select('id')
    .eq('facilitator_id', facilitatorId)
    .eq('entrepreneur_id', entrepreneurId)
    .maybeSingle();

  if (error) {
    // Fail closed: an unavailable link table must not widen access.
    console.error('Facilitator link lookup failed:', error);
    return false;
  }

  return Boolean(data);
}

/** All entrepreneur ids a facilitator is allowed to see. */
export async function listLinkedEntrepreneurIds(facilitatorId: string): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from('facilitators_entrepreneurs')
    .select('entrepreneur_id')
    .eq('facilitator_id', facilitatorId);

  if (error) {
    console.error('Facilitator link listing failed:', error);
    return [];
  }

  return (data || []).map((row) => row.entrepreneur_id as string);
}

/**
 * Decide which user id a request may actually operate on.
 *
 * - No `requested` id, or it matches the session user → the session user.
 * - A different id → allowed only for an admin, or a facilitator explicitly
 *   linked to that entrepreneur. Otherwise null, and the caller returns 403.
 */
export async function resolveTargetUserId(
  sessionUser: SessionUser,
  requested?: string | null
): Promise<string | null> {
  if (!requested || requested === sessionUser.id) {
    return sessionUser.id;
  }

  if (sessionUser.role === 'admin') {
    return requested;
  }

  if (sessionUser.role === 'facilitator' && (await isLinkedEntrepreneur(sessionUser.id, requested))) {
    return requested;
  }

  return null;
}

/** Standard 403 for a target the caller may not touch. */
export function forbidden(): NextResponse {
  return NextResponse.json(
    { error: 'You do not have access to this entrepreneur’s data.' },
    { status: 403 }
  );
}
