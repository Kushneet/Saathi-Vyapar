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
import { handleIncomingMessage } from '@/lib/orchestrator/conversationOrchestrator';
import { verifyWhatsAppSignature } from '@/lib/webhooks/verifySignature';

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v19.0';

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
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'interactive';
  timestamp: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
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
        let mediaUrl: string | null = null;

        if (message.type === 'text' && message.text?.body) {
          messageText = message.text.body;
        } else if (message.type === 'image' && message.image?.id) {
          // Resolve media URL from WhatsApp media ID
          mediaUrl = await getWhatsAppMediaUrl(message.image.id);
        }

        // Call the orchestrator
        const reply = await handleIncomingMessage(
          'whatsapp',
          phoneWithPlus,
          messageText,
          mediaUrl
        );

        // Send reply back via WhatsApp Cloud API
        await sendWhatsAppMessage(phoneWithPlus, reply);
      }
    }
  }
}

/**
 * Fetch the download URL for a WhatsApp media object by its ID.
 */
async function getWhatsAppMediaUrl(mediaId: string): Promise<string | null> {
  try {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const response = await fetch(`${WHATSAPP_API_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.url || null;
  } catch {
    return null;
  }
}

/**
 * Send a text message via WhatsApp Cloud API.
 */
async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    console.error('Missing WhatsApp credentials — cannot send message');
    return;
  }

  // Remove leading + for WhatsApp API (expects 919876543210, not +919876543210)
  const toNumber = to.startsWith('+') ? to.slice(1) : to;

  const payload = {
    messaging_product: 'whatsapp',
    to: toNumber,
    type: 'text',
    text: { body: text },
  };

  try {
    const response = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`WhatsApp send failed (${response.status}):`, errorBody);
    }
  } catch (err) {
    console.error('WhatsApp API request failed:', err);
  }
}
