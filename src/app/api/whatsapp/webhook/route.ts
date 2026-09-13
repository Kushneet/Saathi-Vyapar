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
import { sendWhatsAppText, getWhatsAppMediaUrl } from '@/lib/whatsapp';

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
  let body: WhatsAppWebhookBody;

  try {
    body = await request.json();
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
        await sendWhatsAppText(phoneWithPlus, reply);
      }
    }
  }
}
