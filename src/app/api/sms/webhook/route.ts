/**
 * src/app/api/sms/webhook/route.ts
 *
 * Twilio SMS Webhook handler.
 * POST — Parses incoming Twilio x-www-form-urlencoded body,
 *        calls conversationOrchestrator, returns TwiML XML response.
 *
 * Reference: https://www.twilio.com/docs/messaging/guides/webhook-request
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingMessage } from '@/lib/orchestrator/conversationOrchestrator';
import { verifyTwilioSignature } from '@/lib/webhooks/verifySignature';

export async function POST(request: NextRequest) {
  // Read the body once as text: it is both the form payload and the input to
  // the signature check, and consuming it twice is not possible.
  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return new NextResponse(twimlResponse('System error: could not parse request.'), {
      status: 400,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const params: Record<string, string> = {};
  new URLSearchParams(rawText).forEach((value, key) => {
    params[key] = value;
  });

  // Reject anything Twilio did not sign — an unsigned POST could otherwise
  // drive the state machine and write rows as any phone number.
  const verification = verifyTwilioSignature(request, params);
  if (!verification.valid) {
    console.warn('Rejected SMS webhook:', verification.reason);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  const from = params.From || '';
  const body = params.Body || '';

  if (!from) {
    return new NextResponse(twimlResponse('Missing sender phone number.'), {
      status: 400,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  // Call the conversation orchestrator (SMS has no media in basic flow)
  let replyText: string;
  try {
    replyText = await handleIncomingMessage('sms', from, body || null, null);
  } catch (err) {
    console.error('SMS orchestrator error:', err);
    replyText = 'System error. Please try again later.';
  }

  // Return TwiML response
  return new NextResponse(twimlResponse(replyText), {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

/**
 * Wrap a message string in TwiML XML for Twilio SMS response.
 */
function twimlResponse(message: string): string {
  // Escape XML special characters to prevent injection
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>${escaped}</Message></Response>`;
}
