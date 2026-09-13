/**
 * src/lib/whatsapp.ts
 *
 * Shared WhatsApp Cloud API client. Used by:
 *  - the webhook (src/app/api/whatsapp/webhook/route.ts) for free-form bot replies
 *  - server routes that need to reach a user who hasn't messaged the bot yet
 *    (WhatsApp only allows a pre-approved *template* message in that case —
 *    free text is rejected outside the 24h customer-service window)
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v22.0';
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

interface WhatsAppCredentials {
  accessToken: string;
  phoneNumberId: string;
}

function getCredentials(): WhatsAppCredentials | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId };
}

// WhatsApp expects digits only, e.g. 919876543210 — not +919876543210
function normalizeRecipient(to: string): string {
  return to.startsWith('+') ? to.slice(1) : to;
}

export interface WhatsAppSendResult {
  ok: boolean;
  error?: string;
}

async function postToWhatsApp(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const creds = getCredentials();
  if (!creds) {
    const error = 'Missing WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID env vars';
    console.error(error);
    return { ok: false, error };
  }

  try {
    const response = await fetch(`${WHATSAPP_API_BASE}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`WhatsApp send failed (${response.status}):`, error);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('WhatsApp API request failed:', error);
    return { ok: false, error };
  }
}

/** Free-form text — only deliverable within the 24h window after the user last messaged. */
export async function sendWhatsAppText(to: string, text: string): Promise<WhatsAppSendResult> {
  return postToWhatsApp({
    messaging_product: 'whatsapp',
    to: normalizeRecipient(to),
    type: 'text',
    text: { body: text },
  });
}

/**
 * Pre-approved template — required to reach a user before they've opened a conversation.
 * Positional variant, for templates created with numbered {{1}}, {{2}}, ... placeholders.
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[] = []
): Promise<WhatsAppSendResult> {
  return postToWhatsApp({
    messaging_product: 'whatsapp',
    to: normalizeRecipient(to),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(bodyParams.length > 0
        ? {
            components: [
              { type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) },
            ],
          }
        : {}),
    },
  });
}

/**
 * Pre-approved template — named-parameter variant, for templates created with
 * parameter_format: "named" and {{param_name}} placeholders (see createWhatsAppTemplate).
 */
export async function sendWhatsAppNamedTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  namedParams: Record<string, string> = {}
): Promise<WhatsAppSendResult> {
  const paramEntries = Object.entries(namedParams);
  return postToWhatsApp({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeRecipient(to),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(paramEntries.length > 0
        ? {
            components: [
              {
                type: 'body',
                parameters: paramEntries.map(([parameter_name, text]) => ({
                  type: 'text',
                  parameter_name,
                  text,
                })),
              },
            ],
          }
        : {}),
    },
  });
}

export interface CreateUtilityTemplateParams {
  wabaId: string;
  name: string;
  language: string;
  bodyText: string;
  bodyExampleParams?: { param_name: string; example: string }[];
  footerText?: string;
}

export interface CreateTemplateResult {
  ok: boolean;
  id?: string;
  status?: string;
  category?: string;
  error?: string;
}

/**
 * Create a utility-category message template on the WhatsApp Business Account.
 * Templates require Meta's approval (status starts "PENDING") before they can be sent.
 * Reference: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/utility-templates
 */
export async function createWhatsAppTemplate(
  params: CreateUtilityTemplateParams
): Promise<CreateTemplateResult> {
  const creds = getCredentials();
  if (!creds) {
    return { ok: false, error: 'Missing WHATSAPP_ACCESS_TOKEN env var' };
  }

  const components: Record<string, unknown>[] = [
    {
      type: 'body',
      text: params.bodyText,
      ...(params.bodyExampleParams?.length
        ? { example: { body_text_named_params: params.bodyExampleParams } }
        : {}),
    },
  ];
  if (params.footerText) {
    components.push({ type: 'footer', text: params.footerText });
  }

  try {
    const response = await fetch(
      `${WHATSAPP_API_BASE}/${params.wabaId}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: params.name,
          language: params.language,
          category: 'utility',
          parameter_format: 'named',
          components,
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return { ok: false, error: JSON.stringify(data) };
    }
    return { ok: true, id: data.id, status: data.status, category: data.category };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Resolve a short-lived download URL for a WhatsApp media object (images, docs, etc.). */
export async function getWhatsAppMediaUrl(mediaId: string): Promise<string | null> {
  const creds = getCredentials();
  if (!creds) return null;
  try {
    const response = await fetch(`${WHATSAPP_API_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.url || null;
  } catch {
    return null;
  }
}

/**
 * Download the bytes for a WhatsApp media URL (as returned by getWhatsAppMediaUrl).
 * These URLs are not public — they require the same bearer token as the API itself.
 */
export async function downloadWhatsAppMedia(mediaUrl: string): Promise<Buffer | null> {
  const creds = getCredentials();
  if (!creds) return null;
  try {
    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}
