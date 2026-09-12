/**
 * src/app/api/keepalive/route.ts
 *
 * GET /api/keepalive
 *
 * Health check endpoint — no auth required.
 * Queries the schemes table to verify DB connectivity.
 * Use with UptimeRobot or similar to prevent Vercel/Supabase cold starts.
 */

import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { describeLlm } from '@/lib/llm/provider';

export async function GET() {
  let schemeCount = 0;
  let dbStatus: 'ok' | 'error' = 'ok';

  try {
    const { error } = await supabaseServer
      .from('schemes')
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.error('Keepalive DB check failed:', error);
      dbStatus = 'error';
    } else {
      // count is available on the response when head: true is used
      // Fallback: fetch actual count
      const { count } = await supabaseServer
        .from('schemes')
        .select('*', { count: 'exact', head: true });
      schemeCount = count ?? 0;
    }
  } catch (err) {
    console.error('Keepalive error:', err);
    dbStatus = 'error';
  }

  return NextResponse.json(
    {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      scheme_count: schemeCount,
      db: dbStatus,
      // Which model is serving, so a demo can be checked at a glance.
      llm: describeLlm(),
    },
    {
      status: 200,
      headers: {
        // Allow UptimeRobot to cache-bust
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
