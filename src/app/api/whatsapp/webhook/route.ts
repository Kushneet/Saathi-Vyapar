/**
 * src/app/api/whatsapp/webhook/route.ts
 *
 * WhatsApp Cloud API Webhook handler.
 *
 * GET  — Webhook verification (Meta hub.challenge flow)
 * POST — Incoming messages → conversationOrchestrator → send reply via WhatsApp API
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handleIncomingMessage,
  type InboundMedia,
} from '@/lib/orchestrator/conversationOrchestrator';
import { verifyWhatsAppSignature } from '@/lib/webhooks/verifySignature';
import {
  sendWhatsAppText,
  getWhatsAppMediaUrl,
  downloadWhatsAppMedia as downloadWhatsAppMediaBytes,
} from '@/lib/whatsapp';

// ── Verification (GET) ────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WhatsApp webhook verified successfully');
    // Must return the challenge as plain text with 200
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  console.warn('WhatsApp webhook verification failed — token mismatch or wrong mode');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ── Incoming messages (POST) ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // The signature is computed over the raw bytes, so read text (not json())
  // and parse afterwards — re-serializing would change the digest.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Could not read request body' }, { status: 400 });
  }

  const verification = verifyWhatsAppSignature(
    rawBody,
    request.headers.get('x-hub-signature-256')
  );
  if (!verification.valid) {
    // Unsigned deliveries could otherwise write rows for any phone number and
    // make this app send WhatsApp messages from its own number on demand.
    console.warn('Rejected WhatsApp webhook:', verification.reason);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  let body: WhatsAppWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // WhatsApp sends 200 ack quickly; we process asynchronously
  // Return 200 immediately then process (fire-and-forget pattern)
  processWhatsAppMessages(body).catch((err) =>
    console.error('WhatsApp message processing error:', err)
  );

  return NextResponse.json({ status: 'received' }, { status: 200 });
}

// ── Processing logic ──────────────────────────────────────────────────────────

interface WhatsAppMessage {
  id: string;
  from: string;
  type: 'text' | 'image' | 'audio' | 'voice' | 'video' | 'document' | 'interactive';
  timestamp: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string; voice?: boolean };
}

interface WhatsAppWebhookBody {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value?: {
        messaging_product: string;
        metadata?: { phone_number_id: string };
        messages?: WhatsAppMessage[];
      };
      field?: string;
    }>;
  }>;
}

async function processWhatsAppMessages(body: WhatsAppWebhookBody): Promise<void> {
  if (body.object !== 'whatsapp_business_account') return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      if (!value?.messages) continue;

      for (const message of value.messages) {
        const phone = message.from; // E.164 format: 919876543210
        const phoneWithPlus = phone.startsWith('+') ? phone : `+${phone}`;

        let messageText: string | null = null;
        let media: InboundMedia | null = null;

        if (message.type === 'text' && message.text?.body) {
          messageText = message.text.body;
        } else if (message.type === 'image' && message.image?.id) {
          // Download here rather than in the orchestrator: Meta media URLs are
          // short-lived and require this app's bearer token to fetch.
          media = await downloadWhatsAppMedia(
            message.image.id,
            'image',
            message.image.mime_type
          );
        } else if (
          (message.type === 'audio' || message.type === 'voice') &&
          message.audio?.id
        ) {
          // Voice notes arrive as `audio` (with voice: true for a recording
          // rather than an attached file). Both used to be dropped silently.
          media = await downloadWhatsAppMedia(
            message.audio.id,
            'audio',
            message.audio.mime_type
          );
        }

        // Call the orchestrator
        const reply = await handleIncomingMessage(
          'whatsapp',
          phoneWithPlus,
          messageText,
          media
        );

        // Send reply back via WhatsApp Cloud API
        await sendWhatsAppText(phoneWithPlus, reply);
      }
    }
  }
}
/** Largest photo we will pull down and run OCR over. */
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/**
 * Resolve a WhatsApp media id to its bytes.
 *
 * Two calls: the id resolves to a short-lived URL, and that URL still needs
 * the app's bearer token to download. Returns null on any failure so the
 * caller can answer with a "couldn't read that" message.
 */
async function downloadWhatsAppMedia(
  mediaId: string,
  kind: 'image' | 'audio',
  mimeType?: string
): Promise<InboundMedia | null> {
  const url = await getWhatsAppMediaUrl(mediaId);
  if (!url) return null;

  const buffer = await downloadWhatsAppMediaBytes(url);
  if (!buffer) return null;

  if (buffer.byteLength > MAX_MEDIA_BYTES) {
    console.warn('WhatsApp media exceeds size limit; skipping');
    return null;
  }

  return { buffer, mimeType, kind };
}
