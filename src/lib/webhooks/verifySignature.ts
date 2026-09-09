/**
 * src/lib/webhooks/verifySignature.ts
 *
 * Both inbound webhooks used to accept any POST from anyone. A forged request
 * could drive the conversation state machine, write rows as any phone number,
 * and — on the WhatsApp path — make the app send messages from the project's
 * own Meta number to an arbitrary recipient.
 *
 * Meta signs each delivery with HMAC-SHA256 over the raw body
 * (`X-Hub-Signature-256: sha256=...`, keyed by the app secret). Twilio signs
 * the request URL plus the sorted POST parameters (`X-Twilio-Signature`,
 * keyed by the auth token). Verify both before doing any work.
 *
 * Missing secret → rejected in production, allowed with a loud warning in
 * development so local testing against ngrok/curl still works.
 */

import crypto from 'crypto';
import { validateRequest } from 'twilio';
import type { NextRequest } from 'next/server';

export type VerificationResult =
  | { valid: true }
  | { valid: false; reason: string };

function allowUnsigned(what: string): VerificationResult {
  if (process.env.NODE_ENV === 'production') {
    return { valid: false, reason: `${what} is not configured; refusing unsigned webhook` };
  }
  console.warn(`⚠️ ${what} is not set — accepting unverified webhook (development only)`);
  return { valid: true };
}

/**
 * Verify a WhatsApp Cloud API delivery.
 *
 * @param rawBody - The exact bytes of the request body, before JSON.parse.
 *                  Re-serializing the parsed object will not match the digest.
 */
export function verifyWhatsAppSignature(rawBody: string, header: string | null): VerificationResult {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    return allowUnsigned('WHATSAPP_APP_SECRET');
  }

  if (!header || !header.startsWith('sha256=')) {
    return { valid: false, reason: 'Missing or malformed X-Hub-Signature-256 header' };
  }

  const received = header.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');

  const receivedBuf = Buffer.from(received, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  // Length check first: timingSafeEqual throws on a length mismatch.
  if (receivedBuf.length !== expectedBuf.length) {
    return { valid: false, reason: 'Signature length mismatch' };
  }

  if (!crypto.timingSafeEqual(receivedBuf, expectedBuf)) {
    return { valid: false, reason: 'Signature mismatch' };
  }

  return { valid: true };
}

/**
 * Reconstruct the public URL Twilio signed. Twilio computes the digest over
 * the URL it requested, which behind Vercel's proxy is the forwarded host,
 * not the internal one `request.url` reports.
 */
function publicUrlFor(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const url = new URL(request.url);

  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}${url.pathname}${url.search}`;
  }

  if (configured) {
    return `${configured.replace(/\/$/, '')}${url.pathname}${url.search}`;
  }

  return request.url;
}

/**
 * Verify a Twilio webhook against the already-parsed form parameters.
 */
export function verifyTwilioSignature(
  request: NextRequest,
  params: Record<string, string>
): VerificationResult {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    return allowUnsigned('TWILIO_AUTH_TOKEN');
  }

  const signature = request.headers.get('x-twilio-signature');
  if (!signature) {
    return { valid: false, reason: 'Missing X-Twilio-Signature header' };
  }

  const isValid = validateRequest(authToken, signature, publicUrlFor(request), params);

  return isValid ? { valid: true } : { valid: false, reason: 'Signature mismatch' };
}
