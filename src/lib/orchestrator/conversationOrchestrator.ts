/**
 * src/lib/orchestrator/conversationOrchestrator.ts
 *
 * Conversation state machine for WhatsApp and SMS onboarding flow.
 * Handles multi-turn conversations to collect business profile data,
 * trigger plan generation, and process OCR requests.
 *
 * States:
 *   idle → awaiting_sector → awaiting_district → awaiting_revenue
 *   → awaiting_expenses → awaiting_loans → complete
 */

import { supabaseServer } from '@/lib/supabase/server';
import { runLedgerOcr, OcrFailedError } from '@/lib/ledger/ocrService';
import { transcribeAudio } from '@/lib/voice/transcribeAudio';
import { detectMessageLanguage } from './detectLanguage';
import { sendWhatsAppText } from '@/lib/whatsapp';
import { generatePlanForUser } from '@/lib/plan/generatePlan';

/** Media that arrived with an inbound message, already downloaded. */
export interface InboundMedia {
  buffer: Buffer;
  mimeType?: string;
  /** 'image' runs OCR; 'audio' is transcribed and re-enters as text. */
  kind: 'image' | 'audio';
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ConversationState =
  | 'idle'
  | 'awaiting_sector'
  | 'awaiting_district'
  | 'awaiting_revenue'
  | 'awaiting_expenses'
  | 'awaiting_loans'
  | 'complete';

interface ConversationContext {
  sector?: string;
  district?: string;
  monthly_revenue?: number;
  monthly_expense?: number;
  existing_loans?: boolean;
  [key: string]: unknown;
}

// ── Greeting messages per language ───────────────────────────────────────────

const GREETINGS: Record<string, string> = {
  hi: 'नमस्ते! मैं साथी व्यापार हूँ — आपका व्यापारिक सहायक 🙏\nआपका व्यवसाय किस क्षेत्र में है? (जैसे: खेती, कपड़े, खाना, सेवाएं)',
  en: 'Hello! I am Saathi Vyapar — your business assistant 🙏\nWhat sector is your business in? (e.g., agriculture, clothing, food, services)',
};

function greet(lang: string): string {
  return GREETINGS[lang] || GREETINGS['hi'];
}

function t(lang: string, key: string): string {
  const messages: Record<string, Record<string, string>> = {
    hi: {
      ask_sector:
        'आपका व्यवसाय किस क्षेत्र में है? (जैसे: खेती, कपड़े, खाना, दुकान, सेवाएं)',
      ask_district:
        'धन्यवाद! आप किस जिले में हैं? (जिले का नाम भेजें)',
      ask_revenue:
        'बहुत अच्छा! हर महीने आपकी कमाई कितनी होती है? (₹ में संख्या भेजें, जैसे: 15000)',
      ask_expenses:
        'हर महीने आपका खर्च कितना होता है? (₹ में संख्या भेजें, जैसे: 10000)',
      ask_loans:
        'क्या आपके ऊपर कोई पुराना कर्ज है? (हाँ / नहीं भेजें)',
      complete:
        '🎉 बधाई हो! आपकी जानकारी सेव हो गई।\nअपना वित्तीय प्लान देखने के लिए *PLAN* भेजें।\nबिल की फोटो भेजें तो हम उसे खाते में जोड़ देंगे।',
      plan_generating:
        '⏳ आपका प्लान तैयार हो रहा है... कुछ सेकंड रुकें।',
      plan_error:
        '❌ प्लान बनाने में दिक्कत हुई। कृपया थोड़ी देर बाद *PLAN* भेजें।',
      invalid_number:
        '❌ कृपया सिर्फ संख्या भेजें (जैसे: 15000)',
      invalid_yesno:
        '❌ कृपया सिर्फ "हाँ" या "नहीं" भेजें।',
      ocr_processing:
        '📄 आपका बिल देख रहे हैं... कुछ सेकंड रुकें।',
      ocr_error:
        '❌ फोटो पढ़ने में दिक्कत हुई। कृपया साफ फोटो भेजें।',
      ocr_none:
        '❌ फोटो में कोई रकम नहीं मिली। पन्ना सीधा रखकर, अच्छी रोशनी में साफ फोटो भेजें।',
      voice_failed:
        '❌ आवाज़ समझ नहीं आई। कृपया दोबारा बोलें या टाइप करके भेजें।',
      voice_heard: '🎙️ आपने कहा:',
    },
    en: {
      ask_sector:
        'What sector is your business in? (e.g., agriculture, clothing, food, retail, services)',
      ask_district: 'Great! Which district are you in? (Send the district name)',
      ask_revenue:
        'How much do you earn per month? (Send amount in ₹, e.g., 15000)',
      ask_expenses:
        'How much do you spend per month? (Send amount in ₹, e.g., 10000)',
      ask_loans: 'Do you have any existing loans? (Reply: yes / no)',
      complete:
        '🎉 Great! Your information has been saved.\nSend *PLAN* to get your financial plan.\nSend a photo of your bill to add it to your ledger.',
      plan_generating: '⏳ Generating your financial plan... please wait.',
      plan_error:
        '❌ Failed to generate plan. Please send *PLAN* again in a moment.',
      invalid_number:
        '❌ Please send a number only (e.g., 15000)',
      invalid_yesno: '❌ Please reply with "yes" or "no".',
      ocr_processing: '📄 Reading your bill... please wait.',
      ocr_error:
        '❌ Could not read the photo. Please send a clearer image.',
      ocr_none:
        '❌ No amounts found in the photo. Keep the page flat, use good light and send a clearer image.',
      voice_failed:
        '❌ Could not make out the voice message. Please try again or send it as text.',
      voice_heard: '🎙️ You said:',
    },
  };

  return messages[lang]?.[key] ?? messages['hi'][key] ?? key;
}

// ── Parse amount from message ─────────────────────────────────────────────────

function parseAmount(text: string): number | null {
  // Remove commas, ₹ symbol, and whitespace, then parse
  const cleaned = text.replace(/[₹,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) || num < 0 ? null : num;
}

// ── Parse yes/no ──────────────────────────────────────────────────────────────

function parseYesNo(text: string): boolean | null {
  const lower = text.toLowerCase().trim();
  const yesVariants = ['yes', 'haan', 'haa', 'ha', 'हाँ', 'हां', 'हा', 'y', '1'];
  const noVariants = ['no', 'nahi', 'nai', 'नहीं', 'नही', 'n', '0'];
  if (yesVariants.some((v) => lower === v || lower.startsWith(v))) return true;
  if (noVariants.some((v) => lower === v || lower.startsWith(v))) return false;
  return null;
}

// ── Plan generation ───────────────────────────────────────────────────────────
// Direct call. This used to POST to /api/plan/generate on its own server,
// which stopped working the moment that route required a session cookie.

async function callPlanGenerate(userId: string): Promise<string | null> {
  try {
    const plan = await generatePlanForUser(userId);
    return plan.summaryText || null;
  } catch (err) {
    console.error('Plan generation failed:', err);
    return null;
  }
}

// ── Send an async follow-up message back to the user ─────────────────────────
// PLAN generation takes longer than a single webhook round-trip, so its
// result is delivered as a separate follow-up message once ready.

async function notify(channel: 'whatsapp' | 'sms', phone: string, text: string): Promise<void> {
  if (channel === 'whatsapp') {
    const result = await sendWhatsAppText(phone, text);
    if (!result.ok) {
      console.error('Failed to send WhatsApp follow-up:', result.error);
    }
  } else {
    // No outbound Twilio credentials are configured yet — SMS follow-ups for
    // PLAN/OCR results can't be delivered until that's wired up.
    console.warn('SMS follow-up not sent (outbound SMS not configured):', text);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * Handle an incoming message from WhatsApp or SMS.
 * Manages conversation state machine, updates user profile, and returns reply text.
 *
 * @param channel - 'whatsapp' or 'sms'
 * @param phone - E.164 phone number (e.g., +919876543210)
 * @param messageText - Text content of the message (null if media-only)
 * @param media - Already-downloaded image bytes (null if text-only). The
 *                caller downloads, because each channel authenticates its
 *                media differently (Meta bearer token vs Twilio basic auth).
 * @returns Reply text to send back to the user
 */
export async function handleIncomingMessage(
  channel: 'whatsapp' | 'sms',
  phone: string,
  messageText: string | null,
  media: InboundMedia | null
): Promise<string> {
  // ── 1. Upsert user ────────────────────────────────────────────────────────
  let user: { id: string; language: string; name: string | null } | null = null;

  const { data: existingUser, error: userError } = await supabaseServer
    .from('users')
    .select('id, language, name')
    .eq('phone', phone)
    .single();

  if (userError && userError.code !== 'PGRST116') {
    // PGRST116 = no rows found
    console.error('Error fetching user:', userError);
  }

  if (!existingUser) {
    // Create new user
    const { data: newUser, error: createError } = await supabaseServer
      .from('users')
      .insert({ phone, language: 'hi', role: 'entrepreneur' })
      .select('id, language, name')
      .single();

    if (createError || !newUser) {
      console.error('Failed to create user:', createError);
      return 'System error. Please try again.';
    }
    user = newUser;
  } else {
    user = existingUser;
  }

  // Stored preference is the starting point; the message itself can override
  // it below. On WhatsApp/SMS there is no toggle to press, so the default of
  // 'hi' set at row creation would otherwise answer every English speaker in
  // Hindi forever.
  let lang = user.language || 'hi';

  // ── 2. Fetch or create conversation ──────────────────────────────────────
  interface ConversationRecord {
    id: string;
    state: string;
    context: ConversationContext;
  }

  let conversation: ConversationRecord;

  const { data: existingConv } = await supabaseServer
    .from('conversations')
    .select('id, state, context')
    .eq('user_id', user.id)
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!existingConv) {
    const { data: newConv, error: convCreateError } = await supabaseServer
      .from('conversations')
      .insert({
        user_id: user.id,
        channel,
        state: 'idle',
        context: {},
      })
      .select('id, state, context')
      .single();

    if (convCreateError || !newConv) {
      console.error('Failed to create conversation:', convCreateError);
      return 'System error. Please try again.';
    }
    conversation = newConv as unknown as ConversationRecord;
  } else {
    conversation = existingConv as unknown as ConversationRecord;
  }

  const state = (conversation.state || 'idle') as ConversationState;
  const context: ConversationContext = (conversation.context as ConversationContext) || {};

  /**
   * Update conversation state and context in the database.
   */
  async function updateConversation(
    newState: ConversationState,
    newContext: ConversationContext
  ): Promise<void> {
    await supabaseServer
      .from('conversations')
      .update({
        state: newState,
        context: newContext,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation!.id);
  }

  // ── 3a. Voice notes — transcribe, then continue as if it were typed ──────
  // WhatsApp `audio` messages used to be dropped on the floor: no OCR branch
  // matched them, so the sender received no reply at all.
  let voiceTranscript: string | null = null;

  if (media?.kind === 'audio') {
    const transcription = await transcribeAudio(media.buffer, media.mimeType);

    if (!transcription) {
      return t(lang, 'voice_failed');
    }

    voiceTranscript = transcription.text;
  }

  // ── 3b. Handle OCR (media) — available in any state ──────────────────────
  // This used to answer "reading your bill…" and then discard the image: no
  // OCR was ever run on the WhatsApp path and no reply ever followed. Now the
  // photo is read inline and the entries are staged (unconfirmed) exactly as
  // the web upload stages them.
  if (media?.kind === 'image') {
    try {
      const result = await runLedgerOcr(media.buffer, user.id, 'whatsapp');

      if (result.parsedEntries.length === 0) {
        return t(lang, 'ocr_none');
      }

      const lines = result.parsedEntries
        .slice(0, 8)
        .map((entry) => {
          const sign = entry.entry_type === 'income' ? '+' : '−';
          const label =
            lang === 'hi'
              ? entry.entry_type === 'income'
                ? 'आय'
                : 'खर्च'
              : entry.entry_type === 'income'
                ? 'income'
                : 'expense';
          return `${sign} ₹${entry.amount.toLocaleString('en-IN')} — ${entry.description} (${label})`;
        })
        .join('\n');

      const more = result.parsedEntries.length > 8
        ? `\n… +${result.parsedEntries.length - 8}`
        : '';

      const header =
        lang === 'hi'
          ? `📄 आपके बही-खाते से ${result.parsedEntries.length} एंट्री मिलीं:`
          : `📄 Found ${result.parsedEntries.length} entries in your notebook:`;

      const totals =
        lang === 'hi'
          ? `\n\nकुल आय ₹${result.totals.income.toLocaleString('en-IN')} · कुल खर्च ₹${result.totals.expense.toLocaleString('en-IN')}`
          : `\n\nTotal income ₹${result.totals.income.toLocaleString('en-IN')} · Total expenses ₹${result.totals.expense.toLocaleString('en-IN')}`;

      const footer =
        lang === 'hi'
          ? '\n\n✅ ये एंट्री जाँच के लिए सेव हो गई हैं। डैशबोर्ड पर देखकर पक्का करें।'
          : '\n\n✅ Saved for review. Open your dashboard to check and confirm them.';

      return `${header}\n${lines}${more}${totals}${footer}`;
    } catch (err) {
      if (err instanceof OcrFailedError) {
        return t(lang, 'ocr_error');
      }
      console.error('WhatsApp OCR handling failed:', err);
      return t(lang, 'ocr_error');
    }
  }

  const text = (voiceTranscript || messageText || '').trim();

  // Answer in the language the user actually just used. A confident reading
  // is also stored, so the next message starts in the right language; an
  // unconfident one ("haan", "15000") steers this reply only and never
  // rewrites the preference.
  if (text) {
    const detected = detectMessageLanguage(text);

    if (detected.language !== lang) {
      lang = detected.language;

      if (detected.confident) {
        const { error: langError } = await supabaseServer
          .from('users')
          .update({ language: detected.language })
          .eq('id', user.id);

        if (langError) {
          // Non-fatal: this turn still answers in the detected language.
          console.warn('Could not persist detected language:', langError);
        }
      }
    }
  }

  /** Prefix replies to a voice note with what we heard, so it can be corrected. */
  const echo = (reply: string) =>
    voiceTranscript ? `${t(lang, 'voice_heard')} "${voiceTranscript}"\n\n${reply}` : reply;

  // ── 4. State machine ──────────────────────────────────────────────────────

  switch (state) {
    // ── idle: First contact — greet and ask for sector ──────────────────────
    case 'idle': {
      await updateConversation('awaiting_sector', context);
      return echo(greet(lang));
    }

    // ── awaiting_sector ──────────────────────────────────────────────────────
    case 'awaiting_sector': {
      if (!text) {
        return echo(t(lang, 'ask_sector'));
      }
      const newContext = { ...context, sector: text };
      await updateConversation('awaiting_district', newContext);
      return echo(t(lang, 'ask_district'));
    }

    // ── awaiting_district ────────────────────────────────────────────────────
    case 'awaiting_district': {
      if (!text) {
        return echo(t(lang, 'ask_district'));
      }
      const newContext = { ...context, district: text };
      await updateConversation('awaiting_revenue', newContext);
      return echo(t(lang, 'ask_revenue'));
    }

    // ── awaiting_revenue ─────────────────────────────────────────────────────
    case 'awaiting_revenue': {
      const amount = parseAmount(text);
      if (amount === null) {
        return echo(t(lang, 'invalid_number'));
      }
      const newContext = { ...context, monthly_revenue: amount };
      await updateConversation('awaiting_expenses', newContext);
      return echo(t(lang, 'ask_expenses'));
    }

    // ── awaiting_expenses ────────────────────────────────────────────────────
    case 'awaiting_expenses': {
      const amount = parseAmount(text);
      if (amount === null) {
        return echo(t(lang, 'invalid_number'));
      }
      const newContext = { ...context, monthly_expense: amount };
      await updateConversation('awaiting_loans', newContext);
      return echo(t(lang, 'ask_loans'));
    }

    // ── awaiting_loans — final onboarding step ───────────────────────────────
    case 'awaiting_loans': {
      const hasLoans = parseYesNo(text);
      if (hasLoans === null) {
        return echo(t(lang, 'invalid_yesno'));
      }

      const newContext = { ...context, existing_loans: hasLoans };

      // business_profiles.user_id has no UNIQUE/exclusion constraint, so
      // `.upsert(..., { onConflict: 'user_id' })` fails every time with
      // "there is no unique or exclusion constraint matching the ON CONFLICT
      // specification". Look the row up first and insert or update explicitly.
      const profilePayload = {
        sector: newContext.sector,
        district: newContext.district,
        monthly_revenue_est: newContext.monthly_revenue,
        monthly_expense_est: newContext.monthly_expense,
        existing_loans: newContext.existing_loans,
        updated_at: new Date().toISOString(),
      };

      const { data: existingProfile } = await supabaseServer
        .from('business_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      const { error: profileError } = existingProfile
        ? await supabaseServer
            .from('business_profiles')
            .update(profilePayload)
            .eq('user_id', user.id)
        : await supabaseServer
            .from('business_profiles')
            .insert({ ...profilePayload, user_id: user.id });

      if (profileError) {
        console.error('Failed to save business profile:', profileError);
      }

      await updateConversation('complete', newContext);
      return echo(t(lang, 'complete'));
    }

    // ── complete — handle PLAN command or other messages ─────────────────────
    case 'complete': {
      const upperText = text.toUpperCase().trim();

      // Trigger plan generation
      if (upperText === 'PLAN' || upperText === 'PLAN CHAHIYE' || upperText === 'प्लान') {
        const generatingMsg = t(lang, 'plan_generating');

        // Run plan generation asynchronously and deliver the result as a follow-up
        callPlanGenerate(user.id)
          .then((summaryText) => notify(channel, phone, summaryText || t(lang, 'plan_error')))
          .catch((err) => {
            console.error('Plan generation failed for user:', user!.id, err);
            notify(channel, phone, t(lang, 'plan_error'));
          });

        return echo(generatingMsg);
      }

      // Media handled above; any other text gets plan reminder
      const planReminder =
        lang === 'hi'
          ? 'अपना वित्तीय प्लान देखने के लिए *PLAN* भेजें, या बिल की फोटो भेजें।'
          : 'Send *PLAN* to see your financial plan, or send a photo of your bill.';
      return echo(planReminder);
    }

    default: {
      await updateConversation('idle', {});
      return echo(greet(lang));
    }
  }
}
